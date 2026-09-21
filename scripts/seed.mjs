// Loads the demo dataset into the database. Safe to re-run: it clears the demo
// tables first, so this is also the "reset demo data" action from settings.
//
// Run: npm run seed
import pg from "pg";

const { invoices, items, vendors } = await import("../lib/demo/dataset.ts");
const { validateArithmetic } = await import("../lib/extract/validate.ts");

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run `vercel env pull` first.");
  process.exit(1);
}

// Every invoice goes through the same checks a real extraction would, so the
// demo data cannot quietly contradict the validator it is meant to demonstrate.
for (const invoice of invoices) {
  const result = validateArithmetic({
    vendor_name: "",
    gstin: invoice.gstin,
    invoice_number: invoice.number,
    invoice_date: invoice.date,
    line_items: invoice.lines.map((l) => ({
      description: l.description,
      hsn_code: l.hsn,
      quantity: l.quantity,
      unit: l.unit,
      unit_price: l.unitPrice,
      amount: l.amount,
    })),
    subtotal: invoice.subtotal,
    cgst: invoice.cgst,
    sgst: invoice.sgst,
    igst: invoice.igst,
    total: invoice.total,
  });

  if (result.status !== invoice.status) {
    console.error(
      `${invoice.number} is marked ${invoice.status} but validates as ${result.status}.`,
    );
    process.exit(1);
  }
}

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  await client.query("BEGIN");

  // Order matters: line_item references both invoice and item.
  await client.query("TRUNCATE line_item, invoice, item, vendor RESTART IDENTITY CASCADE");

  const vendorIds = new Map();
  for (const vendor of vendors) {
    const { rows } = await client.query(
      `INSERT INTO vendor (gstin, name, normalized_name, address)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [vendor.gstin, vendor.name, vendor.name.toLowerCase(), vendor.address],
    );
    vendorIds.set(vendor.gstin, rows[0].id);
  }

  const itemIds = new Map();
  for (const item of items) {
    const { rows } = await client.query(
      "INSERT INTO item (canonical_name, normalized_name) VALUES ($1, $2) RETURNING id",
      [item.canonicalName, item.normalizedName],
    );
    itemIds.set(item.normalizedName, rows[0].id);
  }

  let lineCount = 0;
  for (const invoice of invoices) {
    const { rows } = await client.query(
      `INSERT INTO invoice
         (vendor_id, invoice_number, invoice_date, subtotal, cgst, sgst, igst,
          total, status, extraction_meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        vendorIds.get(invoice.gstin),
        invoice.number,
        invoice.date,
        invoice.subtotal,
        invoice.cgst,
        invoice.sgst,
        invoice.igst,
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
          line.hsn,
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

  await client.query("COMMIT");

  const spend = invoices
    .filter((i) => i.status === "confirmed")
    .reduce((sum, i) => sum + i.total, 0);

  console.log(
    `seeded ${vendors.length} vendors, ${items.length} items, ` +
      `${invoices.length} invoices, ${lineCount} line items`,
  );
  console.log(
    `confirmed spend Rs${spend.toFixed(2)}, ` +
      `${invoices.filter((i) => i.status === "needs_review").length} needing review`,
  );
} catch (error) {
  await client.query("ROLLBACK");
  console.error("seed failed, nothing was written:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
