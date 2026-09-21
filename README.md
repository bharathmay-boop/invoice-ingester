# Invoice Ingester

Drop in an invoice, get the particulars extracted and stored, then search what you paid for a given thing and what you paid a given vendor in total.

Built for Indian invoices first: GSTIN, HSN codes, and the CGST, SGST and IGST split.

**Status:** in build. Upload, extraction, review and save work end to end. Item matching is still exact-name only, and OpenRouter is not wired up yet. The spec is agreed and the work is broken into 33 issues on the [board](https://github.com/users/bharathmay-boop/projects/1).

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

The database is Neon, provisioned through the Vercel Marketplace. Pull the connection strings, then apply the schema:

```
vercel env pull
npm run migrate
```

Migrations use `DATABASE_URL_UNPOOLED`, since DDL in a transaction does not sit well behind the pooler.

Signing in needs `ADMIN_PASSWORD`, which `vercel env pull` also brings down. Reading is open to everyone, so the password is only needed for uploads and settings.

`vercel env pull` also brings down `SETTINGS_MASTER_KEY`, the AES-256-GCM key that API keys are sealed with. It is held in the environment rather than the database, so a database dump on its own does not open anything. Losing it means re-entering the API keys, not losing invoice data.

Migrations are plain SQL files in `db/migrations`, applied in filename order and recorded in a `_migration` table, so re-running is safe.

Load the demo data, which is what the screens show:

```
npm run seed
```

It removes only the rows it seeded, marked with `is_demo`, and reloads them. Safe to re-run, and it doubles as the reset action without touching real invoices in the same tables.

Tests run on the Node test runner, no framework:

```
npm test
```

They cover the places a mistake would not announce itself: description normalisation, the match thresholds, the arithmetic checks, and key sealing.

The store tests need a database and skip themselves without one, so `npm test` still runs on a clean checkout. Run `vercel env pull` first to include them. They build a throwaway schema from the migration file and drop it afterwards, so running the suite cannot touch a saved API key.

## Using it

1. Sign in with the password in `ADMIN_PASSWORD`.
2. Settings, Extraction: paste a Claude API key and save it. Test connection tells you whether it works.
3. Upload: drop in a PDF or a photo of an invoice.
4. Review: the original sits beside the extracted fields, everything editable. The arithmetic is rechecked as you type.
5. Confirm and save. The invoice, its vendor and its line items are written in one transaction, and a duplicate is refused by the database rather than by a check someone remembered to write.

Originals are stored in a private blob store and served back through an authenticated route, so an uploaded invoice is not sitting on a public URL.

## Design system

The interface is built on [shadcn/ui](https://ui.shadcn.com), with components added by the CLI into `components/ui` rather than installed as a dependency. Theme tokens, type scale, radius and dark mode are defined once in `app/globals.css` and consumed everywhere else, so screens never define their own colours.

```
npx shadcn@latest add <component>
```

Dark mode follows the system setting through `next-themes`, which puts the class shadcn's tokens key off.

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
