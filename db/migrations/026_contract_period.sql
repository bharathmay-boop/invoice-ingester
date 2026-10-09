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

-- Contracts reviewed before this existed: the span of their rates is the period
-- they were already being checked over, so behaviour does not change. An open
-- ended rate makes the contract open ended. A reviewed contract with no rates
-- has nothing to take a period from, and stays without one.
UPDATE contract c
SET effective_from = r.first_start,
    effective_to   = r.last_end
FROM (
  SELECT contract_id,
         min(effective_from) AS first_start,
         CASE WHEN bool_or(effective_to IS NULL) THEN NULL ELSE max(effective_to) END AS last_end
  FROM contract_rate
  GROUP BY contract_id
) r
WHERE c.id = r.contract_id AND c.status = 'reviewed' AND r.first_start IS NOT NULL;
