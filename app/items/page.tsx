import Link from "next/link";
import { listItems } from "@/lib/queries.ts";
import { money } from "@/lib/format.ts";
import { DemoNotice, Empty, Page } from "../ui.tsx";

export const dynamic = "force-dynamic";

export const metadata = { title: "Items" };

export default async function Items({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const items = await listItems(q);
  const searching = Boolean(q?.trim());

  return (
    <Page
      title="Items"
      lead="Everything you have bought, by what you have spent on it."
    >
      {/* A plain GET form, so search survives a reload and is linkable. */}
      <form role="search" className="mb-6 flex gap-2">
        <label htmlFor="q" className="sr-only">
          Search items
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q ?? ""}
          placeholder="a4 paper"
          className="w-full max-w-xs rounded border border-black/20 px-3 py-2 text-sm dark:border-white/25"
        />
        <button
          type="submit"
          className="rounded bg-foreground px-3 py-2 text-sm font-medium text-background"
        >
          Search
        </button>
      </form>

      {items.length === 0 ? (
        searching ? (
          <Empty title={`Nothing matches “${q}”`} action={{ href: "/items", label: "Clear the search" }}>
            Try fewer words. Descriptions are matched loosely, so “a4 paper”
            finds “A4 Paper 500 Sheets”. There are items here, just none like
            that.
          </Empty>
        ) : (
          <Empty title="No items yet" action={{ href: "/upload", label: "Upload an invoice" }}>
            Items appear here as invoices are saved, one per distinct thing you
            have bought. Upload one and its line items become the first
            entries.
          </Empty>
        )
      ) : (
        <ul className="divide-y divide-black/10 dark:divide-white/15">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/items/${item.id}`}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-4 hover:opacity-80"
              >
                <span className="flex flex-col">
                  <span className="font-medium">{item.canonical_name}</span>
                  <span className="text-xs opacity-60">
                    {item.purchases}{" "}
                    {item.purchases === 1 ? "purchase" : "purchases"}
                    {item.latest_price !== null &&
                      `, last at ${money(item.latest_price)}`}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{money(item.spend)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <DemoNotice />
    </Page>
  );
}
