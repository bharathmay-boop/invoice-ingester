import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * Which page a quote is actually on.
 *
 * Not the page the model said. A model asked for a page number always gives
 * one, and a wrong jump is worse than no jump: the reviewer lands on page 112,
 * sees nothing, and stops trusting every jump in the product. There is no way
 * for them to tell a wrong jump from a field they misread.
 *
 * A string search either finds the quote or it does not. When it does, the
 * page is a fact. When it does not, that is worth knowing too: the model
 * produced a figure it cannot point at, which is a better reason to look
 * closely than any confidence score.
 */

export type Located = {
  /** The page the quote was actually found on, 1 based. */
  page: number | null;
  /** True when the document had no text layer at all, so nothing can be found. */
  scanned: boolean;
};

/**
 * Loose enough to survive the differences that do not matter and tight enough
 * to still be a match: case, runs of whitespace, and the handful of characters
 * a PDF renders differently from how a model repeats them back.
 */
function flatten(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export type PageText = { page: number; flat: string };

/** Every page's text, once, so a contract's quotes are located in one pass. */
export async function readPages(bytes: Uint8Array): Promise<PageText[]> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return (text as string[]).map((page, i) => ({ page: i + 1, flat: flatten(page) }));
}

/**
 * Where a quote is, given the pages already read.
 *
 * A quote the model shortened or joined across a line break will not be found
 * whole, so a long one is also tried by its first clause. Below that it stops:
 * matching on a few words finds the wrong page confidently, which is the thing
 * this exists to avoid.
 */
export function locate(pages: PageText[], quote: string | null): Located {
  if (!pages.length) return { page: null, scanned: true };
  if (!pages.some((p) => p.flat.length > 20)) return { page: null, scanned: true };
  if (!quote) return { page: null, scanned: false };

  const needle = flatten(quote);
  if (needle.length < 12) return { page: null, scanned: false };

  const whole = pages.find((p) => p.flat.includes(needle));
  if (whole) return { page: whole.page, scanned: false };

  // The first forty characters, which is usually the item and its rate and is
  // past the point where a shorter string would match anywhere.
  if (needle.length > 40) {
    const head = needle.slice(0, 40);
    const partial = pages.find((p) => p.flat.includes(head));
    if (partial) return { page: partial.page, scanned: false };
  }

  return { page: null, scanned: false };
}
