-- The retention sweep filters on `at` alone, and the only other index starts
-- with `source`, so every login was paying for a scan of the whole table.
CREATE INDEX login_attempt_at ON login_attempt (at);
