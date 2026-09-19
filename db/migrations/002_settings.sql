-- Settings, and API keys kept apart from them.

CREATE TABLE setting (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Separate table rather than a flag on setting, so "never send this to the
-- browser" is a property of where the row lives instead of something every
-- future query has to remember. sealed is AES-256-GCM, opened only with the
-- master key from the environment.
CREATE TABLE secret (
  name       text PRIMARY KEY,
  sealed     text NOT NULL,
  last_four  text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
