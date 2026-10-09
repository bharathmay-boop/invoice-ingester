import Link from "next/link";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { listVendorChoices } from "@/lib/queries.ts";
import { listInvoices } from "@/lib/invoices/queries.ts";
import { INVOICE_PAGE, parseInvoiceFilter } from "@/lib/invoices/filter.ts";
import { formatDate, money } from "@/lib/format.ts";
import { DemoNotice, Empty, Page, StatusBadge } from "../ui.tsx";
import { InvoiceOriginal } from "../invoice-original.tsx";
import { InvoiceFilters } from "./invoice-filters.tsx";

export const dynamic = "force-dynamic";

export const metadata = { title: "Invoices" };

export default async function Invoices({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filter = parseInvoiceFilter(await searchParams);
  const [rows, vendors] = await Promise.all([
    listInvoices(filter, INVOICE_PAGE),
    listVendorChoices(),
  ]);
  const shown = rows.slice(0, INVOICE_PAGE);
  const more = rows.length > INVOICE_PAGE;
  const filtered = Boolean(filter.vendorId || filter.from || filter.to);

  // Originals are only readable with a session, so the icon is only offered
  // with one. An icon that answers 401 is worse than no icon.
  const jar = await cookies();
  const signedIn = await isValidSession(jar.get(sessionCookie.name)?.value);

  return (
    <Page title="Invoices" lead="Every invoice you have saved, newest first.">
      <InvoiceFilters
        vendors={vendors}
        vendorId={filter.vendorId}
        from={filter.from}
        to={filter.to}
      />

      <div className="mt-6">
        {shown.length === 0 ? (
          filtered ? (
            <Empty
              title="No invoices match"
              action={{ href: "/invoices", label: "Clear the filters" }}
            >
              Nothing saved for that supplier in that range. Widening the dates is
              the usual fix.
            </Empty>
          ) : (
            <Empty title="No invoices yet" action={{ href: "/upload", label: "Upload an invoice" }}>
              Invoices appear here once they have been checked and saved.
            </Empty>
          )
        ) : (
          <ul className="divide-y divide-black/10 dark:divide-white/15">
            {shown.map((invoice) => (
              <li
                key={invoice.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
              >
                <Link
                  href={`/invoices/${invoice.id}`}
                  className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 hover:opacity-80"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{invoice.vendor_name}</span>
                    <span className="text-xs opacity-60">
                      {invoice.invoice_number} · {formatDate(invoice.invoice_date)}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    {invoice.findings > 0 && (
                      <span className="text-xs opacity-70">
                        {invoice.findings} {invoice.findings === 1 ? "finding" : "findings"}
                      </span>
                    )}
                    <StatusBadge status={invoice.status} />
                    <span className="font-semibold tabular-nums">
                      {money(invoice.total, invoice.currency)}
                    </span>
                  </span>
                </Link>
                {signedIn && (
                  <InvoiceOriginal
                    invoiceNumber={invoice.invoice_number}
                    date={formatDate(invoice.invoice_date)}
                    blobUrl={invoice.blob_url}
                    contentType={invoice.content_type}
                    firstPage={invoice.first_page}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {more && (
        <p className="mt-4 text-sm opacity-70">
          Showing the newest {INVOICE_PAGE}. Narrow by supplier or dates to see older ones.
        </p>
      )}
      <DemoNotice />
    </Page>
  );
}
