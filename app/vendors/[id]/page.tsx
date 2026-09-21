import Link from "next/link";
import { notFound } from "next/navigation";
import { getVendor, listVendorInvoices } from "@/lib/queries.ts";
import { formatDate, money, moneyRounded } from "@/lib/format.ts";
import { DemoNotice, Empty, Page, Stat, StatusBadge } from "../../ui.tsx";

export const dynamic = "force-dynamic";

export default async function VendorDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // A bad id in the URL is a 404, not a crash.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const vendor = await getVendor(id);
  if (!vendor) notFound();

  const invoices = await listVendorInvoices(id);

  return (
    <Page title={vendor.name} lead={vendor.address ?? undefined}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Total spend"
          value={moneyRounded(vendor.spend)}
          note="Confirmed invoices only"
        />
        <Stat
          label="Invoices"
          value={String(vendor.invoice_count)}
          note={vendor.needs_review > 0 ? `${vendor.needs_review} need checking` : "All checked"}
        />
        <Stat label="GSTIN" value={vendor.gstin ?? "Not on file"} />
      </div>

      <h2 className="mt-10 text-lg font-semibold">Invoices</h2>
      {invoices.length === 0 ? (
        <Empty title="No invoices from this vendor yet" />
      ) : (
        <ul className="mt-3 divide-y divide-black/10 dark:divide-white/15">
          {invoices.map((invoice) => (
            <li
              key={invoice.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
            >
              <span className="flex flex-col">
                <span className="font-medium">{invoice.invoice_number}</span>
                <span className="text-xs opacity-60">
                  {formatDate(invoice.invoice_date)}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <StatusBadge status={invoice.status} />
                <span className="font-semibold tabular-nums">{money(invoice.total)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 text-sm">
        <Link href="/vendors" className="underline">
          All vendors
        </Link>
      </p>
      <DemoNotice />
    </Page>
  );
}
