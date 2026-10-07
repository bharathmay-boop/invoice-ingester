-- contract_rate.currency had no CHECK, while invoice.currency has had one since
-- migration 014. So a rate row could hold any string at all.
--
-- That became a wrong answer rather than a loose column in #109, which refuses
-- a rate and an invoice line whose currencies differ, by string equality. A
-- rate stored as 'inr' against an invoice in 'INR' reported a currency mismatch
-- between two rupee amounts: the line stopped being checked and the screen
-- showed a refusal where there should have been a finding.
--
-- Existing rows are normalised first. Every rate written so far came through
-- the contract schema, which only ever accepted the three codes, so this should
-- move nothing. It runs anyway because a constraint added over data that
-- violates it fails the migration, and finding that out in production is worse
-- than one redundant UPDATE.
UPDATE contract_rate SET currency = upper(trim(currency))
  WHERE currency <> upper(trim(currency));

ALTER TABLE contract_rate DROP CONSTRAINT IF EXISTS contract_rate_currency_check;

ALTER TABLE contract_rate
  ADD CONSTRAINT contract_rate_currency_check CHECK (currency IN ('INR', 'USD', 'EUR'));
