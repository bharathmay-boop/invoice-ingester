-- A seventh answer: the rate and the line are in different currencies.
--
-- Until now the comparison never looked at currency, so a rate agreed in one
-- and a line billed in another were subtracted from each other and the gap was
-- reported as money. Nothing else in the product does that: comparePrices
-- refuses the pair and the findings totals are grouped by currency.
--
-- Widening a CHECK is safe in either direction of the deploy: the code on main
-- writes a subset of what this allows, and the new code cannot write the tag
-- until this has run.
ALTER TABLE line_item DROP CONSTRAINT IF EXISTS line_item_variance_tag_check;

ALTER TABLE line_item
  ADD CONSTRAINT line_item_variance_tag_check
  CHECK (variance_tag IS NULL OR variance_tag IN (
    'matches_contract', 'billed_above_contract', 'billed_below_contract',
    'outside_contract_period', 'not_in_contract', 'units_differ',
    'currency_differs'));
