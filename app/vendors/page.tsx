import Link from "next/link";
import { listVendors } from "@/lib/queries.ts";
import { money } from "@/lib/format.ts";
import { savedFrom } from "@/lib/save-ack.ts";
import { DemoNotice, Empty, Page } from "../ui.tsx";
import { LINK_FEEDBACK, rowEnter } from "@/lib/reveal.ts";
import { SavedNotice } from "../saved-notice.tsx";

export const dynamic = "force-dynamic";

export const metadata = { title: "Vendors" };

export default async function Vendors({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string | string[] }>;
}) {
  const [vendors, { saved }] = await Promise.all([listVendors(), searchParams]);

  return (
    <Page title="Vendors" lead="Everyone you have bought from, by what you have spent.">
      <SavedNotice invoiceId={savedFrom(saved)} />
      {vendors.length === 0 ? (
        <Empty title="No vendors yet" action={{ href: "/upload", label: "Upload an invoice" }}>
          Vendors appear here once an invoice has been saved. A tax registration,
          address, or name keeps matching suppliers consistent without making one
          country&apos;s tax system special.
        </Empty>
      ) : (
        <ul className="divide-y divide-black/10 dark:divide-white/15">
          {vendors.map((vendor, i) => (
            <li key={`${vendor.id}-${vendor.currency}`} {...rowEnter(i)}>
              <Link
                href={`/vendors/${vendor.id}`}
                className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-4 ${LINK_FEEDBACK}`}
              >
                <span className="flex flex-col">
                  <span className="font-medium">{vendor.name}</span>
                  <span className="text-xs opacity-60">
                    {vendor.tax_id ?? "No tax number on file"}
                  </span>
                </span>
                <span className="flex flex-col items-end">
                  <span className="font-semibold tabular-nums">
                    {money(vendor.spend, vendor.currency)}
                  </span>
                  <span className="text-xs opacity-60">
                    {vendor.invoice_count} {vendor.invoice_count === 1 ? "invoice" : "invoices"}
                    {vendor.needs_review > 0 && `, ${vendor.needs_review} to check`}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <DemoNotice />
    </Page>
  );
}
