// Loads the demo dataset into the database. Safe to re-run: it removes only the
// rows it previously seeded, so this is also the "reset demo data" action from
// settings and it cannot take a real invoice with it.
//
// Contracts come with it, and with a document each. `contract.blob_url` is NOT
// NULL and the review screen opens the page a rate was read from, so a demo
// contract without a PDF would be an empty viewer beside rates claiming to
// come from it. The PDFs are generated here and written to blob storage at a
// path derived from their own digest, so a reseed replaces them rather than
// leaving the last run's behind.
//
// Run: npm run seed
import { createHash } from "node:crypto";
import pg from "pg";
import { del, put } from "@vercel/blob";

const { asExtraction, invoices, items, vendors } = await import("../lib/demo/dataset.ts");
const { contracts } = await import("../lib/demo/contracts.ts");
const { ALIASES, matcherInvoice, normalizedAlias } = await import("../lib/demo/matcher-cases.ts");
const { contractPdf } = await import("../lib/demo/contract-pdf.ts");
const { demoDraft, draftText } = await import("../lib/demo/draft.ts");
const { invoicePng } = await import("../lib/demo/invoice-png.ts");
const { validateArithmetic } = await import("../lib/extract/validate.ts");
const { normalizeAddress, normalizeName, normalizeTaxId } = await import("../lib/vendors/normalize.ts");

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run `vercel env pull` first.");
  process.exit(1);
}

// Everything in this script has to be the same database. The client below
// prefers the unpooled url, and `lib/db.ts`, which `recomputeVariance` uses,
// reads DATABASE_URL and nothing else. With only the unpooled one set, the
// inserts would commit here and the variance pass would run somewhere else, or
// fail, leaving demo invoices with no findings against contracts that exist.
process.env.DATABASE_URL = url;

// After the assignment above, not with the other imports: save-line reaches
// lib/db.ts through match.ts and the settings store, and db.ts builds its pool
// the moment it is first imported, from whatever DATABASE_URL is then.
const { lockItemNames, saveLine } = await import("../lib/items/save-line.ts");
const { DEFAULT_LINK, DEFAULT_SUGGEST } = await import("../lib/items/match.ts");

// Every invoice goes through the same checks a real extraction would, so the
// demo data cannot quietly contradict the validator it is meant to demonstrate.
for (const invoice of invoices) {
  const result = validateArithmetic(asExtraction(invoice));

  if (result.status !== invoice.status) {
    console.error(
      `${invoice.number} is marked ${invoice.status} but validates as ${result.status}.`,
    );
    process.exit(1);
  }
}

const client = new pg.Client({ connectionString: url });
await client.connect();

// Blob writes are not in the transaction and cannot be rolled back, so a
// failure after one has to take it away by hand. Otherwise a failed seed
// leaves a document nothing points at.
const uploaded = [];
let previous = [];
let committed = false;
let contractVendorIds = [];

try {
  await client.query("BEGIN");

  // Only demo rows. Truncating these tables would delete real uploaded
  // invoices, which share them.
  //
  // Invoices first, taking their line items with them by cascade. Items and
  // vendors go next, but only where nothing real still points at them: a real
  // invoice may well have matched a catalogue item the demo created.
  previous = (
    await client.query(
      "SELECT blob_url FROM contract WHERE is_demo UNION SELECT blob_url FROM draft WHERE is_demo UNION SELECT blob_url FROM invoice WHERE is_demo AND blob_url IS NOT NULL",
    )
  ).rows.map((row) => row.blob_url);
  await client.query("DELETE FROM invoice WHERE is_demo");
  // Noted before the delete, so a document this database wrote on an earlier
  // run can be cleaned up afterwards. Only these are ever deleted: the blob
  // store is shared across environments, so sweeping a whole path would take
  // another database's documents with it.
  await client.query("DELETE FROM draft WHERE is_demo");
  // Rates cascade from the contract. Before the items, since a rate points at
  // one and the item delete below checks that nothing still does.
  await client.query("DELETE FROM contract WHERE is_demo");
  await client.query(`
    DELETE FROM item
    WHERE is_demo
      AND NOT EXISTS (SELECT 1 FROM line_item li WHERE li.item_id = item.id)
  `);
  await client.query(`
    DELETE FROM vendor
    WHERE is_demo
      AND NOT EXISTS (SELECT 1 FROM invoice i WHERE i.vendor_id = vendor.id)
  `);

  // The generic tax identity is unique across the table, so a real vendor
  // holding one of the demo GSTINs would be caught by the upsert below and
  // quietly renamed to the demo name. Refuse instead: these are invented GSTINs,
  // so a collision means something needs a human, not a silent overwrite.
  const clashes = await client.query(
    `SELECT tax_id, name FROM vendor
     WHERE NOT is_demo AND tax_id_kind = 'gstin' AND normalized_tax_id = ANY($1::text[])`,
    [vendors.map((v) => normalizeTaxId(v.gstin))],
  );
  if (clashes.rows.length) {
    await client.query("ROLLBACK");
    console.error(
      [
        "these vendors are not demo rows but hold a demo GSTIN, so seeding",
        "would overwrite them:",
        ...clashes.rows.map((r) => `  ${r.tax_id}  ${r.name}`),
      ].join("\n"),
    );
    await client.end();
    process.exit(1);
  }

  const vendorIds = new Map();
  for (const vendor of vendors) {
    const { rows } = await client.query(
      `INSERT INTO vendor
         (tax_id, tax_id_kind, normalized_tax_id, name, normalized_name,
          address, normalized_address, is_demo)
       VALUES ($1, 'gstin', $2, $3, $4, $5, $6, true)
       ON CONFLICT (tax_id_kind, normalized_tax_id) WHERE tax_id IS NOT NULL
       DO UPDATE
         SET name = EXCLUDED.name,
             normalized_name = EXCLUDED.normalized_name,
             address = EXCLUDED.address,
             normalized_address = EXCLUDED.normalized_address
       WHERE vendor.is_demo
       RETURNING id`,
      [
        vendor.gstin,
        normalizeTaxId(vendor.gstin),
        vendor.name,
        normalizeName(vendor.name),
        vendor.address,
        normalizeAddress(vendor.address),
      ],
    );
    if (!rows.length) {
      throw new Error(`refused to overwrite a non demo vendor on ${vendor.gstin}`);
    }
    vendorIds.set(vendor.gstin, rows[0].id);
  }

  const itemIds = new Map();
  for (const item of items) {
    // A demo item that a real line item still points at survives the delete
    // above, so reuse it rather than inserting a second one beside it.
    const existing = await client.query(
      "SELECT id FROM item WHERE normalized_name = $1 AND is_demo LIMIT 1",
      [item.normalizedName],
    );
    const { rows } = existing.rows.length
      ? existing
      : await client.query(
          `INSERT INTO item (canonical_name, normalized_name, is_demo)
           VALUES ($1, $2, true) RETURNING id`,
          [item.canonicalName, item.normalizedName],
        );
    itemIds.set(item.normalizedName, rows[0].id);
  }

  let lineCount = 0;
  for (const invoice of invoices) {
    const { rows } = await client.query(
      `INSERT INTO invoice
         (vendor_id, invoice_number, invoice_date, subtotal, taxes, total, status,
          extraction_meta, is_demo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING id`,
      [
        vendorIds.get(invoice.gstin),
        invoice.number,
        invoice.date,
        invoice.subtotal,
        JSON.stringify(invoice.taxes),
        invoice.total,
        invoice.status,
        // Demo rows are labelled as demo rows. Nothing here came from a model,
        // and a screen that says otherwise would be lying to whoever opens it.
        JSON.stringify({ source: "demo-seed" }),
      ],
    );

    for (const line of invoice.lines) {
      await client.query(
        `INSERT INTO line_item
           (invoice_id, raw_description, hsn_code, quantity, unit, unit_price,
            amount, item_id, match_confidence)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          rows[0].id,
          line.description,
          line.itemCode,
          line.quantity,
          line.unit,
          line.unitPrice,
          line.amount,
          itemIds.get(line.normalizedName),
          1,
        ],
      );
      lineCount += 1;
    }
  }

  // The matcher cases (#157). Every line above is already matched, so the
  // suggestion queue was empty and nothing showed the matcher deciding. These
  // go through the real thing: Postgres trigram similarity against the catalogue
  // just written, so the scores on screen are the matcher's and not typed here.
  //
  // Aliases first, since one of the lines only matches through its alias.
  const byDisplayName = new Map(items.map((i) => [i.canonicalName, itemIds.get(i.normalizedName)]));
  for (const { alias, item } of ALIASES) {
    await client.query(
      "INSERT INTO item_alias (item_id, alias, normalized_name) VALUES ($1,$2,$3) ON CONFLICT (normalized_name) DO NOTHING",
      [byDisplayName.get(item), alias, normalizedAlias(alias)],
    );
  }

  // The thresholds in force, as the app would read them, falling back to the
  // defaults when nobody has changed them.
  const saved = (await client.query("SELECT value FROM setting WHERE key = 'matching'")).rows[0]?.value;
  const thresholds = {
    link: saved?.link ?? DEFAULT_LINK,
    suggest: saved?.suggest ?? DEFAULT_SUGGEST,
  };

  const { rows: [matcherRow] } = await client.query(
    `INSERT INTO invoice
       (vendor_id, invoice_number, invoice_date, subtotal, taxes, total, status,
        extraction_meta, is_demo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING id`,
    [
      vendorIds.get(matcherInvoice.gstin),
      matcherInvoice.number,
      matcherInvoice.date,
      matcherInvoice.subtotal,
      JSON.stringify(matcherInvoice.taxes),
      matcherInvoice.total,
      matcherInvoice.status,
      JSON.stringify({ source: "demo-seed" }),
    ],
  );
  // All names first, in one sorted order, as the invoice save does, so a seed
  // running beside a save cannot wait on it while it waits on the seed (#229).
  await lockItemNames(client, matcherInvoice.lines.map((l) => l.description));
  for (const line of matcherInvoice.lines) {
    await saveLine(
      client,
      matcherRow.id,
      {
        description: line.description,
        item_code: line.itemCode,
        quantity: line.quantity,
        unit: line.unit,
        unit_price: line.unitPrice,
        amount: line.amount,
      },
      thresholds,
      { demo: true },
    );
    lineCount += 1;
  }

  // Contracts last: a rate points at an item and a contract at a vendor, so
  // both have to be in place first.
  let rateCount = 0;
  for (const contract of contracts) {
    const pdf = contractPdf(contract.pages);
    const digest = createHash("sha256").update(pdf).digest("hex");
    const blob = await put(`contracts/demo/${digest.slice(0, 12)}.pdf`, pdf, {
      access: "private",
      contentType: "application/pdf",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    uploaded.push(blob.url);

    const { rows } = await client.query(
      `INSERT INTO contract
         (vendor_id, title, blob_url, content_type, pages, status, digest,
          other_terms, extraction, extraction_meta, reviewed_at, is_demo,
          effective_from, effective_to)
       VALUES ($1,$2,$3,'application/pdf',$4,'reviewed',$5,$6,$7,$8,now(),true,$9,$10)
       RETURNING id`,
      [
        vendorIds.get(contract.gstin),
        contract.title,
        blob.url,
        contract.pages.length,
        digest,
        JSON.stringify(contract.otherTerms),
        // The shape a read leaves behind, so the contract screen has the same
        // thing to show as it would for a real document.
        JSON.stringify({
          vendor_name: vendors.find((v) => v.gstin === contract.gstin)?.name ?? null,
          vendor_address: null,
          tax_id: contract.gstin,
          tax_id_kind: "gstin",
          currency: "INR",
          effective_from: contract.effectiveFrom,
          effective_to: contract.effectiveTo,
          rates: contract.rates.map((rate) => ({
            printed_name: rate.printedName,
            unit: rate.unit,
            rate: rate.rate,
            effective_from: rate.effectiveFrom,
            effective_to: rate.effectiveTo,
            page: rate.page,
            quote: rate.quote,
          })),
          other_terms: contract.otherTerms,
        }),
        // Labelled as a demo row, the same as the invoices. Nothing here came
        // from a model and a screen that said otherwise would be lying.
        JSON.stringify({ source: "demo-seed" }),
        contract.effectiveFrom,
        contract.effectiveTo,
      ],
    );

    for (const rate of contract.rates) {
      await client.query(
        `INSERT INTO contract_rate
           (contract_id, vendor_id, item_id, printed_name, unit, rate, currency,
            effective_from, effective_to, source_page, source_quote, reviewed)
         VALUES ($1,$2,$3,$4,$5,$6,'INR',$7,$8,$9,$10,true)`,
        [
          rows[0].id,
          vendorIds.get(contract.gstin),
          rate.item ? itemIds.get(rate.item) : null,
          rate.printedName,
          rate.unit,
          rate.rate,
          rate.effectiveFrom,
          rate.effectiveTo,
          rate.page,
          rate.quote,
        ],
      );
      rateCount += 1;
    }
  }

  // A draft left waiting, so the review screen has something to show (#206).
  // Its document is a PNG the demo wrote, since the screenshot browser cannot
  // show a PDF inline.
  const png = invoicePng(draftText());
  // A random suffix, unlike the contracts: the image bytes never change, so a
  // path from the digest would be shared by every database using this blob
  // store, and discarding the draft in one would delete the other's image.
  const pngBlob = await put("drafts/demo/invoice.png", png, {
    access: "private",
    contentType: "image/png",
    addRandomSuffix: true,
  });
  uploaded.push(pngBlob.url);
  const waiting = demoDraft();
  await client.query(
    `INSERT INTO draft
       (blob_url, file_name, content_type, extracted, discrepancies, status,
        extraction_meta, is_demo)
     VALUES ($1,$2,'image/png',$3,$4,'needs_review',$5,true)`,
    [
      pngBlob.url,
      `${waiting.invoice.number.replace("/", "-")}.png`,
      JSON.stringify(waiting.extracted),
      JSON.stringify(waiting.discrepancies),
      JSON.stringify({ source: "demo-seed" }),
    ],
  );

  // Counted from the database while the transaction is open, since the matcher
  // can create items the dataset does not list.
  const { rows: [{ n: itemCount }] } = await client.query(
    "SELECT count(*)::int AS n FROM item WHERE is_demo",
  );

  await client.query("COMMIT");
  committed = true;

  const seeded = [...invoices, matcherInvoice];
  const spend = seeded
    .filter((i) => i.status === "confirmed")
    .reduce((sum, i) => sum + i.total, 0);

  console.log(
    `seeded ${vendors.length} vendors, ${itemCount} items, ` +
      `${seeded.length} invoices, ${lineCount} line items, ` +
      `${contracts.length} contracts, ${rateCount} rates`,
  );
  console.log(
    `confirmed spend Rs${spend.toFixed(2)}, ` +
      `${seeded.filter((i) => i.status === "needs_review").length} needing review`,
  );

  contractVendorIds = [...new Set(contracts.map((c) => c.gstin))].map((gstin) =>
    vendorIds.get(gstin),
  );
} catch (error) {
  await client.query("ROLLBACK");

  // A demo document's path comes from its own digest and is written with
  // overwrite, so a reseed of an unchanged contract writes the same bytes to
  // the same place. After the rollback the previous row is back and still
  // points there, so deleting it would leave a committed contract with no
  // document. Only remove what nothing points at.
  for (const uploadedUrl of uploaded) {
    const { rowCount } = await client.query(
      "SELECT 1 FROM contract WHERE blob_url = $1 UNION SELECT 1 FROM draft WHERE blob_url = $1 UNION SELECT 1 FROM invoice WHERE blob_url = $1",
      [uploadedUrl],
    );
    if (!rowCount) await del(uploadedUrl).catch(() => {});
  }

  console.error("seed failed, nothing was written:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

// Past this point the data is committed. Anything that fails here is worth
// reporting and is not worth deleting a document over, which is why it is
// outside the block that cleans blobs up.
if (committed) {
  const { pool } = await import("../lib/db.ts");
  try {
    // First, before anything that can fail. The rows that named these
    // documents are already gone, so if this is skipped nothing afterwards
    // knows the urls and the files stay in paid storage for good.
    //
    // Editing a demo contract changes its text, so its digest and its path
    // change with it, and the document the last run wrote is left behind with
    // nothing pointing at it. Only the ones this database had before are
    // considered, and only where nothing points at them now.
    const live = new Set(
      (
        await pool.query("SELECT blob_url FROM contract UNION SELECT blob_url FROM draft UNION SELECT blob_url FROM invoice WHERE blob_url IS NOT NULL")
      ).rows.map((row) => row.blob_url),
    );
    let swept = 0;
    for (const old of new Set(previous)) {
      if (live.has(old)) continue;
      await del(old).catch(() => {});
      swept += 1;
    }
    if (swept) console.log(`removed ${swept} demo contract document(s) nothing points at`);

    // The tags a visitor sees are written by the function that writes the real
    // ones. A demo whose findings were typed in would agree with itself and
    // prove nothing about the check.
    const { recomputeVariance } = await import("../lib/contracts/recompute.ts");
    let checked = 0;
    for (const vendorId of contractVendorIds) checked += await recomputeVariance(vendorId);

    const tags = await pool.query(
      `SELECT variance_tag, count(*)::int AS n FROM line_item
       WHERE variance_tag IS NOT NULL GROUP BY variance_tag ORDER BY n DESC`,
    );
    console.log(`checked ${checked} lines against those contracts:`);
    for (const row of tags.rows) console.log(`  ${row.variance_tag}: ${row.n}`);

  } catch (error) {
    console.error("the data is in, but the variance pass did not finish:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
