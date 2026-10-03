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

if (!draft || !item) {
  console.error(
    "No draft waiting for review, or no item with a repeat purchase.\n" +
      "Upload a file to leave a draft, and run `npm run seed` for the rest:\n" +
      "a screenshot of an empty screen is worse than none.",
  );
  await pool.end();
  process.exit(1);
}

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
  if (settle) await settle(page);
  // fileURLToPath, not pathname: on Windows a pathname keeps its drive
  // letter behind a slash and its spaces percent encoded, so the file lands
  // somewhere with "%20" in its name and the directory looks empty.
  await page.screenshot({ path: fileURLToPath(new URL(file, OUT)) });
  console.log(`  ${file}`);
}

console.log("writing docs/screenshots/");
await shoot(`/review/${draft.id}`, "review.png", async (p) => {
  // The original renders in an iframe; without this the shot catches a blank
  // panel where the invoice should be, which is the half of the screen worth
  // showing.
  await p.waitForTimeout(1500);
});
await shoot(`/items/${item.id}`, "price-history.png", async (p) => {
  // The chart draws itself with a CSS animation. Caught mid sweep it looks
  // like a broken line rather than a rising price.
  await p.waitForTimeout(1500);
});

await browser.close();
await pool.end();
console.log(`done, ${WIDTH}x${HEIGHT} at 2x`);
