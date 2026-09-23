import "server-only";
import { PDFDocument } from "pdf-lib";

/**
 * Pages in a PDF, or null when pdf-lib cannot open it. Callers refuse a null:
 * a file whose length is unknown cannot be held to the page limit.
 */
export async function countPages(bytes: ArrayBuffer | Uint8Array): Promise<number | null> {
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    return pdf.getPageCount();
  } catch {
    return null;
  }
}
