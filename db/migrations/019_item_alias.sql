-- Trigram matching scores two names by the letters they share, so it cannot
-- learn. "Xerox" and "photocopy" are the same product to a buyer and share
-- almost nothing as strings, and no threshold reaches that: lowering it enough
-- to join them joins a great many things that are not the same product.
--
-- An alias is a person saying so once. From then on the name is matched like
-- any other name the item has, through the same trigram search rather than
-- beside it, so an alias of "photocopy" also catches "photocopy a4 80gsm"
-- without anybody having to record every spelling.
CREATE TABLE item_alias (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         uuid NOT NULL REFERENCES item (id) ON DELETE CASCADE,
  -- As the person typed it, so a screen can show what they meant.
  alias           text NOT NULL,
  normalized_name text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- One alias cannot mean two products. If it could, a line matching it would
  -- have no answer, and the point of an alias is to remove a guess rather than
  -- add one. A constraint rather than a check in code, because two saves at
  -- once would both find nothing and both insert.
  UNIQUE (normalized_name)
);

-- The matching engine is the index, same as for item itself.
CREATE INDEX item_alias_trgm ON item_alias USING gin (normalized_name gin_trgm_ops);
CREATE INDEX item_alias_item ON item_alias (item_id);
