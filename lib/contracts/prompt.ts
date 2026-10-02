// What a contract is read for. One prompt, same reason the invoice one is one:
// a prompt that differs by provider is a result that differs by provider.

export const CONTRACT_INSTRUCTIONS = `You are reading a supply or rate contract between a buyer and a seller.

First decide whether it is one. A contract sets out terms agreed between two
parties for future supply. An invoice, a purchase order, a quotation, a
delivery note or a bank statement is not a contract, however many prices it
shows. Say in reason, in one short sentence, what the document is. If it is not
a contract, set is_contract to false and contract to null.

If it is, set is_contract to true and fill in contract.

The seller is the party supplying goods or services, the one who will send
invoices. Everything about the vendor means the seller, never the buyer.

- effective_from and effective_to are the period the contract itself covers,
  as printed. Null where the document does not say.
- currency is INR, USD or EUR, read from the rates themselves.
- tax_id is the seller's tax registration number and tax_id_kind is "gstin",
  "vat" or "ein". Both null when the seller's number is not printed. A number
  printed only for the buyer is not the seller's.

rates is the agreed price list: one entry for every item the contract puts a
rate against.

- printed_name is what the contract calls the item, in its words, not yours.
- unit is the unit the rate is per, as printed, or null.
- rate is the agreed figure per unit.
- effective_from and effective_to are that rate's own period. Where the
  contract gives a rate no dates of its own, use null and it will inherit the
  contract's.
- page is the page the rate is printed on, counting from 1, and quote is the
  line of text you read it from, word for word. Both are how a person checks
  the figure, so a quote you cannot find on that page is worse than none.

If the contract raises rates on a schedule, write out the resulting rates
rather than describing the rule. A rate of 100 rising five percent each 1 April
for three years is three entries: 100 from the first April, 105 from the
second, 110.25 from the third. The same goes for a revision letter that changes
some rates from a date. Do not return an escalation as a rate with no figure.

other_terms is everything commercial that is not a rate per unit. Record each
one, because they are shown to the reader, and do not try to turn them into
rates.

- kind is "slab" for a rate that depends on volume, "rebate" for money returned
  after the fact, "revenue_share" for a share of takings or profit,
  "minimum_guarantee" for a floor payable regardless, "escalation" for the rule
  behind rates you have already written out, and "other" for anything else.
- label is what the contract calls it and summary is one plain sentence saying
  what it obliges, in the contract's own figures.
- page and quote as above.

Return every figure exactly as printed. Do not compute, correct or round
anything beyond the escalation expansion asked for above. A contract with no
rate card at all is an ordinary document: return an empty rates list rather
than inventing one.`;
