-- One vendor per name among vendors with no GSTIN.
--
-- A GSTIN is the vendor's identity where there is one. Without one, the save
-- path used to create a new vendor every time, so the invoice table's
-- UNIQUE (vendor_id, invoice_number) never saw the same supplier twice and the
-- same invoice could be saved over and over. With this index the save reuses
-- the vendor, and the existing constraint catches the repeat. An index rather
-- than a lookup in code, because two saves at once would both find nothing and
-- both insert.
CREATE UNIQUE INDEX vendor_name_without_gstin ON vendor (normalized_name) WHERE gstin IS NULL;
