// A PDF for a demo contract, written by hand.
//
// The demo contracts need a document for the same reason the real ones do: a
// rate nobody can point at is a claim rather than a fact, and the review screen
// opens the page a rate was read from. `contract.blob_url` is NOT NULL, so the
// alternative was a url pointing at nothing and an empty viewer beside rates
// claiming to come from it.
//
// Written here rather than with a library because the whole need is text at a
// position on a page, which is about forty lines of PDF, and because the demo
// then owns its own documents: the quote stored against a rate is a line this
// file wrote, so "jump to the page and find the quote" is guaranteed rather
// than hoped for.

/** A page of lines, in order. Page numbers count from 1, as they do on screen. */
export type PdfPage = string[];

const ESCAPES: Record<string, string> = { "\\": "\\\\", "(": "\\(", ")": "\\)" };

function escape(text: string): string {
  return text.replace(/[\\()]/g, (c) => ESCAPES[c]);
}

// Courier, because the rate tables are columns held by spaces. In a
// proportional face they stop lining up and the document reads as though it
// were typed by someone in a hurry.
const FONT_SIZE = 10;
const LEADING = 14;
const LEFT = 56;
const TOP = 780;

function content(lines: string[]): string {
  return [
    "BT",
    `/F1 ${FONT_SIZE} Tf`,
    `${LEADING} TL`,
    `1 0 0 1 ${LEFT} ${TOP} Tm`,
    ...lines.map((line) => `(${escape(line)}) Tj T*`),
    "ET",
  ].join("\n");
}

/**
 * One A4 PDF per page of lines.
 *
 * Uncompressed, so the text is extractable by anything that reads a PDF,
 * including `unpdf`, which is what locates a quote on a page.
 */
export function contractPdf(pages: PdfPage[]): Uint8Array {
  if (!pages.length) throw new Error("a contract needs at least one page");

  const streams = pages.map((lines) => Buffer.from(content(lines), "latin1"));
  const pageIds = pages.map((_, i) => 4 + i * 2);

  const objects: Buffer[] = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from(
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    ),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"),
  ];

  for (const [i, stream] of streams.entries()) {
    objects.push(
      Buffer.from(
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] " +
          `/Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`,
      ),
      Buffer.concat([
        Buffer.from(`<< /Length ${stream.length} >>\nstream\n`),
        stream,
        Buffer.from("\nendstream"),
      ]),
    );
  }

  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets: number[] = [];
  let at = parts[0].length;

  for (const [i, object] of objects.entries()) {
    const body = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`),
      object,
      Buffer.from("\nendobj\n"),
    ]);
    offsets.push(at);
    at += body.length;
    parts.push(body);
  }

  const xrefAt = at;
  parts.push(
    Buffer.from(
      [
        `xref`,
        `0 ${objects.length + 1}`,
        "0000000000 65535 f ",
        ...offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
        "trailer",
        `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
        "startxref",
        String(xrefAt),
        "%%EOF",
        "",
      ].join("\n"),
    ),
  );

  return new Uint8Array(Buffer.concat(parts));
}
