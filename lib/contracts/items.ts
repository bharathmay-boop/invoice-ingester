import "server-only";
import type pg from "pg";
import { normalize } from "../items/normalize.ts";
import { nearMisses } from "../items/near.ts";

export type ResolveResult = { ok: true } | { ok: false; message: string };

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
  const { rows: rates } = await client.query<{
    id: string;
    printed_name: string;
    item_id: string | null;
    new_item_name: string | null;
  }>(
    `SELECT id, printed_name, item_id, new_item_name
     FROM contract_rate WHERE contract_id = $1 ORDER BY printed_name`,
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
    const key = normalize(name);
    // An item already called exactly that is that item, not a second one.
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM item WHERE normalized_name = $1 ORDER BY created_at LIMIT 1",
      [key],
    );
    const itemId =
      existing.rows[0]?.id ??
      (
        await client.query<{ id: string }>(
          "INSERT INTO item (canonical_name, normalized_name) VALUES ($1,$2) RETURNING id",
          [name, key],
        )
      ).rows[0].id;
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
