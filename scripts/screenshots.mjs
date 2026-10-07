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
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { mintSession, sessionCookie } from "../lib/auth.ts";
import { pool, query } from "../lib/db.ts";

const BASE = process.env.SCREENSHOT_URL ?? "http://localhost:3000";
const OUT = new URL("../docs/screenshots/", import.meta.url);
const WIDTH = 1280;
const HEIGHT = 800;

await mkdir(OUT, { recursive: true });

/**
 * A draft waiting to be reviewed, and an item with more than one purchase.
 * Chosen by query rather than hardcoded, so reseeding or changing the demo set
 * does not quietly produce screenshots of empty screens.
 *
 * A draft, not a saved invoice: /review/[id] is the screen where a draft is
 * checked before it becomes an invoice, so a saved invoice's id 404s there.
 */
// The newest draft is not necessarily a good one to photograph: one of them
// is a picture of a box of chocolates, which is the "this is not an invoice"
// case and shows a screen full of zeroes. Prefer one with figures on it.
const [draft] = await query(
  `SELECT id FROM draft
   WHERE (extracted->>'total')::numeric > 0
     AND coalesce(extracted->>'invoice_number', '') NOT IN ('', 'unknown')
     -- An image, not a PDF. Headless Chromium has no PDF viewer and renders
     -- "this browser will not display the PDF inline" where the invoice should
     -- be, which is the half of the screen worth showing.
     AND content_type LIKE 'image/%' 
   ORDER BY jsonb_array_length(coalesce(extracted->'line_items', '[]'::jsonb)) DESC,
            created_at DESC
   LIMIT 1`,
);

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
   WHERE li.variance_tag = 'billed_above_contract' AND li.variance_impact IS NOT NULL
   ORDER BY li.variance_impact DESC LIMIT 1`,
);

// A contract with rates on it. Same reasoning as the item: chosen by query so a
// reseed cannot quietly produce a photograph of an empty review screen.
const [contract] = await query(
  `SELECT c.id, count(r.id)::int AS rates
   FROM contract c JOIN contract_rate r ON r.contract_id = c.id
   WHERE c.status IN ('ready_for_review', 'reviewed')
   GROUP BY c.id ORDER BY count(r.id) DESC LIMIT 1`,
);

// A screen with no data to show is skipped rather than photographed, and
// rather than failing the whole run. `npm run seed` leaves no draft behind, so
// aborting here meant the review screenshot blocked all nine of the others on a
// clean checkout. What is missing is said out loud at the end: a quietly
// skipped screenshot is how a README ends up with a picture nobody regenerated.
const skipped = [];
if (!draft) skipped.push("review.png: no draft waiting, upload a file to leave one (#206)");
if (!item) skipped.push("price-history.png: no item with a repeat purchase, run `npm run seed`");
if (!contract) skipped.push("contract-review.png: no contract with rates, run `npm run seed`");
if (!finding) skipped.push("finding.png: nothing billed above contract, run `npm run seed`");

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
if (draft) await shoot(`/review/${draft.id}`, "review.png", settle(1500));
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
