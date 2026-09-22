-- One vendor per name among vendors with no GSTIN.
--
-- A GSTIN is the vendor's identity where there is one. Without one, the save
-- path used to create a new vendor every time, so the invoice table's
-- UNIQUE (vendor_id, invoice_number) never saw the same supplier twice and the
-- same invoice could be saved over and over. With this index the save reuses
-- the vendor, and the existing constraint catches the repeat. An index rather
-- than a lookup in code, because two saves at once would both find nothing and
-- both insert.
--
-- A database written by the old save path can already hold several vendors per
-- name, and the index cannot be built over them. They are renamed apart rather
-- than merged: two suppliers with no GSTIN and the same name may be different
-- businesses, and a migration has no way to tell, so no invoice changes vendor.
-- The oldest keeps the name, and so the new invoices that match it.
UPDATE vendor v
SET normalized_name = v.normalized_name || ' (separate ' || left(v.id::text, 8) || ')'
WHERE v.gstin IS NULL
  AND EXISTS (
    SELECT 1 FROM vendor k
    WHERE k.gstin IS NULL AND k.normalized_name = v.normalized_name
      AND (k.created_at, k.id) < (v.created_at, v.id)
  );

CREATE UNIQUE INDEX vendor_name_without_gstin ON vendor (normalized_name) WHERE gstin IS NULL;
