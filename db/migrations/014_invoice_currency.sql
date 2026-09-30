-- Every historical invoice is in rupees, so the migration can give old rows a
-- truthful currency without inventing one for a document nobody has read yet.
--
-- Only the currencies the product can price and compare are accepted. Free
-- text would turn a typo into a second currency and split histories that
-- should have been compared together.
ALTER TABLE invoice
  ADD COLUMN currency text NOT NULL DEFAULT 'INR'
  CHECK (currency IN ('INR', 'USD', 'EUR'));

-- The default is meant for the backfill and nothing else: an INSERT that falls
-- back on it turns an unreadable currency into rupees without telling anyone,
-- which is the silent wrong answer this column exists to prevent.
--
-- Dropping it here would do that at the database level, which is the better
-- place for it, but it cannot be dropped in this migration. `npm run migrate`
-- is run by hand against the live database and nothing in the build runs it, so
-- migrations land before the deploy that needs them. A dropped default would
-- mean every save from the currently deployed build failing on a column it does
-- not know to write, until the deploy caught up.
--
-- So the guarantee is in the extraction schema for now, where currency is
-- required rather than defaulted, and the default comes off in a later
-- migration once the build that always writes it is live. See the follow-up
-- issue on this one.
