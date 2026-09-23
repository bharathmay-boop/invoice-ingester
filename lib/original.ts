/**
 * Where to fetch a stored original, and where to open it.
 *
 * Shared by the review screen and the preview dialog so both open a multi
 * invoice PDF on the same page. Pure, so the page fragment is covered by a
 * test rather than by clicking.
 */
export function originalSrc(blobUrl: string): string {
  return `/api/original?url=${encodeURIComponent(blobUrl)}`;
}

export function originalHref(
  blobUrl: string,
  contentType: string | null,
  firstPage: number | null,
): string {
  const src = originalSrc(blobUrl);
  // Only a PDF viewer understands #page. On an image the fragment would be
  // ignored at best, and is noise in a URL people copy.
  return contentType === "application/pdf" && firstPage && firstPage > 1
    ? `${src}#page=${firstPage}`
    : src;
}
