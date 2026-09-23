# Invoice Ingester, version 1 specification

Agreed 17 September 2026. This document is the stable half of the project. It says what gets built and why. The moving half is the issue board, where each unit of work changes state daily.

A visual version of this with wireframes and flow diagrams is in [`plan.html`](plan.html).

## 1. Scope

Version one does six things:

1. Accept invoice files by drag and drop, PDF or image.
2. Extract the vendor, invoice number, date, line items, taxes and totals.
3. Validate the extraction arithmetically before saving.
4. Resolve the vendor, creating one if it is new.
5. Match line items to a catalogue of items, with a human step for borderline matches.
6. Answer two questions: what have I paid for this item over time, and what have I paid this vendor in total.

Contracts are version two and are described in section 9.

## 2. Decisions

| Question | Decision | What it rules out |
|---|---|---|
| Contracts | Version two | Contract ingestion, term extraction, variance detection |
| Users | Hosted, single user, public read only | Sign up, accounts, per tenant queries |
| Input | Drag and drop upload | Inbound email, chat interface |
| Extraction | Vision model with a strict output schema | Regex and per vendor templates |
| Provider | Claude API or OpenRouter, set in settings | Being locked to one vendor |
| Locale | India first, GST and GSTIN and rupees | Generic multi currency |
| Vendor identity | GSTIN as the key, name as fallback | Fuzzy vendor matching |
| Item identity | Normalise, trigram match, confirm the middle band | Silent automatic merging |
| Payoff | Price history per item, vendor spend totals | Alerts, which are version two |

### Why hosted and public read only

The app is deployed with seeded demo data and is readable without logging in, so the link works for anyone who opens it. A single password, held in an environment variable, gates uploads and edits. This is middleware and a cookie, not an authentication system.

## 3. Stack

- Next.js App Router, TypeScript, deployed on Vercel.
- Postgres on Neon through the Vercel integration.
- Vercel Blob for the original invoice files.
- The `pg_trgm` extension for item matching.
- Anthropic TypeScript SDK, or the OpenRouter HTTP API, for extraction.

Item matching runs in Postgres rather than in application code. Trigram similarity is a built in index type, so matching is a query with a threshold instead of a library plus a scoring function.

## 4. Data model

```
vendor
  id              uuid pk
  gstin           text unique nullable
  name            text
  normalized_name text
  address         text nullable
  created_at      timestamptz

invoice
  id              uuid pk
  vendor_id       uuid fk -> vendor
  invoice_number  text
  invoice_date    date
  subtotal        numeric(14,2)
  cgst            numeric(14,2) default 0
  sgst            numeric(14,2) default 0
  igst            numeric(14,2) default 0
  total           numeric(14,2)
  blob_url        text
  status          text              -- pending | needs_review | confirmed
  extraction_meta jsonb             -- provider, model, tokens, raw response
  created_at      timestamptz
  UNIQUE (vendor_id, invoice_number)

line_item
  id               uuid pk
  invoice_id       uuid fk -> invoice on delete cascade
  raw_description  text
  hsn_code         text nullable
  quantity         numeric(12,3)
  unit             text nullable
  unit_price       numeric(14,4)
  amount           numeric(14,2)
  item_id          uuid fk -> item nullable
  match_confidence numeric(4,3) nullable

item
  id               uuid pk
  canonical_name   text
  normalized_name  text
  created_at       timestamptz
```

Two details carry most of the weight:

**`UNIQUE (vendor_id, invoice_number)`** makes duplicate detection a database constraint rather than a feature someone has to remember to build. Upload the same invoice twice and the write is refused.

**`line_item.item_id` is nullable**, so an unmatched line still saves. It just does not appear in price history yet. Ingestion never waits on matching, which keeps the two flows independent.

`raw_description` is never overwritten. Matching adds a link, it does not rewrite what the vendor printed, so a wrong match can be undone without losing anything.

`extraction_meta` records which provider and model produced each invoice. It costs nothing and it is the only way to tell later whether one model reads a particular vendor's layout better than another.

## 5. Extraction

Four files, and only the last two differ by provider:

```
lib/extract/schema.ts      the JSON schema plus a zod parse, shared
lib/extract/anthropic.ts   Anthropic SDK, claude-opus-5, strict tool schema
lib/extract/openrouter.ts  OpenRouter, response_format json_schema
lib/extract/index.ts       reads settings, calls one, returns one type
```

Both paths return the same object and both run through the same zod parse before anything touches the database.

The response is a verdict first and the invoices second: `{ reason, is_invoice, invoices }`, still one call per file. `reason` is one sentence on what the file is. When `is_invoice` is false, `invoices` is empty, no draft is created, the stored file is deleted, and the upload row says "Not an invoice" with the reason. Without that way out, a photo or any other non invoice has no valid answer except an invented one, which is exactly what the first real non invoice upload produced.

`invoices` holds every invoice in the file, each with the `first_page` and `last_page` it spans. Continuation pages belong to the invoice they continue, and printed copies ("Original for recipient", "Duplicate for transporter") are returned once. Page ranges are checked against the real length of the file, so a range past the last page, or a second page on an image, fails the extraction rather than opening the original in the wrong place. Ranges may overlap, since one page can hold two small receipts. Each invoice becomes its own draft, all written in one transaction and all sharing the one stored original. The review screen opens the PDF at that invoice's first page, and saving or discarding one moves on to the next draft from the same file.

The upload page states a limit of 15 invoices per file. Only the page count can be checked before paying for a call, so a PDF over 30 pages is refused at upload, and so is one whose pages cannot be counted, and a file that still turns out to hold more than 15 invoices keeps its drafts and says it was over the limit.

A shared original is deleted only when the last draft or saved invoice using it goes. Discarding a draft deletes the row, takes a Postgres advisory lock on the file, and checks for anything else still using it, so two siblings discarded at the same moment cannot each see the other and both keep the file.

### Claude path

Anthropic TypeScript SDK, model `claude-opus-5`, adaptive thinking, and a tool definition with `strict: true` so returned arguments are guaranteed to validate. PDFs are sent as a document content block, images as an image block. Roughly two to four cents per invoice.

### OpenRouter path

OpenAI compatible endpoint with `response_format` set to a json_schema, using the model ID chosen in settings.

### The model list

`GET https://openrouter.ai/api/v1/models` returns, per model, an `architecture.input_modalities` array and a `supported_parameters` array. The app uses these rather than a maintained list:

1. Fetch the catalogue server side, cache for 24 hours.
2. Keep only models that can actually do the job: modalities include both `image` and `file`, supported parameters include `structured_outputs`, the model is not a `:batch` variant, and it carries a real price.
3. Order by price, cheapest first. The filter has already removed everything that cannot read an invoice, so price is the only question left.
4. Show them all. The two models that have been tried on a real invoice carry a note on the option, not a position at the top.

A pinned list of model IDs goes stale within weeks, and a retired ID does not fail when it is selected. It fails later during an upload, which is the worst place to discover it. Filtering against the live catalogue means every option in the dropdown is a model that exists and can do the job.

`file` is not a detail. PDFs are sent as a file part, and a model without it fails on every PDF: `openrouter/free` passed the earlier filter, priced itself at 0 so it sorted to the top of the list, and broke extraction the moment it was selected. A `:batch` variant is queued rather than answered, which is wrong for someone waiting on an upload. A model saved before it stopped qualifying falls back to the default at call time, rather than failing during an upload.

No free model qualifies. Every free model that does images and structured output lacks `file` support, so there is no free option for a product whose main input is a PDF. The default is `google/gemini-2.5-flash`, about $0.0026 an invoice.

If OpenRouter is unreachable the app uses the last cached list, and if there is no cache it says so rather than showing an empty dropdown. The two recommended IDs are matched by string, so a retired one loses its badge instead of breaking the page.

### Validation

Two arithmetic checks run before any save:

1. Line item amounts sum to the subtotal.
2. Subtotal plus CGST plus SGST plus IGST equals the total.

Both within a configurable tolerance, one rupee by default, for rounding. Failing either sets status `needs_review` with the disagreeing figures highlighted, instead of `confirmed`.

Two more checks catch a model that fills in the form for something that is not a bill even though it could have declined: a total of zero, and a placeholder invoice number such as "unknown" or "N/A". Both add up perfectly, so the arithmetic alone would pass them. Either one sets `needs_review`.

Two more flag duplicates rather than letting them through to the unique constraint at save time: the same supplier and invoice number appearing earlier in the same file, which is usually a printed copy, and one already saved. These, and the two above, are shown on the review screen under "Check this before saving", apart from the sums.

This is the highest value code in the build relative to its size. A model that quietly invents a number is worse than one that fails loudly, because a wrong total flows straight into the spend figures and nothing announces it.

## 5a. Analytics and spend

PostHog carries product usage and crashes, so it can all be read from a phone. Page views and the flow through the app go from the browser; `extraction_completed` goes from the server on every provider call, carrying provider, model, tokens, cost, pages, invoices found, duration and outcome. Crashes are captured on both sides, with `error.tsx` and `global-error.tsx` so a crash shows something usable rather than a white screen. Without `NEXT_PUBLIC_POSTHOG_KEY` the app behaves exactly as before and sends nothing.

Nothing in an event identifies a supplier or an amount charged: counts, model names and costs only. An analytics tool is not a place to keep someone else's books.

The same figures are written to `extraction_event`, which is the record that has to be right. An event can be blocked by an ad blocker, lost with a dropped request or aged out of a retention window, and none of those should be able to lose the record of what was spent. It also works offline, and #41 needs it to price a batch before extracting it. Settings reads it for calls and spend today and this month. A call the catalogue had no price for is counted but not costed, and the total then reads "or more" rather than pretending to be exact.

## 6. Matching

### Vendors

GSTIN exact match resolves to an existing vendor. Where no GSTIN is printed, a normalised name comparison is used instead, and the result is flagged on the review screen for confirmation rather than accepted silently. New vendors are created from the review screen.

### Items

Normalise the description, then score it against `item.normalized_name` using trigram similarity:

| Score | Behaviour |
|---|---|
| 0.85 and above | Link automatically, reversible later |
| 0.60 to 0.85 | Show as a suggestion to accept or reject |
| Below 0.60 | Create a new catalogue item |

Both thresholds are editable in settings. The right values depend on how varied the real invoices are, which is not knowable before there is data in the system.

Normalisation lowercases, strips punctuation, units and pack sizes, and drops filler words. It has its own tests because one change there shifts every score in the system.

## 7. Settings

- **Extraction:** provider selection, API key entry, model dropdown for OpenRouter, and a test connection action.
- **Matching:** the automatic link and suggestion thresholds.
- **Invoice defaults:** rounding tolerance, financial year start, duplicate policy.
- **Data:** CSV export, reset demo data.

### Key handling

Keys are entered in settings and encrypted at rest with AES-256-GCM, using a master key held in an environment variable rather than in the database. Once saved a key is never returned to the browser. The field shows a masked form with the last four characters and the only action is Replace. Test connection makes one cheap call and reports pass or fail without echoing the key. The public read only view does not render this page, and the routes behind it reject requests without the session cookie.

## 8. Screens

| Screen | Purpose |
|---|---|
| Upload | Dropzone plus per file progress and status |
| Review | Original rendered beside editable extracted fields |
| Item search | Price history, total paid, cheapest vendor, every purchase |
| Vendor detail | Total spend, invoice list, most purchased items |
| Suggestions | Queue of borderline item matches to accept or reject |
| Settings | As above |

The review screen puts the original beside the fields because checking an extraction means comparing it to its source. Any layout that makes you hold a number in your head while scrolling has already failed. Clicking a field highlights where it came from.

## 9. Version two, contracts

A contract carries a vendor, a period, and agreed rates per catalogue item. Invoices link to the contract in force on their date, and a billed unit price that disagrees with the contracted rate is flagged.

This is the most useful thing the product could eventually do, and it is deliberately last. A variance check built on unreliable extraction produces confident wrong answers, which is worse than no check. The version one data model already accommodates it, since contracts attach to a vendor and reference catalogue items and both exist from the start, so nothing needs reshaping.

## 10. Not in version one

| Left out | Reason |
|---|---|
| Multiple users and accounts | One password gates edits. Nothing here needs tenancy. |
| A separate OCR step | Vision models read scans directly. A second pipeline buys nothing. |
| Price alerts | Needs a baseline of real history first. |
| Bulk upload queues | Several files at once is enough. Hundreds is not a problem this has. |
| Accounting integrations | CSV export covers it. Tally and Zoho are their own project. |

## 11. Tests

One test file, covering the three pieces of logic where a mistake would not announce itself:

- **Normalisation**, because every match score depends on it.
- **Match thresholds**, that the three bands behave correctly at their boundaries.
- **Arithmetic validation**, including the rounding tolerance and each tax combination.

Everything else is a page rendering or a database query, and those fail loudly on their own.

## 12. Open questions

Neither blocks the build.

- Which two OpenRouter models get the recommended badge. Best decided by running the same ten invoices through the shortlist once extraction works, rather than picked in advance.
- Whether the public demo lets a visitor upload their own invoice. It is the better demo and it spends API credit, so it is a flag, defaulted off.
