-- An extracted invoice that has not been confirmed yet.
--
-- Kept apart from `invoice` on purpose: a draft has no vendor yet, and
-- invoice.vendor_id is NOT NULL. Writing half an invoice into the real table
-- and tidying it up later is how a spend total ends up counting something
-- nobody ever confirmed.
CREATE TABLE draft (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blob_url        text NOT NULL,
  file_name       text NOT NULL,
  content_type    text NOT NULL,
  extracted       jsonb NOT NULL,
  discrepancies   jsonb NOT NULL DEFAULT '[]'::jsonb,
  status          text NOT NULL
                  CHECK (status IN ('needs_review', 'checks_passed')),
  extraction_meta jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX draft_created ON draft (created_at DESC);
