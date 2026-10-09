import type pg from "pg";
import { normalizeAddress, normalizeName, normalizeTaxId } from "./normalize.ts";

/**
 * Resolve the supplier a reviewed contract is with, when the reviewer said the
 * supplier is new.
 *
 * It lives apart from the server action so a test can reach it; the action
 * reads cookies. With the current key a conflict is a real match, since two
 * rows share a key only when the printed names are the same words (#217). The
 * printed names are still compared on a tax-free conflict, because a row saved
 * before the fix keeps its old key until `npm run rekey-vendors` has run, and
 * an old key such as "jain traders" belongs to "Jain Quality Traders" too.
 * Taking that as a match would attach the contract to, and rename, a supplier
 * the reviewer never chose. So a mismatch is refused, naming the supplier
 * already saved, and the choice is left to the person with the contract open.
 */
export type VendorInput = {
  name: string;
  address: string;
  taxId: string;
  taxIdKind: string;
};

export type Resolved = { ok: true; id: string } | { ok: false; message: string };

type Client = Pick<pg.PoolClient, "query">;

export async function resolveNewContractVendor(
  client: Client,
  { name, address, taxId, taxIdKind }: VendorInput,
): Promise<Resolved> {
  const normalizedName = normalizeName(name);
  const normalizedAddress = normalizeAddress(address);

  // A tax registration is the supplier's identity, so a conflict on it is the
  // same supplier whatever the name says, and the typed spelling wins.
  if (taxId) {
    const rows = await client.query<{ id: string }>(
      `INSERT INTO vendor (tax_id, tax_id_kind, normalized_tax_id, name,
                           normalized_name, address, normalized_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (tax_id_kind, normalized_tax_id) WHERE tax_id IS NOT NULL
       DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [taxId, taxIdKind, normalizeTaxId(taxId), name, normalizedName, address || null, normalizedAddress],
    );
    return { ok: true, id: rows.rows[0].id };
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO vendor (name, normalized_name, address, normalized_address)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (normalized_name, normalized_address) WHERE tax_id IS NULL
     DO NOTHING RETURNING id`,
    [name, normalizedName, address || null, normalizedAddress],
  );
  if (inserted.rows.length) return { ok: true, id: inserted.rows[0].id };

  const existing = await client.query<{ id: string; name: string }>(
    `SELECT id, name FROM vendor
     WHERE tax_id IS NULL AND normalized_name = $1 AND normalized_address = $2`,
    [normalizedName, normalizedAddress],
  );
  const row = existing.rows[0];
  if (!row) return { ok: false, message: "That supplier could not be saved. Try again." };

  if (normalizeName(row.name) !== normalizedName) {
    return {
      ok: false,
      message:
        `"${row.name}" is already saved at this address under an older key, and saving ` +
        `"${name}" would rename it and attach the contract to it. Pick "${row.name}" ` +
        `from the supplier list if that is who signed this contract, or run ` +
        `rekey-vendors and try again.`,
    };
  }

  await client.query(`UPDATE vendor SET name = $2 WHERE id = $1`, [row.id, name]);
  return { ok: true, id: row.id };
}
