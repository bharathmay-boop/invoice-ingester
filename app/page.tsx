import Link from "next/link";
import { listItems, listVendors } from "@/lib/queries.ts";
import { moneyRounded } from "@/lib/format.ts";
import { DemoNotice, Page, Stat } from "./ui.tsx";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [vendors, items] = await Promise.all([listVendors(), listItems()]);

  const spend = vendors.reduce((sum, v) => sum + v.spend, 0);
  const toCheck = vendors.reduce((sum, v) => sum + v.needs_review, 0);
  const topItem = items[0];

  return (
    <Page
      title="Invoice Ingester"
      lead="Drop in invoices, extract the particulars, match vendors and items, then search spend by vendor or by item."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Total spend"
          value={moneyRounded(spend)}
          note={`Across ${vendors.length} vendors`}
        />
        <Stat
          label="Catalogue"
          value={String(items.length)}
          note="Distinct things bought"
        />
        <Stat
          label="To check"
          value={String(toCheck)}
          note={toCheck ? "Invoices whose figures disagree" : "Everything adds up"}
        />
      </div>

      {topItem && (
        <p className="mt-8 text-sm opacity-80">
          Most spent on{" "}
          <Link href={`/items/${topItem.id}`} className="underline">
            {topItem.canonical_name}
          </Link>{" "}
          at {moneyRounded(topItem.spend)}. Start from{" "}
          <Link href="/items" className="underline">
            items
          </Link>{" "}
          to see what a thing has cost over time, or{" "}
          <Link href="/vendors" className="underline">
            vendors
          </Link>{" "}
          for who you pay most.
        </p>
      )}

      <DemoNotice />
    </Page>
  );
}
