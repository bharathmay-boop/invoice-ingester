-- A rate the catalogue does not have yet becomes a new item when the contract is
-- confirmed (#149). The reviewer may rename it first, since a printed name is
-- often longer than a catalogue name wants to be, so the name they chose has to
-- be kept somewhere until then. Nothing is created in the catalogue before the
-- contract is confirmed, so nothing happens by surprise.
--
-- Null means no decision was made. Only a rate with no item can carry a name.
ALTER TABLE contract_rate
  ADD COLUMN new_item_name text,
  ADD CONSTRAINT contract_rate_new_item_unlinked
    CHECK (new_item_name IS NULL OR item_id IS NULL);
