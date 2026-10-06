-- Mark a contract as part of the demo set, the same as vendor, item and
-- invoice already are.
--
-- The seed is safe to re-run because it deletes only the rows it wrote, and it
-- had no way to tell a demo contract from one somebody uploaded. Without this
-- the choice was deleting every contract on a reseed or leaving the demo ones
-- behind to pile up.
--
-- Rates need no column of their own: contract_rate cascades from contract.
ALTER TABLE contract
  ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
