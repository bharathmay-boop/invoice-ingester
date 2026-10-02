-- A charge that is neither a line item nor a tax: a discount, delivery, a
-- handling fee, a rounding line. They sit between the subtotal and the total
-- on an ordinary purchase invoice and the arithmetic check had nowhere to put
-- them, so every invoice carrying one was held for a discrepancy nobody could
-- clear. A check that always fires on a legitimate document is one people
-- learn to dismiss, which costs more than the check was ever worth.
--
-- Same shape as `taxes`, and separate from it on purpose: a discount is not a
-- negative tax, and letting one into the tax list would make the tax model a
-- function of whatever a seller called their delivery charge.
--
-- Amounts are signed. A discount is negative, delivery is positive, and the
-- rule becomes subtotal plus taxes charged plus adjustments equals the total.
ALTER TABLE invoice
  ADD COLUMN adjustments jsonb NOT NULL DEFAULT '[]';

ALTER TABLE invoice
  ADD CONSTRAINT invoice_adjustments_is_array
  CHECK (jsonb_typeof(adjustments) = 'array');
