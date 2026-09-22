// The one prompt both providers are given. Kept in one place because the two
// copies it replaced had to be edited in lockstep, and a prompt that differs by
// provider is a result that differs by provider.

export const INSTRUCTIONS = `You are reading a file someone uploaded as one or more Indian tax invoices.

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
- A continuation page ("Page 2/2", a second page of line items, an HSN
  summary) belongs to the invoice it continues, not a new one.
- The same invoice printed more than once, such as "Original for recipient"
  and "Duplicate for transporter" copies, is one invoice. Return it once, with
  the pages of the first copy.

For each invoice, return every figure exactly as printed. Do not compute,
correct or round anything: if the invoice's own totals disagree with its line
items, return what is printed and let the checks downstream catch it. Inventing
a plausible number is the worst thing you can do here.

- invoice_date must be YYYY-MM-DD.
- gstin is the supplier's 15 character GSTIN, or null if none is printed.
- For intra state invoices CGST and SGST are filled and IGST is 0. For inter
  state invoices IGST is filled and CGST and SGST are 0. Use 0, never null.
- amount is the line total as printed, not quantity times unit price.
- If a value genuinely is not on the invoice and the field allows null, use null.`;
