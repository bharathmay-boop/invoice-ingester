import { notFound } from "next/navigation";
import { query } from "@/lib/db.ts";
import type { ExtractedInvoice } from "@/lib/extract/schema.ts";
import { describeDiscrepancy, isValidityWarning, type Discrepancy } from "@/lib/extract/validate.ts";
import { ReviewForm } from "./review-form.tsx";

export const dynamic = "force-dynamic";

export const metadata = { title: "Review" };

type DraftRow = {
  id: string;
  blob_url: string;
  file_name: string;
  content_type: string;
  extracted: ExtractedInvoice;
  discrepancies: Discrepancy[];
  first_page: number | null;
  last_page: number | null;
  /** Drafts from the same file still waiting, this one included. */
  siblings: number;
};

export default async function Review({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [draft] = await query<DraftRow>(
    `SELECT id, blob_url, file_name, content_type, extracted, discrepancies,
            first_page, last_page,
            (SELECT count(*)::int FROM draft s WHERE s.blob_url = d.blob_url) AS siblings
     FROM draft d WHERE id = $1`,
    [id],
  );
  if (!draft) notFound();

  const original = `/api/original?url=${encodeURIComponent(draft.blob_url)}`;
  // The browser's PDF viewer opens at a page given in the fragment, so the
  // invoice being reviewed is the one on screen.
  const atPage = draft.first_page ? `${original}#page=${draft.first_page}` : original;
  const pages =
    draft.first_page && draft.last_page && draft.last_page > draft.first_page
      ? `pages ${draft.first_page} to ${draft.last_page}`
      : draft.first_page
        ? `page ${draft.first_page}`
        : null;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-semibold sm:text-3xl">Review</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        {draft.file_name}
        {draft.siblings > 1 && (
          <>
            {" · "}
            <span className="text-foreground font-medium">
              {draft.siblings} invoices from this file left to review
            </span>
          </>
        )}
        {pages && draft.content_type === "application/pdf" && <> · {pages}</>}
      </p>

      {/* Side by side is the design. Checking an extraction means comparing it
          to its source, and a layout that makes you hold a number in your head
          while you scroll has already failed. */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="lg:sticky lg:top-6 lg:self-start">
          <h2 className="text-sm font-medium">Original</h2>
          <div className="border-border bg-muted/30 mt-3 overflow-hidden rounded-lg border">
            {draft.content_type === "application/pdf" ? (
              <object
                // Keyed on the page: an <object> does not reload when only the
                // fragment of its data changes.
                key={atPage}
                data={atPage}
                type="application/pdf"
                className="h-[70vh] w-full"
                aria-label={`The original of ${draft.file_name}`}
              >
                <p className="p-6 text-sm">
                  This browser will not display the PDF inline.{" "}
                  <a href={atPage} className="underline">
                    Open it in a new tab
                  </a>
                  .
                </p>
              </object>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={original}
                alt={`The original of ${draft.file_name}`}
                className="max-h-[70vh] w-full object-contain"
              />
            )}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium">Extracted</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Everything here is editable. Nothing is stored until you save.
          </p>
          <div className="mt-3">
            <ReviewForm
              draftId={draft.id}
              initial={draft.extracted}
              problems={draft.discrepancies
                .filter((d) => !isValidityWarning(d))
                .map(describeDiscrepancy)}
              warnings={draft.discrepancies.filter(isValidityWarning).map(describeDiscrepancy)}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
