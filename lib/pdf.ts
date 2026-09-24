import "server-only";
import { PDFDocument } from "pdf-lib";

/**
 * Pages in a PDF, or null when pdf-lib cannot open it. Callers refuse a null:
 * a file whose length is unknown cannot be held to the page limit.
 */
export type PdfFacts = { pages: number; encrypted: boolean };

export async function readPdf(bytes: ArrayBuffer | Uint8Array): Promise<PdfFacts | null> {
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    // Loaded with encryption ignored, so the page count is readable even when
    // the content is not. A model would get the same locked file and fail
    // after being paid, so this is worth catching at the door.
    return { pages: pdf.getPageCount(), encrypted: pdf.isEncrypted };
  } catch {
    return null;
  }
}

export async function countPages(bytes: ArrayBuffer | Uint8Array): Promise<number | null> {
  return (await readPdf(bytes))?.pages ?? null;
}
