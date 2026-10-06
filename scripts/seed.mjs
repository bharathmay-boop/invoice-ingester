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
const { contractPdf } = await import("../lib/demo/contract-pdf.ts");
const { validateArithmetic } = await import("../lib/extract/validate.ts");
const { normalizeAddress, normalizeTaxId } = await import("../lib/vendors/normalize.ts");

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run `vercel env pull` first.");
  process.exit(1);
}

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

try {
  await client.query("BEGIN");

  // Only demo rows. Truncating these tables would delete real uploaded
  // invoices, which share them.
  //
  // Invoices first, taking their line items with them by cascade. Items and
  // vendors go next, but only where nothing real still points at them: a real
  // invoice may well have matched a catalogue item the demo created.
  await client.query("DELETE FROM invoice WHERE is_demo");
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
        vendor.name.toLowerCase(),
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
          other_terms, extraction, extraction_meta, reviewed_at, is_demo)
       VALUES ($1,$2,$3,'application/pdf',$4,'reviewed',$5,$6,$7,$8,now(),true)
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

  await client.query("COMMIT");

  const spend = invoices
    .filter((i) => i.status === "confirmed")
    .reduce((sum, i) => sum + i.total, 0);

  console.log(
    `seeded ${vendors.length} vendors, ${items.length} items, ` +
      `${invoices.length} invoices, ${lineCount} line items, ` +
      `${contracts.length} contracts, ${rateCount} rates`,
  );
  console.log(
    `confirmed spend Rs${spend.toFixed(2)}, ` +
      `${invoices.filter((i) => i.status === "needs_review").length} needing review`,
  );

  // The tags a visitor sees are written by the function that writes the real
  // ones. A demo whose findings were typed in would agree with itself and
  // prove nothing about the check.
  const { recomputeVariance } = await import("../lib/contracts/recompute.ts");
  let checked = 0;
  for (const gstin of new Set(contracts.map((c) => c.gstin))) {
    checked += await recomputeVariance(vendorIds.get(gstin));
  }

  const { pool } = await import("../lib/db.ts");
  const tags = await pool.query(
    `SELECT variance_tag, count(*)::int AS n FROM line_item
     WHERE variance_tag IS NOT NULL GROUP BY variance_tag ORDER BY n DESC`,
  );
  await pool.end();
  console.log(`checked ${checked} lines against those contracts:`);
  for (const row of tags.rows) console.log(`  ${row.variance_tag}: ${row.n}`);
} catch (error) {
  await client.query("ROLLBACK");
  for (const url of uploaded) await del(url).catch(() => {});
  console.error("seed failed, nothing was written:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
