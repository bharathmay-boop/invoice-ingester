# The site shows what the product does

Agreed with Bharath on 2026-10-21. Tracked as an epic on the board, one issue per piece below.

## Why

An audit of the live home page found:

1. Every visitor hits a dead end. The only real button is Sign in, and nobody outside has the password.
2. Most of what the product does is not on the page: unit reconciliation, item matching and the suggestion queue, vendor identity by tax number, duplicate and not-an-invoice handling, the contract reader and Findings, three currencies kept apart, bring your own model with the cost shown first, keyboard review.
3. The README's "What it will not do" list, the clearest evidence of product judgement, is not on the site.
4. The "invented figures" disclaimer appears four times.
5. On a phone three of the four questions in "What it answers" sit off screen in a sideways scroll.
6. The "Read it" panel is mostly empty while its rows animate in.
7. Nothing points at the proof: the public board, the tests, the real screenshots.
8. The header holds the name and Sign in and nothing else.

## Decisions

| Question | Decision |
|---|---|
| Audience | A product page for a finance or procurement buyer, with a short "how it was built" strip for hiring managers |
| Main call to action | A public read-only demo |
| Demo data | Production stays demo-only. Real use waits for accounts (#174) |
| Visual identity | Keep the shadcn tokens, type and hero. Refine layout, motion and polish |
| Motion | Add the `motion` library, everything behind `prefers-reduced-motion` |
| Hero | Kept as it is, including the ledger row marked coming soon |
| Pages in scope | Home, sign in, a demo banner in the app, then micro-animations on the app screens |
| Design skill | ui-ux-pro-max (nextlevelbuilder, the most starred UI skill on GitHub), installed globally after reading its source |

## 1. Read-only demo

- The sign-in page gets a "Try the demo" button. It sets a session whose signed payload carries a `demo` role, signed and revocable exactly like the owner's session (bound to the expiry and the password).
- The proxy rejects any non-GET request from a demo session with 403, except signing out. Server actions are POSTs, so this one check covers routes and actions alike.
- The settings page does not render for a demo session, so no paid model call can start from a demo.
- Machine routes (cron, worker, Blob callback) are unchanged.
- Tests: a demo session gets 403 on each write route and on a server action POST, settings is unreachable, an owner session still writes, a tampered role is rejected, the machine route exemptions still reach their handlers.
- Auth changes, so the security-audit skill runs again afterwards.

No migration: the role lives in the signed token, not the database.

## 2. Demo banner

A slim bar on every app screen while in demo mode: "Demo. Invented data, read only." with a sign-out link. Not shown to the owner.

## 3. Sign-in page

Matches the home page. Two ways in: the password, and Try the demo, with one line saying what the demo is.

## 4. Home page, top to bottom

1. **Header:** name, anchor links (How it works, Contracts, Limits), GitHub, Try the demo.
2. **Hero:** the current flow animation untouched. Primary button Try the demo, secondary See how it works.
3. **How it works:** four steps instead of two. Read, Check, Match (units, items, vendor by tax number), Contract. Panels reveal on scroll, which also ends the empty-panel problem.
4. **What it answers:** the four questions. On a phone a 2 by 2 grid instead of a sideways scroll.
5. **Contracts:** a long PDF read in the background, every rate with its page and quoted line, nothing live until a person confirms it, the Findings screen.
6. **What it will not do:** the README list, tightened, as cards.
7. **Your model, your key:** Anthropic or any OpenRouter model, the cost of a batch shown before it runs, test connection.
8. **How it was built:** links to the public board, the test count, reviewed pull requests and the real screenshots.
9. **Footer:** the one disclaimer, replacing the four.

## 5. Motion

- `motion` added as a dependency, with one shared `Reveal` component (fade up plus stagger on entering the viewport) and hover and press micro-animations on cards and buttons.
- Every animation is skipped under `prefers-reduced-motion`.
- The hero keeps its own CSS animation.

## 6. Copy

- No em dashes and none of the banned words (seamless, robust, leverage, elevate, game-changer, dive into) in visible text.
- A test renders the home and sign-in pages and fails on either, so the rule holds after this pass.

## 7. App screens polish (after the public site)

Micro-animations on the real screens, one issue per group: lists (rows stagger in), the review screen (a confirmed field ticks), contracts and findings (tab and state transitions). Each respects reduced motion.

## Out of scope

- Accounts, sign up, pricing. Blocked on #174 and #185.
- A separate demo database. Not needed while production is demo-only.
- A new palette or typeface.
