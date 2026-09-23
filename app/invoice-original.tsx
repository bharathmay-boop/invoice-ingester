"use client";

import { FileTextIcon, ExternalLinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { originalHref, originalSrc } from "@/lib/original.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Props = {
  invoiceNumber: string;
  date: string;
  blobUrl: string | null;
  contentType: string | null;
  firstPage: number | null;
};

/**
 * The original document behind a figure, opened over the screen you were on.
 *
 * A dialog rather than a new tab: checking one number should not cost your
 * place in a list of forty. The link inside covers the cases a dialog is wrong
 * for, printing it or reading it full size.
 */
export function InvoiceOriginal({ invoiceNumber, date, blobUrl, contentType, firstPage }: Props) {
  // Nothing to show, or no way to know how to show it. Seeded demo invoices
  // have no original at all; an invoice saved before the content type was
  // recorded, and whose file name did not say what it was, cannot be rendered
  // without guessing, and a PDF guessed as an image renders as a broken box.
  // An icon that opens one of those is worse than no icon.
  if (!blobUrl || !contentType) return null;

  const src = originalSrc(blobUrl);
  const isPdf = contentType === "application/pdf";
  // The browser's PDF viewer opens where the fragment says, so a file holding
  // several invoices opens on this one.
  const at = originalHref(blobUrl, contentType, firstPage);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Show the original of invoice ${invoiceNumber}`}>
          <FileTextIcon />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Invoice {invoiceNumber}</DialogTitle>
          <DialogDescription>
            {date}
            {isPdf && firstPage ? ` · from page ${firstPage} of the file` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="border-border bg-muted/30 overflow-hidden rounded-lg border">
          {isPdf ? (
            <object data={at} type="application/pdf" className="h-[70vh] w-full" aria-label={`The original of invoice ${invoiceNumber}`}>
              <p className="p-6 text-sm">
                This browser will not display the PDF here. Open it in a new tab instead.
              </p>
            </object>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={`The original of invoice ${invoiceNumber}`} className="max-h-[70vh] w-full object-contain" />
          )}
        </div>

        <Button variant="outline" size="sm" asChild className="self-start">
          <a href={at} target="_blank" rel="noopener noreferrer">
            <ExternalLinkIcon />
            Open in a new tab
          </a>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
