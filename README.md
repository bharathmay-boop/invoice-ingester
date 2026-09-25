# Invoice Ingester

Drop in an invoice, get the particulars extracted and stored, then search what you paid for a given thing and what you paid a given vendor in total.

Built for Indian invoices first: GSTIN, HSN codes, and the CGST, SGST and IGST split.

**Live:** [invoice-ingester.vercel.app](https://invoice-ingester.vercel.app). The home page shows what it does; the app itself is behind a password, because it holds real invoices.

**Status:** in build, and working end to end. Upload, extraction, review, save, item matching, price history and vendor spend all work. Progress is tracked on the [board](https://github.com/users/bharathmay-boop/projects/1), and [`docs/spec.md`](docs/spec.md) says what is being built and why.

## The problem

Invoices arrive as PDFs and photos, get filed somewhere, and the information in them is never used again. Two questions are hard to answer once you have more than a handful:

1. How much have I paid this vendor in total?
2. What have I been paying for this item over time, and does another vendor sell it cheaper?

Both are answerable from invoices you already have. They just need the line items extracted, the vendors resolved, and the same product recognised across different spellings.

## How it works

Upload a PDF or an image. A vision model reads it and returns structured fields against a fixed schema. Two arithmetic checks run before anything saves: line items must sum to the subtotal, and subtotal plus taxes must equal the total. If either fails the invoice is held for review with the disagreeing figures highlighted, rather than saved as if it were fine.

Vendors are resolved by GSTIN, which is a real unique business identifier, so vendor identity is an exact key lookup rather than a guess. Line items are normalised and matched against a catalogue using Postgres trigram similarity. Strong matches link on their own, borderline ones wait in a queue to be accepted or rejected, and weak ones become new catalogue entries.

One file can hold several invoices. A five page PDF of three invoices comes back as three, each with the pages it came from, each reviewed and saved on its own.

## What it will not do

Worth knowing before you clone it:

- **It will not tell you two prices are comparable when they are not.** Kilograms and grams are converted; a ream against a sheet is refused with the reason, because a ream is 500 sheets of one particular paper rather than 500 of anything. Product specific pack sizes are not recorded yet.
- **It will not merge two products on a guess.** Descriptions that are close but not clearly the same wait for a person. Measured on real invoices, two different cartridges scored higher than two spellings of one stapler, so no threshold separates them on its own.
- **It will not save an invoice whose own figures disagree** without marking it. It is held for checking rather than folded into a spend total.
- **It will not read a file that is not an invoice.** A photo or a bank statement is declined with a reason rather than turned into a draft of invented fields.
- **It is one user with one password.** No accounts, no roles, no tenancy.
- **Contracts are not built.** Checking a billed rate against a contracted one is the most useful thing this could eventually do, and it is deliberately last: a variance check on shaky extraction produces confident wrong answers.

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

Signing in needs `ADMIN_PASSWORD`, which `vercel env pull` also brings down. Everything except the home page is behind it.

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

They cover the places a mistake would not announce itself: description normalisation, the match thresholds against real Postgres trigram scores, unit conversion, the arithmetic checks, key sealing, the access rules, and what a decision or a merge actually writes.

The store tests need a database and skip themselves without one, so `npm test` still runs on a clean checkout. Run `vercel env pull` first to include them. They build a throwaway schema from the migration file and drop it afterwards, so running the suite cannot touch a saved API key.

## Screenshots

_To be added: the review screen with an invoice beside its extracted fields, and an item's price history._

## Using it

1. Sign in with the password in `ADMIN_PASSWORD`.
2. Settings, Extraction: paste a Claude API key and save it. Test connection tells you whether it works.
3. On OpenRouter, pick a model. Only models that accept an image and support structured output are listed, cheapest first, with a rough per invoice cost. They differ by more than twenty times for the same job.
4. Upload: drop in a PDF or a photo of an invoice.
5. Review: the original sits beside the extracted fields, everything editable. The arithmetic is rechecked as you type.
6. Confirm and save. The invoice, its vendor and its line items are written in one transaction, and a duplicate is refused by the database rather than by a check someone remembered to write.

To try a provider without saving its key, put it in `.env.local` as `OPENROUTER_API_KEY` or `ANTHROPIC_API_KEY`. Those are read only when `VERCEL` is unset, so they never apply on a deployment, and a key entered through Settings always wins over them. Settings shows where a key came from. `.env.example` lists every variable name and no values.

Note that `vercel env pull` rewrites `.env.local`, so a key added by hand there has to be added again afterwards.

Originals are stored in a private blob store and served back through an authenticated route, so an uploaded invoice is not sitting on a public URL.

## Keys and the password

API keys are sealed with AES-256-GCM before they are stored. The master key lives in an environment variable rather than the database, so a database dump on its own opens nothing, and the setting name is bound in as additional authenticated data so a ciphertext cannot be moved between settings. A saved key is never sent back to the browser: the page shows the last four characters and the only action is Replace.

The password gate records failed attempts and refuses a source after eight wrong passwords in fifteen minutes. Addresses are hashed before storage, since knowing a source is guessing does not require keeping a list of who visited.

## Design system

The interface is built on [shadcn/ui](https://ui.shadcn.com), with components added by the CLI into `components/ui` rather than installed as a dependency. Theme tokens, type scale, radius and dark mode are defined once in `app/globals.css` and consumed everywhere else, so screens never define their own colours.

```
npx shadcn@latest add <component>
```

Dark mode follows the system setting through `next-themes`, which puts the class shadcn's tokens key off.

## Documentation

- [`CONTRIBUTING.md`](CONTRIBUTING.md) is how the work is done: stacked pull requests, the checks that run before one, migrations, and where secrets live.
- [`docs/spec.md`](docs/spec.md) is the specification: scope, data model, architecture, and what is deliberately left out.
- [The plan](https://bharathmay-boop.github.io/invoice-ingester/plan.html) is the same thing with wireframes and flow diagrams. Served through GitHub Pages, since GitHub shows HTML files in the repo as source.
- [The board](https://github.com/users/bharathmay-boop/projects/1) holds the 33 issues, grouped into epics by label.

Work is tracked on the board, not in these documents. The documents say what is being built and why, and change rarely. The board says what state each piece is in, and changes daily.

## What it costs to run

Reading an invoice costs about a quarter of a cent with Gemini 2.5 Flash through OpenRouter, or a few cents with Claude directly. The upload screen says what a batch will cost before it starts, and what it actually cost afterwards, from the token counts each call reported. Every call is recorded, so settings can show spend for today and this month.

## Scope

Version one covers upload, extraction, vendor matching, item matching, item price history, and vendor spend totals.

Contracts are version two. The intent is that an invoice gets checked against the contract in force on its date, and a billed rate that disagrees with the contracted rate gets flagged. That is the most useful thing this could eventually do, and it is not worth building until extraction and matching are reliable, because a variance check on top of shaky data produces confident wrong answers.

## Licence

MIT
