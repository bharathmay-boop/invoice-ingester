import type pg from "pg";
import { normalizeAddress, normalizeName, normalizeTaxId } from "./normalize.ts";

/**
 * Resolve the supplier a reviewed contract is with, when the reviewer said the
 * supplier is new.
 *
 * It lives apart from the server action so a test can reach it; the action
 * reads cookies. A conflict here is a real match: the key is the name with
 * only case, punctuation and spacing removed, so two rows share it only when
 * the printed names are the same words. That was not always true, #217.
 * The typed spelling replaces the stored one, since the reviewer has the
 * contract open.
 */
export type VendorInput = {
  name: string;
  address: string;
  taxId: string;
  taxIdKind: string;
};

type Client = Pick<pg.PoolClient, "query">;

export async function resolveNewContractVendor(
  client: Client,
  { name, address, taxId, taxIdKind }: VendorInput,
): Promise<string> {
  const rows = taxId
    ? await client.query<{ id: string }>(
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
          normalizeName(name),
          address || null,
          normalizeAddress(address),
        ],
      )
    : await client.query<{ id: string }>(
        `INSERT INTO vendor (name, normalized_name, address, normalized_address)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (normalized_name, normalized_address) WHERE tax_id IS NULL
         DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [name, normalizeName(name), address || null, normalizeAddress(address)],
      );
  return rows.rows[0].id;
}
