-- Failed password attempts, so the gate can refuse a source that is guessing.
--
-- In the database rather than in memory on purpose: each serverless invocation
-- may be a fresh instance, so a process local counter protects nothing.
CREATE TABLE login_attempt (
  id         bigserial PRIMARY KEY,
  source     text NOT NULL,
  at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX login_attempt_source_at ON login_attempt (source, at DESC);
