-- What a contract says about a line, stored on the line.
--
-- A tag is a pure function of the line, the reviewed rates and the tolerance,
-- so storing it is a cache with three invalidations: an invoice is saved, a
-- contract is reviewed, or the tolerance setting moves. One function writes
-- these and nothing else does, because the alternative is four code paths
-- disagreeing about the same row.
ALTER TABLE line_item
  ADD COLUMN variance_tag text
    CHECK (variance_tag IS NULL OR variance_tag IN (
      'matches_contract', 'billed_above_contract', 'billed_below_contract',
      'outside_contract_period', 'not_in_contract', 'units_differ')),
  -- The agreed figure and what it costs, kept so a findings screen can sort by
  -- money without recomputing every row it shows.
  ADD COLUMN variance_contracted numeric(14,4),
  ADD COLUMN variance_impact numeric(14,2),
  ADD COLUMN variance_reason text;

-- The findings screen reads this: everything with something to say, worst
-- first. Partial, because most lines have nothing to say and an index over
-- them would be mostly nulls.
CREATE INDEX line_item_variance
  ON line_item (variance_tag, variance_impact DESC)
  WHERE variance_tag IS NOT NULL AND variance_tag <> 'matches_contract';
