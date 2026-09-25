import Link from "next/link";
import { listVendors } from "@/lib/queries.ts";
import { money } from "@/lib/format.ts";
import { DemoNotice, Empty, Page } from "../ui.tsx";

export const dynamic = "force-dynamic";

export const metadata = { title: "Vendors" };

export default async function Vendors() {
  const vendors = await listVendors();

  return (
    <Page title="Vendors" lead="Everyone you have bought from, by what you have spent.">
      {vendors.length === 0 ? (
        <Empty title="No vendors yet" action={{ href: "/upload", label: "Upload an invoice" }}>
          Vendors appear here once an invoice has been saved. Each one is
          identified by its GSTIN, so the same supplier is one vendor however
          their name was typed.
        </Empty>
      ) : (
        <ul className="divide-y divide-black/10 dark:divide-white/15">
          {vendors.map((vendor) => (
            <li key={vendor.id}>
              <Link
                href={`/vendors/${vendor.id}`}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-4 hover:opacity-80"
              >
                <span className="flex flex-col">
                  <span className="font-medium">{vendor.name}</span>
                  <span className="text-xs opacity-60">
                    {vendor.gstin ?? "No GSTIN on file"}
                  </span>
                </span>
                <span className="flex flex-col items-end">
                  <span className="font-semibold tabular-nums">{money(vendor.spend)}</span>
                  <span className="text-xs opacity-60">
                    {vendor.invoice_count}{" "}
                    {vendor.invoice_count === 1 ? "invoice" : "invoices"}
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
