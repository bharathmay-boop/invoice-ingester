-- Marks rows that came from the demo seed, so resetting the demo cannot take
-- real invoices with it. Everything not seeded defaults to false.
ALTER TABLE vendor  ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE item    ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE invoice ADD COLUMN is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX invoice_demo ON invoice (is_demo) WHERE is_demo;
