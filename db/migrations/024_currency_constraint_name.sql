-- The currency CHECK on invoice, given a name it can be looked up by.
--
-- Migration 014 created it inline with ADD COLUMN, so it carries whatever name
-- Postgres generated. That works until something wants to read it back, which
-- is exactly what the test added alongside this migration does: it compares the
-- constraint in the database against CURRENCIES in lib/money/currencies.ts, so
-- a currency added to the code and not the database fails the suite instead of
-- failing a customer's save.
--
-- Same three currencies. This changes no row and rejects nothing it did not
-- reject yesterday. It only gives the rule a name.
ALTER TABLE invoice DROP CONSTRAINT IF EXISTS invoice_currency_check;

ALTER TABLE invoice
  ADD CONSTRAINT invoice_currency_check CHECK (currency IN ('INR', 'USD', 'EUR'));
