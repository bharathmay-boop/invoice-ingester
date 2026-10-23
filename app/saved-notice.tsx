import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { query } from "@/lib/db.ts";

/**
 * "Saved", on whichever screen a save lands on, with the invoice it was and a
 * way to it. Nothing at all when the id names no invoice (#247).
 */
export async function SavedNotice({ invoiceId }: { invoiceId: string | null }) {
  if (!invoiceId) return null;
  const [invoice] = await query<{ invoice_number: string; vendor_name: string }>(
    `SELECT i.invoice_number, v.name AS vendor_name
     FROM invoice i JOIN vendor v ON v.id = i.vendor_id WHERE i.id = $1`,
    [invoiceId],
  );
  if (!invoice) return null;

  return (
    <Alert className="mb-6 motion-safe:animate-[fade-up_0.35s_ease-out_backwards]" role="status">
      <CheckIcon className="motion-safe:animate-[tick_0.4s_ease-out_0.1s_backwards]" aria-hidden />
      <AlertTitle>Saved</AlertTitle>
      <AlertDescription>
        <span>
          {invoice.invoice_number} from {invoice.vendor_name}.{" "}
          <Link href={`/invoices/${invoiceId}`} className="underline underline-offset-4">
            Open it
          </Link>
        </span>
      </AlertDescription>
    </Alert>
  );
}
