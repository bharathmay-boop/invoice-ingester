-- A contract is read once and then answers one question forever: what rate was
-- in force for this vendor and item on this date. That question is a date
-- lookup, so the rates are stored flat and dated rather than as a document
-- with amendments replayed onto it. A master agreement and three revision
-- letters are four sets of rate rows, and "in force" is a WHERE clause.
--
-- The document itself is kept because a rate nobody can point at is a claim
-- rather than a fact, and the review screen opens the page the rate was read
-- from.
CREATE TABLE contract (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Null until a person confirms which vendor this is. A contract attached to
  -- the wrong vendor produces variance flags against a supplier who never
  -- signed it, and every rate looks plausible, so nothing downstream would
  -- catch it. It is the one field the review screen always asks about.
  vendor_id       uuid REFERENCES vendor (id),
  title           text NOT NULL,
  blob_url        text NOT NULL,
  content_type    text NOT NULL,
  pages           integer,

  -- The vocabulary the screens read. `reading` is the claimed state: a worker
  -- holds it while it works, and the sweeper reclaims one whose heartbeat has
  -- gone stale because the function died mid document.
  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'reading', 'ready_for_review',
                                    'reviewed', 'could_not_read')),
  attempts        integer NOT NULL DEFAULT 0,
  heartbeat_at    timestamptz,
  -- Why it could not be read, in the words shown to a person.
  failure         text,

  -- What the model returned, before anybody has agreed with it. Kept whole so
  -- the review screen can show the quote and page behind every field, and so a
  -- better prompt can be re-run over the same document later.
  extraction      jsonb,
  extraction_meta jsonb,

  -- Structures this version records and deliberately does not check: slab and
  -- tiered rates, retrospective rebates, revenue and profit share, minimum
  -- guarantees. None of them can be verified against a single invoice, and
  -- checking them anyway is the confident wrong answer the product refuses.
  -- Shown on the contract, never acted on.
  other_terms     jsonb NOT NULL DEFAULT '[]',

  -- The same file dropped twice is the same contract. Invoices get this from
  -- UNIQUE (vendor_id, invoice_number); a contract has no natural key, so the
  -- file's own digest is the closest thing to one.
  digest          text NOT NULL UNIQUE,

  created_at      timestamptz NOT NULL DEFAULT now(),
  reviewed_at     timestamptz
);

-- The queue reads this: oldest first, only what is waiting or in flight.
CREATE INDEX contract_queue ON contract (created_at)
  WHERE status IN ('queued', 'reading');

-- One rate, for one item, from one vendor, over one period.
CREATE TABLE contract_rate (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id    uuid NOT NULL REFERENCES contract (id) ON DELETE CASCADE,
  vendor_id      uuid REFERENCES vendor (id),
  -- Null while the reviewer has not said which catalogue item this is. An
  -- unresolved rate is never used for anything, same as an unmatched line.
  item_id        uuid REFERENCES item (id),
  -- What the contract called it, kept so the review screen can show the words
  -- on the page rather than the catalogue's name for the same thing.
  printed_name   text NOT NULL,
  unit           text,
  rate           numeric(14,4) NOT NULL,
  currency       text NOT NULL,

  -- An escalation is not a clause to interpret at lookup time. A five percent
  -- annual rise becomes rate rows with the right dates when the contract is
  -- read, and so does an irregular revision letter. One mechanism.
  effective_from date NOT NULL,
  -- Rates expire. A rate that never did means a contract nobody renewed keeps
  -- quietly approving invoices at a price nobody is bound by.
  effective_to   date,

  -- Where it came from, so a figure can be pointed at.
  source_page    integer,
  source_quote   text,

  -- Inert until a person has had the document in front of them. This is what
  -- makes a cheap read of a long PDF safe to build on.
  reviewed       boolean NOT NULL DEFAULT false
);

-- The lookup every check makes: this vendor, this item, this date.
CREATE INDEX contract_rate_lookup
  ON contract_rate (vendor_id, item_id, effective_from DESC)
  WHERE reviewed AND item_id IS NOT NULL;

CREATE INDEX contract_rate_contract ON contract_rate (contract_id);
