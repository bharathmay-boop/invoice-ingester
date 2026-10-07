# Currency

Five currencies instead of three, and every place that has to agree about it. Researched 7 October 2026. Epic: [#173](https://github.com/bharathmay-boop/invoice-ingester/issues/173).

Currency is not a field. It is a property of every money figure in the product, and the product already makes three correct decisions about it that must not be lost while widening the set.

## 1. What is already true

Three currencies, `INR`, `USD`, `EUR`, declared in four places that nothing forces to agree:

| Where | What it says |
| --- | --- |
| `lib/format.ts` | `export type Currency = "INR" \| "USD" \| "EUR"` |
| `lib/extract/schema.ts` | `z.string().trim().toUpperCase().pipe(z.enum([...]))` |
| `lib/contracts/schema.ts` | `currency: z.enum(["INR", "USD", "EUR"])` |
| `db/migrations/014` | `CHECK (currency IN ('INR', 'USD', 'EUR'))` on `invoice.currency` |

Thirty-nine files reference currency. Adding one code means four coordinated edits and nothing fails if only three are made.

### Three decisions already made that are right

**No conversion, anywhere.** `lib/price.ts` refuses to compare prices across currencies, and says why: the rate between them was different on every invoice date, so a converted history changes shape every time the exchange rate moves. `assess` in `lib/contracts/variance.ts` refuses a rate and a price in different currencies, as of #109. The findings totals group by currency rather than summing across.

**Currency travels with the figure.** `money()`, `unitMoney()` and `moneyRounded()` all take the currency as an argument. There is no ambient "current currency" to get wrong.

**Indian digit grouping is handled.** `₹2,84,600.00` is lakh grouping, not thousands, via `Intl.NumberFormat("en-IN")`.

Widening the set must preserve all three. The refusal to convert in particular is the product's most defensible position on money and it should be strengthened, not relaxed, as more currencies arrive.

## 2. Two faults found while mapping this

### `contract_rate.currency` has no constraint

Migration 020 declares it `currency text NOT NULL`. No CHECK. Meanwhile `invoice.currency` is constrained to the three. So a rate row can hold any string at all.

This got worse with #109. The comparison now refuses a pair whose currencies differ, **by string equality**. A rate stored as `inr` against an invoice in `INR` reports a currency mismatch between two rupee amounts: it produces a `currency_differs` refusal where there should be a real finding, and the line silently stops being checked. A guard that fails open would be bad; this one fails closed and looks like a feature.

### The two schemas normalise differently

`lib/extract/schema.ts` trims and uppercases before the enum. `lib/contracts/schema.ts` does not. So identical model output behaves differently depending on which document it came from: `inr` on an invoice becomes `INR`, and `inr` on a contract fails the whole read with a schema error against a document that was read perfectly.

Both are their own issues under the epic. Both are small. Neither should wait for the widening.

## 3. The five, and why

**INR.** Home market, the demo, and the only currency with real data behind it.

**USD.** The default currency of cross-border invoicing. An Indian business buying software, hardware or freight pays in dollars whatever the counterparty's country.

**EUR.** European suppliers, and the currency the VAT rules in [payments.md](payments.md) are written around.

**GBP.** Separate from EUR for a reason: the UK has its own tax regime, and sterling invoices are common in the same businesses that receive euro ones.

**AED.** Gulf trade is a large share of Indian SME purchasing, and an AED invoice is ordinary in exactly the kind of business this product is for. This is the one that would be left out by someone listing currencies by global reserve share, and it is more likely to appear in a real customer's inbox than JPY or CNY.

### What this deliberately defers

All five have **two decimal places**. That is the reason to stop at five.

ISO 4217 assigns each currency an exponent, and it is not always 2:

- **Exponent 0**: JPY, KRW, VND, ISK, CLP, PYG, RWF, UGX, BIF, DJF, GNF, KMF, VUV. A yen amount has no minor unit in practice.
- **Exponent 3**: KWD, BHD, OMR, JOD, TND, IQD, LYD. A Bahraini dinar divides into 1000 fils, so BHD 10 is 10000 in minor units.

Admitting a zero-decimal or three-decimal currency changes rounding, display, validation and the tolerance arithmetic in the variance check. Keeping all five at two decimals means the widening is genuinely a list change plus the two fixes above, rather than a numeric model change. **When JPY or KWD is needed, it is its own epic**, and the first thing it needs is an exponent table and a decision about storage.

## 4. Storage: stay on `numeric`, and say why

The tempting move with payments arriving is minor units: integers, no float, what Stripe does.

Stay on `numeric(14,4)`.

- The existing columns are `numeric`, and a conversion touches every money column, every query, every test and every screen for no behaviour gain.
- `numeric` is exact. There is no float error to avoid.
- Four decimal places on unit prices are **load bearing**. `unitMoney` exists because ₹4 per kilogram is ₹0.004 per gram, and the formatter shows four decimals rather than reporting it as free. Minor units at exponent 2 would destroy that; keeping a separate scale for unit prices reinvents `numeric`.
- Minor units are the payment provider's interface, not ours. Convert at the boundary, in the billing code, where exactly one currency is in play and the exponent is known.

So: `numeric` for everything the product reads out of documents, minor-unit integers only inside the payments layer, and one documented conversion between them.

## 5. One source of truth

A single module, `lib/money/currencies.ts`, owning:

```
CURRENCIES          the ordered list of codes
Currency            the type, derived from the list rather than written twice
isCurrency(x)       a guard for anything crossing a boundary
CURRENCY_NAMES      for display in a select
```

Then:

- `lib/format.ts` imports `Currency` instead of declaring it.
- Both zod schemas build their enum from `CURRENCIES`, and both trim and uppercase first.
- The database CHECK constraints are generated from the same list by a migration, and a test asserts the database and the code agree. That test is the point: it is the thing that fails when someone adds a currency in three places instead of four.

A test comparing `information_schema` constraint definitions against `CURRENCIES` is a few lines and closes the class of bug permanently.

## 6. Everywhere currency is read

Thirty-nine files. Grouped by what they do with it, because that is what determines the work.

### Reads a figure out of a document

- `lib/extract/schema.ts`, `lib/extract/prompt.ts`: invoice currency, one per invoice
- `lib/contracts/schema.ts`, `lib/contracts/prompt.ts`: contract currency, one per contract, inherited by every rate
- `lib/extract/stored.ts`, `lib/contracts/queue.ts`, `app/api/contracts/worker/route.ts`: the write path

The prompts name the three currencies. Widening the list means widening the prompt, and the prompt should be generated from `CURRENCIES` rather than restating it, or the model will keep being told about three.

### Decides whether two figures may be compared

- `lib/price.ts`: cheapest vendor, refuses mixed currencies
- `lib/contracts/variance.ts`: `assess`, which refuses a rate and a line in different currencies
- `lib/contracts/lookup.ts`, `lib/contracts/recompute.ts`: carry the currency to the comparison

**This is the group that matters.** Every one of these must keep refusing. A fifth and sixth currency increases the chance of a mixed pair arriving, which makes the refusals more load bearing, not less.

### Adds money up

- `lib/queries.ts`: spend by vendor, spend by item, totals
- `app/vendors/page.tsx`, `app/vendors/[id]/page.tsx`
- `app/items/page.tsx`, `app/items/[id]/page.tsx`, `app/items/[id]/chart.tsx`
- `app/findings/findings-list.tsx`, `app/findings/[lineId]/page.tsx`
- `app/suggestions/page.tsx`

Every aggregate must group by currency. A total that sums rupees and dollars is a wrong number that looks right, and with five currencies a vendor billing in two of them becomes an ordinary case rather than a corner one.

**Worth checking rather than assuming**: a price chart over time for an item bought in two currencies. `app/items/[id]/chart.tsx` draws a line; two currencies are two lines or one refusal, and it should be confirmed which it does today.

### Formats for display

- `lib/format.ts`: `money`, `unitMoney`, `moneyRounded`, `symbolFor`

Today the locale is a two-way branch: `currency === "INR" ? "en-IN" : "en-US"`. That gives a US-formatted euro and a US-formatted pound, which is wrong in a small way that people notice. Five currencies want a locale per currency: `en-IN`, `en-US`, `de-DE` or `en-IE`, `en-GB`, `en-AE`.

One decision to make deliberately: **symbol or code.** `$` is ambiguous across a dozen dollars, and `₹`, `€`, `£` and `د.إ` sit at very different widths in a table column. A product about not being confidently wrong about money is a product that should probably show `AED 1,200.00` rather than a glyph. Recommended: code plus amount in tables and totals, symbol only where the currency is unambiguous from context.

### Tests

`test/price.test.ts`, `test/variance.test.ts`, `test/logic.test.ts`, `test/format.test.ts`, `test/stored.test.ts`, `test/validate.test.ts`, `test/units.test.ts`, `test/matching-chain.test.ts`, `test/contract-*.test.ts`, `test/demo-findings.test.ts`

The currency tests are already the right shape, since #109 added three that fail without the guard. Widening needs: a mixed-currency aggregate test, a formatting test per currency, and the code-versus-database constraint test from section 5.

## 7. The two currencies that must never be conflated

**The currency on a customer's invoice** is data about their business. It comes out of a document, it is whatever their supplier billed in, and we never convert it.

**The currency we charge that customer in** is a billing decision. It is a property of our price row, chosen by us, possibly localised by country.

They are different fields, in different tables, with different rules. An Indian customer whose suppliers bill in AED pays us in INR, and nothing about the first fact should touch the second.

The way this goes wrong is a well-meaning helper like `userCurrency()` used for both. The guard is that the payments layer must never import the document-side currency type for its own prices, and `price.currency` and `invoice.currency` should not be made to share a type alias even though both hold a three-letter code today. If the billing set and the document set diverge later, and they will, the shared type is what makes that painful.

## 8. Tax is not currency

Also worth stating because the payments work will tempt the shortcut: **currency does not determine tax jurisdiction.** A euro invoice can be from a Swiss supplier, a dollar invoice from a Singaporean one. Tax treatment follows the place of supply and the parties' registrations, which is `tax_identity` and `billing_profile` in [payments.md](payments.md), not the currency code.

The product already has the right instinct here, since `tax_id_kind` is a separate field from currency with its own values (`gstin`, `vat`, `ein`).

## 9. Migration

1. `lib/money/currencies.ts`, with the five. Derive `Currency` from it.
2. Fix the normalisation asymmetry: both schemas trim and uppercase.
3. Migration: add the CHECK to `contract_rate.currency`, widen the CHECK on `invoice.currency`. Both are widening or adding, so safe in either deploy order.
4. The test that asserts the database constraints match `CURRENCIES`.
5. Locale per currency in `lib/format.ts`, and the symbol-versus-code decision.
6. Generate the currency list in both prompts from `CURRENCIES`.
7. Audit every aggregate in section 6 for grouping, with a test on the one or two that are not already covered.
8. Decide the chart behaviour for an item bought in two currencies.

Steps 2 and 3 are bug fixes and should go first, independently of whether the widening happens.

## Sources

[ISO 4217](https://en.wikipedia.org/wiki/ISO_4217), [currency codes and minor units (Adyen)](https://docs.adyen.com/development-resources/currency-codes), [currency codes and minor units (Datatrans)](https://docs.datatrans.ch/docs/currency-codes), [decimal places and minor units explained](https://www.dev-toolbox.tech/tools/currency-code-reference/examples/currency-decimal-places)
