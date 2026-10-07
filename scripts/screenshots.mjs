// The README's screenshots, taken by a script rather than by hand.
//
// Hand captured images go stale silently: the screen changes, the picture does
// not, and the repo front page starts describing a product that no longer
// exists. This can be re-run after any change to the screens it covers, which
// is the only way an image in a README stays true.
//
//   npm run screenshots
//
// Needs the dev server running and the demo rows seeded. It signs itself in by
// minting a session directly, so the admin password is never read, typed or
// passed anywhere.
import { mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { mintSession, sessionCookie } from "../lib/auth.ts";
import { pool, query } from "../lib/db.ts";

const BASE = process.env.SCREENSHOT_URL ?? "http://localhost:3000";
// The demo-only check below runs against the database this script connects to,
// but the pictures come from whatever is serving BASE. Point SCREENSHOT_URL at a
// deployment and the check passes on a local scratch database while the camera
// is pointed at production. So BASE has to be local.
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE)) {
  console.error(`SCREENSHOT_URL is ${new URL(BASE).origin}, which is not this machine.`);
  console.error("These are pictures of authenticated screens going into a public");
  console.error("repository, so they are only taken from a local dev server reading the");
  console.error("same demo-only database this script checks.");
  process.exit(1);
}
const OUT = new URL("../docs/screenshots/", import.meta.url);
const WIDTH = 1280;
const HEIGHT = 800;

await mkdir(OUT, { recursive: true });

// Every screenshot here is of an authenticated screen, and the list screens show
// whatever is in the database rather than a chosen row. So filtering individual
// queries to `is_demo` is not enough: /vendors and /items would still photograph
// real suppliers and real prices and commit them to a public repo.
//
// The whole run therefore requires a demo-only database, and refuses otherwise.
const [real] = await query(
  `SELECT (SELECT count(*) FROM vendor   WHERE NOT is_demo)::int AS vendors,
          (SELECT count(*) FROM item     WHERE NOT is_demo)::int AS items,
          (SELECT count(*) FROM invoice  WHERE NOT is_demo)::int AS invoices,
          (SELECT count(*) FROM contract WHERE NOT is_demo)::int AS contracts`,
);
const found = Object.entries(real).filter(([, n]) => n > 0);
if (found.length) {
  await pool.end();
  console.error(
    `This database holds rows that are not demo rows: ${found
      .map(([table, n]) => `${n} ${table}`)
      .join(", ")}.`,
  );
  console.error(
    "The screenshots are of authenticated screens and go into a public repository,",
  );
  console.error(
    "so they are only ever taken against a demo-only database. Point DATABASE_URL at",
  );
  console.error("a scratch database, run `npm run seed`, and try again.");
  process.exit(1);
}

// There is deliberately no review.png here. /review/[id] is the screen where a
// draft is checked before it becomes an invoice, and the `draft` table carries no
// is_demo column, so no draft can be shown to be demo data. A draft holds a
// document somebody uploaded, which is exactly what must not reach a public
// repository. #206 covers giving the seed a demo draft; the shot comes back with
// it, and the old docs/screenshots/review.png is deleted rather than kept.

/**
 * An item with more than one purchase, a contract with rates, and the largest
 * finding. Chosen by query rather than hardcoded, so reseeding or changing the
 * demo set does not quietly produce screenshots of empty screens.
 */
const [item] = await query(
  `SELECT it.id, count(*)::int AS purchases
   FROM item it JOIN line_item li ON li.item_id = it.id
   JOIN invoice i ON i.id = li.invoice_id AND i.is_demo
   GROUP BY it.id HAVING count(*) > 1
   ORDER BY count(*) DESC LIMIT 1`,
);

// The largest finding, which is the one the list puts at the top. Findings are
// sorted by money, so this is also the screen worth photographing.
const [finding] = await query(
  `SELECT li.id FROM line_item li
   JOIN invoice i ON i.id = li.invoice_id AND i.is_demo
   WHERE li.variance_tag = 'billed_above_contract' AND li.variance_impact IS NOT NULL
   ORDER BY li.variance_impact DESC LIMIT 1`,
);

// A contract with rates on it. Same reasoning as the item: chosen by query so a
// reseed cannot quietly produce a photograph of an empty review screen.
const [contract] = await query(
  `SELECT c.id, count(r.id)::int AS rates
   FROM contract c JOIN contract_rate r ON r.contract_id = c.id
   WHERE c.is_demo AND c.status IN ('ready_for_review', 'reviewed')
   GROUP BY c.id ORDER BY count(r.id) DESC LIMIT 1`,
);

// A screen with no data to show is skipped rather than photographed, and rather
// than failing the whole run. `npm run seed` leaves no draft behind, so aborting
// here once meant one missing row blocked all nine other screenshots.
//
// Skipping deletes the old image rather than leaving it. A skipped shot with
// yesterday's file still on disk is the stale screenshot this script exists to
// prevent, and the README would go on showing it with nothing failing.
const skipped = [];
async function skip(file, why) {
  await rm(new URL(file, OUT), { force: true });
  skipped.push(`${file}: ${why}`);
}
await skip("review.png", "the review screen has no demo draft to photograph (#206)");
if (!item) await skip("price-history.png", "no item with a repeat purchase, run `npm run seed`");
if (!contract) await skip("contract-review.png", "no contract with rates, run `npm run seed`");
if (!finding) await skip("finding.png", "nothing billed above contract, run `npm run seed`");

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 2,
});

// Minted here rather than typed into the login form. The password is never
// read by this script and never reaches a command line or a log.
await context.addCookies([
  {
    name: sessionCookie.name,
    value: await mintSession(),
    url: BASE,
    httpOnly: true,
    sameSite: "Lax",
  },
]);

const page = await context.newPage();

async function shoot(path, file, settle) {
  const response = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  if (!response?.ok()) throw new Error(`${path} came back ${response?.status()}`);
  // Checked by content as well as by status. Next serves its not found page
  // with a 200 in development, so a status check alone happily photographs a
  // 404 and calls it a screenshot of the review screen.
  if (await page.getByText("This page could not be found").count()) {
    throw new Error(`${path} rendered the not found page`);
  }
  // The dev server paints its own indicator over the bottom left corner. It is
  // not part of the product and it is the first thing the eye lands on in a
  // README, so it goes before the shutter rather than being cropped after.
  await page.addStyleTag({ content: "nextjs-portal, [data-next-badge-root] { display: none !important }" });
  if (settle) await settle(page);
  // fileURLToPath, not pathname: on Windows a pathname keeps its drive
  // letter behind a slash and its spaces percent encoded, so the file lands
  // somewhere with "%20" in its name and the directory looks empty.
  await page.screenshot({ path: fileURLToPath(new URL(file, OUT)) });
  console.log(`  ${file}`);
}

// A document rendered in an iframe, or a chart drawn with a CSS animation,
// is blank or half drawn the moment the network goes quiet. Both need a beat.
const settle = (ms) => (p) => p.waitForTimeout(ms);

console.log("writing docs/screenshots/");
await shoot("/", "home.png", settle(1200));
await shoot("/upload", "upload.png");
await shoot("/items", "items.png");
if (item) await shoot(`/items/${item.id}`, "price-history.png", settle(1500));
await shoot("/vendors", "vendors.png");
await shoot("/contracts", "contracts.png");
if (contract) await shoot(`/contracts/${contract.id}`, "contract-review.png", settle(1500));
if (finding) await shoot(`/findings/${finding.id}`, "finding.png");
await shoot("/suggestions", "suggestions.png");

await browser.close();
await pool.end();
console.log(`done, ${WIDTH}x${HEIGHT} at 2x`);
for (const line of skipped) console.log(`  skipped ${line}`);
