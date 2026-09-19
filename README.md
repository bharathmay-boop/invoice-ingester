# Invoice Ingester

Drop in an invoice, get the particulars extracted and stored, then search what you paid for a given thing and what you paid a given vendor in total.

Built for Indian invoices first: GSTIN, HSN codes, and the CGST, SGST and IGST split.

**Status:** in build. The spec is agreed and the work is broken into 33 issues on the [board](https://github.com/users/bharathmay-boop/projects/1).

## The problem

Invoices arrive as PDFs and photos, get filed somewhere, and the information in them is never used again. Two questions are hard to answer once you have more than a handful:

1. How much have I paid this vendor in total?
2. What have I been paying for this item over time, and does another vendor sell it cheaper?

Both are answerable from invoices you already have. They just need the line items extracted, the vendors resolved, and the same product recognised across different spellings.

## How it works

Upload a PDF or an image. A vision model reads it and returns structured fields against a fixed schema. Two arithmetic checks run before anything saves: line items must sum to the subtotal, and subtotal plus taxes must equal the total. If either fails the invoice is held for review with the disagreeing figures highlighted, rather than saved as if it were fine.

Vendors are resolved by GSTIN, which is a real unique business identifier, so vendor identity is an exact key lookup rather than a guess. Line items are normalised and matched against a catalogue using Postgres trigram similarity. Strong matches link on their own, borderline ones are shown as suggestions to accept or reject, and weak ones become new catalogue entries.

## Extraction providers

Extraction runs through either of two providers, selected on the settings page:

- **Claude API** direct, using `claude-opus-5` with a strict tool schema.
- **OpenRouter**, using any vision model that supports structured output.

Both return the same object and both pass through the same validation, so nothing downstream knows or cares which one ran.

The OpenRouter model list is built at runtime from the OpenRouter models endpoint, filtered to models that accept image input and support structured output, and cached for a day. A hardcoded list of model IDs goes stale quickly, and a retired ID does not fail when you select it, it fails later when you upload.

API keys are entered in settings and encrypted at rest. They are never sent back to the browser after saving, and the masked display shows only the last four characters.

## Stack

Next.js App Router on Vercel, Postgres on Neon, Vercel Blob for the original files, and the `pg_trgm` extension for item matching.

## Running it locally

```
npm install
npm run dev
```

The database lives on Neon. Set `DATABASE_URL` in `.env.local`, then apply the schema:

```
npm run migrate
```

Migrations are plain SQL files in `db/migrations`, applied in filename order and recorded in a `_migration` table, so re-running is safe.

## Documentation

- [`docs/spec.md`](docs/spec.md) is the specification: scope, data model, architecture, and what is deliberately left out.
- [The plan](https://bharathmay-boop.github.io/invoice-ingester/plan.html) is the same thing with wireframes and flow diagrams. Served through GitHub Pages, since GitHub shows HTML files in the repo as source.
- [The board](https://github.com/users/bharathmay-boop/projects/1) holds the 33 issues, grouped into epics by label.

Work is tracked on the board, not in these documents. The documents say what is being built and why, and change rarely. The board says what state each piece is in, and changes daily.

## Scope

Version one covers upload, extraction, vendor matching, item matching, item price history, and vendor spend totals.

Contracts are version two. The intent is that an invoice gets checked against the contract in force on its date, and a billed rate that disagrees with the contracted rate gets flagged. That is the most useful thing this could eventually do, and it is not worth building until extraction and matching are reliable, because a variance check on top of shaky data produces confident wrong answers.

## Licence

MIT
