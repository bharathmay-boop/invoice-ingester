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
-- name, and the index cannot be built over them. They are merged into the
-- oldest first. An invoice whose number the merged vendor already has is a
-- duplicate the old path let through: it stays where it is, not deleted, on a
-- vendor renamed so the index allows it and a person can find it and decide.

DO $$
DECLARE
  inv record;
  keeper uuid;
BEGIN
  FOR inv IN
    SELECT i.id, i.invoice_number, v.id AS vendor_id, v.normalized_name
    FROM invoice i JOIN vendor v ON v.id = i.vendor_id
    WHERE v.gstin IS NULL
    ORDER BY v.created_at, v.id, i.created_at
  LOOP
    SELECT id INTO keeper FROM vendor
    WHERE gstin IS NULL AND normalized_name = inv.normalized_name
    ORDER BY created_at, id LIMIT 1;

    IF keeper <> inv.vendor_id AND NOT EXISTS (
      SELECT 1 FROM invoice WHERE vendor_id = keeper AND invoice_number = inv.invoice_number
    ) THEN
      UPDATE invoice SET vendor_id = keeper WHERE id = inv.id;
    END IF;
  END LOOP;
END $$;

-- Vendors emptied by the merge.
DELETE FROM vendor v
WHERE v.gstin IS NULL
  AND NOT EXISTS (SELECT 1 FROM invoice i WHERE i.vendor_id = v.id)
  AND EXISTS (
    SELECT 1 FROM vendor k
    WHERE k.gstin IS NULL AND k.normalized_name = v.normalized_name
      AND (k.created_at, k.id) < (v.created_at, v.id)
  );

-- Vendors still sharing a name hold only duplicates. Renamed apart, oldest
-- keeps the name.
UPDATE vendor v
SET normalized_name = v.normalized_name || ' (duplicate ' || left(v.id::text, 8) || ')'
WHERE v.gstin IS NULL
  AND EXISTS (
    SELECT 1 FROM vendor k
    WHERE k.gstin IS NULL AND k.normalized_name = v.normalized_name
      AND (k.created_at, k.id) < (v.created_at, v.id)
  );

-- A merged vendor is demo only if everything it now holds is, the same rule
-- 004 used, so resetting the demo never touches a real invoice's vendor.
UPDATE vendor v
SET is_demo = NOT EXISTS (SELECT 1 FROM invoice i WHERE i.vendor_id = v.id AND NOT i.is_demo)
WHERE v.gstin IS NULL AND v.is_demo;

CREATE UNIQUE INDEX vendor_name_without_gstin ON vendor (normalized_name) WHERE gstin IS NULL;
