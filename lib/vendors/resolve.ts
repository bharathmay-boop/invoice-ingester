import type pg from "pg";
import { normalizeAddress, normalizeName, normalizeTaxId } from "./normalize.ts";
import { normalize } from "../items/normalize.ts";

/**
 * Resolve the supplier a reviewed contract is with, when the reviewer said the
 * supplier is new.
 *
 * This exists apart from the server action because it is the point where a
 * contract can end up attached to the wrong supplier, and that is only worth
 * trusting with a test on a real database behind it. The server action cannot
 * be reached from a test: it reads cookies.
 *
 * The reuse rule is the part that matters. `vendor.normalized_name` is built
 * with the item normaliser, which drops words like "quality" and sorts the
 * rest, so "Jain Quality Traders" and "Jain Traders" land on the same key and
 * the unique index treats them as one supplier. Reusing on that alone would
 * take a contract the reviewer said was for a new supplier and quietly attach
 * it to an existing one, renaming that supplier on the way through. So an
 * insert that conflicts is only accepted as the same supplier when the printed
 * names also match under `normalizeName`, and otherwise the reviewer is asked
 * to choose, by name, rather than guessed at.
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
  input: VendorInput,
): Promise<Resolved> {
  const { name, address, taxId, taxIdKind } = input;

  // A tax registration is the supplier's identity, so a conflict on it is the
  // same supplier by definition and the typed spelling wins. Unchanged.
  if (taxId) {
    const rows = await client.query<{ id: string }>(
      `INSERT INTO vendor (tax_id, tax_id_kind, normalized_tax_id, name,
                           normalized_name, address, normalized_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (tax_id_kind, normalized_tax_id) WHERE tax_id IS NOT NULL
       DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [
        taxId,
        taxIdKind,
        normalizeTaxId(taxId),
        name,
        normalize(name),
        address || null,
        normalizeAddress(address),
      ],
    );
    return { ok: true, id: rows.rows[0].id };
  }

  const normalizedName = normalize(name);
  const normalizedAddress = normalizeAddress(address);

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
  if (!row) {
    return { ok: false, message: "That supplier could not be saved. Try again." };
  }

  if (normalizeName(row.name) !== normalizeName(name)) {
    return {
      ok: false,
      message:
        `"${row.name}" is already saved at this address, and this product cannot tell ` +
        `it apart from "${name}". Saving would rename it and attach the contract to ` +
        `it. Pick "${row.name}" from the supplier list if that is who signed this ` +
        `contract, or give the new supplier an address that tells them apart.`,
    };
  }

  // Same supplier, spelled differently. The reviewer has the contract open, so
  // their spelling replaces the stored one.
  await client.query(`UPDATE vendor SET name = $2 WHERE id = $1`, [row.id, name]);
  return { ok: true, id: row.id };
}
