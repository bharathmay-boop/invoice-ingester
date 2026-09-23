-- Every provider call, kept whatever happens to the draft it produced.
--
-- The same figures go to PostHog, which is where they are read from a phone.
-- They are kept here as well because this is the user's own money: an event can
-- be blocked by an ad blocker, lost on a dropped request, or aged out of a
-- retention window, and none of those should be able to lose the record of
-- what was spent. #41 also needs it offline, to show what a batch will cost
-- before extracting it.
CREATE TABLE extraction_event (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text NOT NULL,
  model         text NOT NULL,
  -- Null when the provider did not report usage, rather than 0, which would
  -- quietly understate a month's spend.
  input_tokens  integer,
  output_tokens integer,
  -- US dollars. Null where the catalogue had no price for the model at the
  -- time of the call.
  cost          numeric(12,6),
  pages         integer,
  invoices      integer,
  duration_ms   integer NOT NULL,
  -- extracted, not_an_invoice, or failed.
  outcome       text NOT NULL CHECK (outcome IN ('extracted', 'not_an_invoice', 'failed')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Every read of this table is "what happened recently", for a usage panel or a
-- month's total.
CREATE INDEX extraction_event_created ON extraction_event (created_at DESC);
