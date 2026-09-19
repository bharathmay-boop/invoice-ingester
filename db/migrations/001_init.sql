-- Invoice ingester v1 schema. See docs/spec.md section 4.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE vendor (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gstin           text UNIQUE,
  name            text NOT NULL,
  normalized_name text NOT NULL,
  address         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE item (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name  text NOT NULL,
  normalized_name text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Trigram matching runs in Postgres, so the index is the matching engine.
CREATE INDEX item_normalized_name_trgm ON item USING gin (normalized_name gin_trgm_ops);

CREATE TABLE invoice (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id       uuid NOT NULL REFERENCES vendor (id),
  invoice_number  text NOT NULL,
  invoice_date    date NOT NULL,
  subtotal        numeric(14,2) NOT NULL,
  cgst            numeric(14,2) NOT NULL DEFAULT 0,
  sgst            numeric(14,2) NOT NULL DEFAULT 0,
  igst            numeric(14,2) NOT NULL DEFAULT 0,
  total           numeric(14,2) NOT NULL,
  blob_url        text,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'needs_review', 'confirmed')),
  extraction_meta jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Duplicate detection is a constraint, not a feature someone has to remember.
  UNIQUE (vendor_id, invoice_number)
);

CREATE INDEX invoice_vendor_date ON invoice (vendor_id, invoice_date DESC);

CREATE TABLE line_item (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       uuid NOT NULL REFERENCES invoice (id) ON DELETE CASCADE,
  raw_description  text NOT NULL,
  hsn_code         text,
  quantity         numeric(12,3) NOT NULL,
  unit             text,
  unit_price       numeric(14,4) NOT NULL,
  amount           numeric(14,2) NOT NULL,
  -- Nullable on purpose: an unmatched line still saves, it just has no price
  -- history yet. Ingestion never waits on matching.
  item_id          uuid REFERENCES item (id),
  match_confidence numeric(4,3)
);

CREATE INDEX line_item_invoice ON line_item (invoice_id);
CREATE INDEX line_item_item ON line_item (item_id) WHERE item_id IS NOT NULL;
