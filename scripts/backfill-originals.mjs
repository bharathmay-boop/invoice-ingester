// Content types for invoices saved before the column existed.
//
// Their drafts are long gone. The file name is not evidence: uploads are
// accepted on the type the browser reports and keep whatever name they came
// with, so a JPEG called invoice.pdf is possible. The bytes are evidence, so
// this reads the first few of each stored original and matches the signature.
//
// One off, and safe to run twice: it only touches rows that still have no type.
import { get } from "@vercel/blob";
import pg from "pg";

const SIGNATURES = [
  { type: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
];

/** WebP is "RIFF" then four size bytes then "WEBP", so it needs both halves. */
function sniff(buffer) {
  for (const { type, bytes } of SIGNATURES) {
    if (bytes.every((b, i) => buffer[i] === b)) return type;
  }
  const riff = buffer.subarray(0, 4).toString("latin1") === "RIFF";
  const webp = buffer.subarray(8, 12).toString("latin1") === "WEBP";
  return riff && webp ? "image/webp" : null;
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});
await client.connect();

const { rows } = await client.query(
  "SELECT id, blob_url FROM invoice WHERE blob_url IS NOT NULL AND content_type IS NULL",
);
console.log(`${rows.length} invoice(s) with an original and no content type`);

let named = 0;
for (const row of rows) {
  // Read through the blob client: these are private, so the URL alone fetches
  // nothing without the store's credentials.
  const stored = await get(row.blob_url, { access: "private" }).catch(() => null);
  if (!stored) {
    console.warn(`  ${row.id}: the file is gone, leaving it unset`);
    continue;
  }

  const bytes = Buffer.from(await new Response(stored.stream).arrayBuffer());
  const type = sniff(bytes.subarray(0, 16));
  if (!type) {
    console.warn(`  ${row.id}: unrecognised file, leaving it unset`);
    continue;
  }

  await client.query("UPDATE invoice SET content_type = $1 WHERE id = $2", [type, row.id]);
  named += 1;
  console.log(`  ${row.id}: ${type}`);
}

console.log(`${named} updated, ${rows.length - named} left unset`);
await client.end();
