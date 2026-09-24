import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { InvoiceOriginal } from "../../invoice-original.tsx";
import { getItem } from "@/lib/queries.ts";
import { changeSince, formatDate, money, moneyRounded } from "@/lib/format.ts";
import { cheapestVendorNow, unitsAreComparable } from "@/lib/price.ts";
import { DemoNotice, Empty, Page, Stat, StatusBadge } from "../../ui.tsx";
import { PriceChart } from "./chart.tsx";

export const dynamic = "force-dynamic";

export default async function ItemDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const item = await getItem(id);
  if (!item) notFound();

  // Originals need a session, so the column only exists with one.
  const jar = await cookies();
  const signedIn = await isValidSession(jar.get(sessionCookie.name)?.value);

  const confirmed = item.purchases.filter((p) => p.status === "confirmed");
  const oldestFirst = [...confirmed].reverse();

  const spend = confirmed.reduce((sum, p) => sum + p.amount, 0);
  const latest = confirmed[0];
  const earliest = oldestFirst[0];

  // #36: prices measured in different units are not comparable, and a confident
  // wrong comparison is worse than no comparison. Until conversions exist, say
  // so rather than drawing a line through incomparable numbers.
  const units = new Set(confirmed.map((p) => p.unit ?? "each"));
  const comparable = unitsAreComparable(confirmed);

  const cheapest = comparable ? cheapestVendorNow(confirmed) : null;

  const movement =
    comparable && latest && earliest && latest !== earliest
      ? changeSince(latest.unit_price, earliest.unit_price)
      : null;

  return (
    <Page title={item.canonical_name}>
      {confirmed.length === 0 ? (
        <Empty title="Nothing confirmed for this item yet">
          It appears on an invoice whose figures still need checking, so it is
          left out of the totals until that is resolved.
        </Empty>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Total paid"
              value={moneyRounded(spend)}
              note={`${confirmed.length} ${confirmed.length === 1 ? "purchase" : "purchases"}, ${new Set(confirmed.map((p) => p.vendor_id)).size} vendors`}
            />
            <Stat
              label="Unit price now"
              value={comparable ? money(latest.unit_price) : "Mixed units"}
              note={
                comparable
                  ? (movement ?? "Only one purchase so far")
                  : `Bought by ${[...units].join(" and ")}`
              }
            />
            <Stat
              label="Cheapest vendor now"
              value={cheapest ? money(cheapest.unit_price) : "Not comparable"}
              note={
                cheapest
                  ? `${cheapest.vendor_name}, as at ${formatDate(cheapest.invoice_date)}`
                  : "Units differ between invoices"
              }
            />
          </div>

          {!comparable && (
            <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
              This item has been bought by {[...units].join(" and ")}. Those
              prices are not comparable until a conversion is recorded, so no
              trend is shown rather than a misleading one.
            </p>
          )}

          {comparable && confirmed.length === 1 && (
            <p className="text-muted-foreground mt-6 text-sm">
              One purchase so far, at {money(latest.unit_price)}
              {latest.unit ? ` per ${latest.unit}` : ""} from {latest.vendor_name} on{" "}
              {formatDate(latest.invoice_date)}. A trend needs a second one: a
              line through a single point is a decoration, not a price history.
            </p>
          )}

          {comparable && confirmed.length > 1 && (
            <>
              <h2 className="mt-10 text-lg font-semibold">Unit price over time</h2>
              <PriceChart
                points={oldestFirst.map((p) => ({
                  date: p.invoice_date,
                  price: p.unit_price,
                  vendor: p.vendor_name,
                }))}
              />
            </>
          )}
        </>
      )}

      <h2 className="mt-10 text-lg font-semibold">Every purchase</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <caption className="sr-only">
            Every recorded purchase of {item.canonical_name}
          </caption>
          <thead>
            <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide opacity-60 dark:border-white/15">
              <th scope="col" className="py-2 pr-4 font-medium">Date</th>
              <th scope="col" className="py-2 pr-4 font-medium">Vendor</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Qty</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Unit price</th>
              <th scope="col" className="py-2 text-right font-medium">Amount</th>
              {signedIn && (
                <th scope="col" className="py-2 pl-2">
                  <span className="sr-only">Original</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/15">
            {item.purchases.map((p) => (
              <tr key={`${p.invoice_id}-${p.raw_description}`}>
                <td className="py-2 pr-4 whitespace-nowrap">
                  {formatDate(p.invoice_date)}
                  {p.status !== "confirmed" && (
                    <span className="ml-2">
                      <StatusBadge status={p.status} />
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  <Link href={`/vendors/${p.vendor_id}`} className="underline">
                    {p.vendor_name}
                  </Link>
                  <span className="block text-xs opacity-60">{p.raw_description}</span>
                </td>
                <td className="py-2 pr-4 text-right tabular-nums whitespace-nowrap">
                  {p.quantity} {p.unit ?? ""}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">{money(p.unit_price)}</td>
                <td className="py-2 text-right tabular-nums">{money(p.amount)}</td>
                {signedIn && (
                  <td className="py-2 pl-2 text-right">
                    <InvoiceOriginal
                      invoiceNumber={p.invoice_number}
                      date={formatDate(p.invoice_date)}
                      blobUrl={p.blob_url}
                      contentType={p.content_type}
                      firstPage={p.first_page}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-8 text-sm">
        <Link href="/items" className="underline">
          All items
        </Link>
      </p>
      <DemoNotice />
    </Page>
  );
}
