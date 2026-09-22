import { notFound } from "next/navigation";
import { query } from "@/lib/db.ts";
import type { ExtractedInvoice } from "@/lib/extract/schema.ts";
import { describeDiscrepancy, type Discrepancy } from "@/lib/extract/validate.ts";
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
};

export default async function Review({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [draft] = await query<DraftRow>(
    `SELECT id, blob_url, file_name, content_type, extracted, discrepancies
     FROM draft WHERE id = $1`,
    [id],
  );
  if (!draft) notFound();

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-semibold sm:text-3xl">Review</h1>
      <p className="text-muted-foreground mt-2 text-sm">{draft.file_name}</p>

      {/* Side by side is the design. Checking an extraction means comparing it
          to its source, and a layout that makes you hold a number in your head
          while you scroll has already failed. */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="lg:sticky lg:top-6 lg:self-start">
          <h2 className="text-sm font-medium">Original</h2>
          <div className="border-border bg-muted/30 mt-3 overflow-hidden rounded-lg border">
            {draft.content_type === "application/pdf" ? (
              <object
                data={`/api/original?url=${encodeURIComponent(draft.blob_url)}`}
                type="application/pdf"
                className="h-[70vh] w-full"
                aria-label={`The original of ${draft.file_name}`}
              >
                <p className="p-6 text-sm">
                  This browser will not display the PDF inline.{" "}
                  <a href={`/api/original?url=${encodeURIComponent(draft.blob_url)}`} className="underline">
                    Open it in a new tab
                  </a>
                  .
                </p>
              </object>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/original?url=${encodeURIComponent(draft.blob_url)}`}
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
              problems={draft.discrepancies.map(describeDiscrepancy)}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
