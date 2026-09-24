# Working on this

Notes on how this repo is developed. Mostly for me in three months, but useful if you clone it.

## One issue, one branch, one pull request

Work is tracked on the [board](https://github.com/users/bharathmay-boop/projects/1), not in the documents. Each issue gets a branch and a pull request that closes it. Nothing goes to `main` directly: a direct push is never reviewed, so it costs a review rather than saving a step.

A pull request says what changed and why, and names what was deliberately left out. "Deliberately not built" is worth more in a description than another paragraph of features, because it is the part a reader cannot work out from the diff.

## Stacked pull requests

Some work depends on other work. The suggestion queue needs the matcher, and the matcher's undo needs the matcher. Those go in a stack: each branch is based on the one below it rather than on `main`, and each has its own pull request.

```
gt create -m "message"   # branch off the current one, with the change
gt submit --stack        # create or update a PR for each branch in the stack
gt sync                  # after a merge, restack what was above it
```

A stack keeps each pull request small enough to review, without pretending the pieces are independent. Reviewing one 900 line change is how things get waved through.

## Checks before a pull request

```
npm test          # the node test runner, no framework
npx tsc --noEmit
npm run lint
npx next build
```

Tests cover the places a mistake would not announce itself: normalisation, match thresholds against real Postgres trigram scores, unit conversion, the arithmetic checks, key sealing, access rules, and what a save actually writes. The database backed ones build a throwaway schema and drop it, so a test run cannot touch real invoices or a saved API key. They skip themselves without a `DATABASE_URL`, so `npm test` still runs on a clean checkout.

A change to matching or money gets a test that fails without it. A wrong spend figure looks exactly like a right one, which is the whole reason those tests exist.

## Migrations

Plain SQL in `db/migrations`, applied in filename order and recorded in a `_migration` table.

```
npm run migrate
```

Additive migrations only, as a rule: add a nullable column, backfill, then use it. The code on `main` has to keep working while a branch carrying the next migration is still open, because the migration runs before the merge, not after.

Backfills that need judgement belong in a script rather than in SQL. The content types of stored files were backfilled by reading the first bytes of each file, because the file name is not evidence of what a file is.

## Secrets

`.env.example` lists every variable name and no values. Real values live in `.env.local`, which is gitignored, and in the Vercel project.

API keys entered through settings are sealed with AES-256-GCM before storage. A provider's error body never reaches the screen, since it can quote the key back.

## Writing

Plain language, no marketing words. Say what something does and what it refuses to do. If a comment explains why rather than what, it earns its place; if it restates the line below it, it does not.
