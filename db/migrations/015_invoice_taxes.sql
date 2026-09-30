-- Tax labels belong to the invoice that was read. A country code could not
-- describe a VAT line, a US sales tax line, or a GST invoice without first
-- making a guess that could be wrong.
--
-- The old Indian columns are deliberately left in place for this migration.
-- `scripts/migrate.mjs` is run by hand against the live database, and the
-- currently deployed build still writes those columns. Removing them before
-- that build has stopped writing them would make every save fail. They become
-- redundant in a later migration once this code is live.
ALTER TABLE invoice
  ADD COLUMN taxes jsonb NOT NULL DEFAULT '[]';

-- Only nonzero rows are carried over. A zero was an input convention, not a
-- tax line that appeared on one of the historical invoices. The old columns
-- never stored rates, so the new rows must leave rate null rather than infer a
-- rate from the label or the amount.
-- Written as three concatenated cases rather than aggregating over a VALUES
-- list. A VALUES list inside a correlated subquery cannot reach the row being
-- updated without LATERAL, and a migration is the worst place to find out
-- whether a clever query plans. This form has nothing to get wrong.
UPDATE invoice
SET taxes =
  CASE WHEN cgst > 0
    THEN jsonb_build_array(jsonb_build_object('label', 'CGST', 'rate', NULL, 'amount', cgst, 'included', false))
    ELSE '[]'::jsonb END
  ||
  CASE WHEN sgst > 0
    THEN jsonb_build_array(jsonb_build_object('label', 'SGST', 'rate', NULL, 'amount', sgst, 'included', false))
    ELSE '[]'::jsonb END
  ||
  CASE WHEN igst > 0
    THEN jsonb_build_array(jsonb_build_object('label', 'IGST', 'rate', NULL, 'amount', igst, 'included', false))
    ELSE '[]'::jsonb END;

-- A malformed value is a data problem that should fail at the boundary rather
-- than turn the arithmetic check into a reason to guess which tax was charged.
ALTER TABLE invoice
  ADD CONSTRAINT invoice_taxes_is_array
  CHECK (jsonb_typeof(taxes) = 'array');
