-- Borderline item matches, waiting for a person to say yes or no.
--
-- A line item scoring between the two thresholds is neither the same product
-- nor clearly a different one. Linking it silently would merge two things on a
-- guess; creating a new item would split a price history on the same guess.
-- So it is recorded here, the line stays unlinked, and someone decides.
--
-- One row per line item: a line has one best candidate, and asking twice about
-- the same line is how a queue becomes noise. A rejection stays as a row so it
-- is not asked again.
CREATE TABLE match_suggestion (
  line_item_id uuid PRIMARY KEY REFERENCES line_item (id) ON DELETE CASCADE,
  item_id      uuid NOT NULL REFERENCES item (id) ON DELETE CASCADE,
  score        numeric(4,3) NOT NULL,
  decision     text CHECK (decision IN ('accepted', 'rejected')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz
);

-- The queue reads the undecided ones, oldest first.
CREATE INDEX match_suggestion_waiting ON match_suggestion (created_at) WHERE decision IS NULL;
