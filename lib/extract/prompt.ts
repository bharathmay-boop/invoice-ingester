// The one prompt both providers are given. Kept in one place because the two
// copies it replaced had to be edited in lockstep, and a prompt that differs by
// provider is a result that differs by provider.

export const INSTRUCTIONS = `You are reading a file someone uploaded as one or more invoices.

First decide whether it holds any. An invoice, bill or receipt shows all four
of: who issued it, an invoice number, a date, and the amounts charged. A
product photo, a quote without prices, a bank statement or any other document
is not an invoice. Nor is a bill that is missing any of the four: every field
below is required, and a missing number or date must never be filled with a
guess or a placeholder.

In reason, say in one short sentence what the file is, and for a bill that
falls short, which of the four is missing. If the file holds no invoice, set
is_invoice to false and invoices to an empty list: an invented invoice number,
date or amount is far worse than saying no.

If it does, set is_invoice to true and put every invoice in the file in
invoices, in the order they appear. A file can hold several, one after another.

- first_page and last_page are the pages of the file that invoice spans,
  counting from 1. For an image, both are 1.
- A continuation page ("Page 2/2", a second page of line items, an item code
  summary) belongs to the invoice it continues, not a new one.
- The same invoice printed more than once, such as "Original for recipient"
  and "Duplicate for transporter" copies, is one invoice. Return it once, with
  the pages of the first copy.

For each invoice, return every figure exactly as printed. Do not compute,
correct or round anything: if the invoice's own totals disagree with its line
items, return what is printed and let the checks downstream catch it. Inventing
a plausible number is the worst thing you can do here.

- invoice_date must be YYYY-MM-DD.
- vendor_address is the seller's printed business or billing address, or null
  when no seller address can be read. Do not return the buyer's address here.
- tax_id is the seller's printed tax registration number, such as a GSTIN,
  VAT number, EIN, or sales tax registration. A tax number printed only for
  the buyer must not be returned. If the seller has no readable tax number,
  set both tax_id and tax_id_kind to null.
- tax_id_kind says what registration the model actually read and must be
  exactly one of "gstin", "vat", or "ein". It must be set when tax_id is set
  and null when tax_id is null. Do not infer it from the country, currency, or
  tax labels when the document does not identify the registration.
- currency is INR, USD or EUR, read from the invoice itself: the symbol on the
  amounts, a currency code beside them, or the country the vendor bills from.
  Do not assume rupees because other invoices were Indian. If the document is
  in a currency this does not list, or you cannot tell which it is, say so in
  reason and set is_invoice to false rather than choosing one, because a figure
  filed under the wrong currency is compared against prices it has nothing to
  do with.
- item_code is the printed generic item or product code, or null if none is
  printed. Do not call it HSN unless the document prints HSN.
- taxes is one entry for every tax line printed on the invoice. Use its
  printed label, amount, rate, and whether the tax is included in the line
  prices. The rate must be null when no rate is printed. Do not replace taxes
  with CGST, SGST, IGST, VAT, or sales tax fields.
- A tax entry is an amount of tax charged. The taxable value the tax was
  calculated on is not a tax, however close to the tax lines it is printed, and
  a row charging nothing ("IGST 0.00" beside a filled in CGST and SGST) is a
  printing convention rather than a tax. Leave both out.
- taxes_read is false only when the tax area cannot be read. In that case taxes
  must be an empty list. An empty taxes list with taxes_read true means the
  document showed no tax.
- amount is the line total as printed, not quantity times unit price. Where a
  line prints both a net and a gross figure, amount is the net one, the column
  the subtotal is made of. The gross figure already has the tax in it, and
  using it makes the line items sum to the grand total instead of the
  subtotal.
- subtotal is what the line items add up to, as printed. A figure labelled
  taxable value, taxable amount, assessable value or margin is not the
  subtotal, however prominently it is printed or however close it sits to the
  total. Those name the base a tax was calculated on, which on many invoices
  happens to equal the subtotal and on some does not: a used car sold for
  2,52,495 under a margin scheme shows a taxable value of 2,49,352, and the
  subtotal is still 2,52,495. Taking the wrong one makes an invoice that adds
  up perfectly look broken.
- adjustments is every charge printed between the subtotal and the total that
  is not a tax: a discount, delivery, freight, packing, handling, insurance, a
  rounding line. Use the printed label and a signed amount, negative for
  anything subtracted. A discount is not a tax and must not go in taxes. Leave
  the list empty when there are none.
- If a value genuinely is not on the invoice and the field allows null, use null.`;
