/**
 * What the review screen says about page jumps, when it says anything.
 *
 * Two different facts used to share one sentence. A document with no text is
 * a scan, and nothing in it can be located. A document with text where no
 * quote matched is not a scan: the model reformatted what it quoted (#136),
 * and the screen should say that instead (#135).
 */

/** More than a stray page number or mark on at least one page. */
export function hasTextLayer(pages: { flat: string }[]): boolean {
  return pages.some((p) => p.flat.length > 20);
}

/**
 * `textLayer` is undefined for a contract read before it was stored, and then
 * no scan is claimed: the old guess is what called text a scan.
 */
export function pageNote(
  textLayer: boolean | undefined,
  rates: { source_page: number | null }[],
): "scan" | "unmatched" | null {
  if (textLayer === false) return "scan";
  if (rates.length > 0 && rates.every((r) => r.source_page === null)) return "unmatched";
  return null;
}
