-- The period a reviewer confirms is stored on the contract (#118).
--
-- Until now the reviewer was made to enter a start date and it was then thrown
-- away: `effective_from = COALESCE(effective_from, $3)` did nothing, because the
-- column was NOT NULL and already held whatever the model read. Coverage was
-- inferred from rate rows alone, so a reviewed contract with no rates looked
-- exactly like no contract at all.
ALTER TABLE contract
  ADD COLUMN effective_from date,
  ADD COLUMN effective_to   date,
  ADD CONSTRAINT contract_period_order
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from);

-- A rate the model found with no date of its own, on a contract with none
-- either, used to be dropped without a word. It is kept now and takes the
-- period the reviewer confirms. Until then it has no start, and the lookup only
-- ever sees reviewed rates, so the constraint is what keeps that true.
ALTER TABLE contract_rate ALTER COLUMN effective_from DROP NOT NULL;
ALTER TABLE contract_rate
  ADD CONSTRAINT contract_rate_reviewed_has_start
    CHECK (NOT reviewed OR effective_from IS NOT NULL);

-- Contracts reviewed before this existed keep no period, on purpose. Their
-- coverage is what their rate rows say it is, gaps included: a contract with
-- rates for January to March and July to December does not cover April, and a
-- single span taken from the earliest start and latest end would say it did.
-- Their rates also need not be consistent with each other, so deriving one
-- could break the order check above. A period is only ever what a person
-- confirmed, and these were confirmed before it was stored.
