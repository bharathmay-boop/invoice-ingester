import "server-only";
import type pg from "pg";
import { normalize } from "../items/normalize.ts";
import { nearMisses } from "../items/near.ts";

export type ResolveResult = { ok: true } | { ok: false; message: string };

const UUID = /^[0-9a-f-]{36}$/i;
const UNREADABLE = "An item choice could not be read. Reload the page and try again.";

/**
 * The item choices on screen at the moment Confirm was pressed.
 *
 * Each rate row saves on its own button, so what is displayed and what is
 * stored can differ: a renamed item, or a close match clicked, is only state in
 * the browser until Save. Confirm used to read the stored rows alone and then
 * create an item under the printed name, not the name the screen had promised
 * (#149). The screen now sends every row's current choice with Confirm, and
 * this writes them before anything is resolved.
 */
export async function applyDecisions(
  client: pg.PoolClient,
  contractId: string,
  raw: string[],
): Promise<ResolveResult> {
  for (const entry of raw) {
    let decision: { rateId?: unknown; choice?: unknown; name?: unknown };
    try {
      decision = JSON.parse(entry);
    } catch {
      return { ok: false, message: UNREADABLE };
    }
    const { rateId, choice } = decision;
    const name = typeof decision.name === "string" ? decision.name.trim() : "";
    if (typeof rateId !== "string" || !UUID.test(rateId) || typeof choice !== "string") {
      return { ok: false, message: UNREADABLE };
    }
    if (choice === "new") {
      if (!name) return { ok: false, message: "A new item needs a name." };
      if (name.length > 200) return { ok: false, message: "That item name is too long." };
      await client.query(
        "UPDATE contract_rate SET item_id = NULL, new_item_name = $3 WHERE id = $1 AND contract_id = $2",
        [rateId, contractId, name],
      );
    } else if (UUID.test(choice)) {
      const changed = await client.query(
        `UPDATE contract_rate SET item_id = $3, new_item_name = NULL
         WHERE id = $1 AND contract_id = $2 AND EXISTS (SELECT 1 FROM item WHERE id = $3)`,
        [rateId, contractId, choice],
      );
      if (!changed.rowCount) {
        return { ok: false, message: "An item you picked no longer exists. Reload the page and try again." };
      }
    } else {
      return { ok: false, message: UNREADABLE };
    }
  }
  return { ok: true };
}

/**
 * Give every rate on a contract an item, as part of confirming it (#149).
 *
 * An unmatched rate used to be kept and never looked up, so a contract full of
 * them was confirmed, looked live, and checked nothing. Leaving a rate
 * unmatched is the reviewer saying the catalogue does not have it yet, which
 * is a new item, and it is created here from the printed name or from the
 * name the reviewer chose.
 *
 * What it must not do is make an item that already exists under another name.
 * The matcher leaves a rate unmatched because it scored below the link
 * threshold, not because the thing is absent, so a rate with close matches and
 * no decision from the reviewer stops the confirm and names them. An explicit
 * "new item" is a decision and goes through.
 *
 * Runs in the caller's transaction. Nothing is written to the catalogue unless
 * the whole contract confirms.
 */
export async function resolveRateItems(
  client: pg.PoolClient,
  contractId: string,
  suggest: number,
): Promise<ResolveResult> {
  // Locked, so a correction saved on another screen while this runs waits for
  // it instead of being overwritten by what was read a moment earlier. The
  // correction's own UPDATE takes the same row lock, which fixes the order.
  const { rows: rates } = await client.query<{
    id: string;
    printed_name: string;
    item_id: string | null;
    new_item_name: string | null;
  }>(
    `SELECT id, printed_name, item_id, new_item_name
     FROM contract_rate WHERE contract_id = $1 ORDER BY printed_name FOR UPDATE`,
    [contractId],
  );

  const undecided: string[] = [];
  const toCreate: { id: string; name: string }[] = [];

  for (const rate of rates) {
    if (rate.item_id) continue;
    if (rate.new_item_name) {
      toCreate.push({ id: rate.id, name: rate.new_item_name });
      continue;
    }
    const near = await nearMisses(client, rate.printed_name, suggest, 1);
    if (near.length) {
      undecided.push(
        `"${rate.printed_name}" looks like ${near[0].name} (${Math.round(near[0].score * 100)}%)`,
      );
    } else {
      toCreate.push({ id: rate.id, name: rate.printed_name });
    }
  }

  if (undecided.length) {
    return {
      ok: false,
      message:
        `Decide these before confirming. Pick the item if it is the same thing, or choose ` +
        `"New item" if it is not: ${undecided.join("; ")}.`,
    };
  }

  for (const { id, name } of toCreate) {
    const itemId = await itemNamed(client, name);
    await client.query(
      "UPDATE contract_rate SET item_id = $2, new_item_name = NULL WHERE id = $1",
      [id, itemId],
    );
  }

  // Teach the matcher what the contract called each item, so the next contract
  // from this supplier finds it. Skipped without complaint when the name is the
  // item's own, already an alias, or already belongs to another item: an alias
  // is a convenience, and refusing a confirm over one would be the wrong trade.
  const { rows: linked } = await client.query<{
    printed_name: string;
    item_id: string;
    item_key: string;
  }>(
    `SELECT r.printed_name, r.item_id, i.normalized_name AS item_key
     FROM contract_rate r JOIN item i ON i.id = r.item_id
     WHERE r.contract_id = $1`,
    [contractId],
  );
  for (const { printed_name, item_id, item_key } of linked) {
    const key = normalize(printed_name);
    if (!key || key === item_key) continue;
    const owned = await client.query(
      "SELECT 1 FROM item WHERE normalized_name = $1 AND id <> $2 LIMIT 1",
      [key, item_id],
    );
    if (owned.rows.length) continue;
    await client.query(
      `INSERT INTO item_alias (item_id, alias, normalized_name)
       VALUES ($1,$2,$3) ON CONFLICT (normalized_name) DO NOTHING`,
      [item_id, printed_name, key],
    );
  }
  return { ok: true };
}

/**
 * The item a name means, making it only if nothing already does.
 *
 * "Already does" includes an alias: a name somebody taught the matcher belongs
 * to the item it was taught for, and a second item under it would make every
 * later match pick one and miss the other. The lock is on the name, held to the
 * end of the transaction, because item.normalized_name is not unique and two
 * contracts confirmed together would otherwise both find nothing and both
 * insert.
 */
async function itemNamed(client: pg.PoolClient, name: string): Promise<string> {
  const key = normalize(name);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`item:${key}`]);

  const byName = await client.query<{ id: string }>(
    "SELECT id FROM item WHERE normalized_name = $1 ORDER BY created_at LIMIT 1",
    [key],
  );
  if (byName.rows[0]) return byName.rows[0].id;

  const byAlias = await client.query<{ item_id: string }>(
    "SELECT item_id FROM item_alias WHERE normalized_name = $1",
    [key],
  );
  if (byAlias.rows[0]) return byAlias.rows[0].item_id;

  return (
    await client.query<{ id: string }>(
      "INSERT INTO item (canonical_name, normalized_name) VALUES ($1,$2) RETURNING id",
      [name, key],
    )
  ).rows[0].id;
}
