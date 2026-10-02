import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { InvoiceOriginal } from "../../invoice-original.tsx";
import { getItem, listMergeCandidates, type PurchaseRow } from "@/lib/queries.ts";
import {
  changeSince,
  formatDate,
  money,
  moneyRounded,
  unitMoney,
  type Currency,
} from "@/lib/format.ts";
import { cheapestVendorNow, comparePrices } from "@/lib/price.ts";
import { TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DemoNotice, Empty, Page, Stat, StatusBadge } from "../../ui.tsx";
import { PriceChart } from "./chart.tsx";
import { MergeItem } from "./merge-item.tsx";
import { ItemAliases } from "./item-aliases.tsx";

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

  // Only offered to someone who can act on it, and only fetched then.
  const candidates = signedIn ? await listMergeCandidates(item.id) : [];
  const confirmed = item.purchases.filter((purchase) => purchase.status === "confirmed");
  const currencies: Currency[] = ["INR", "USD", "EUR"];

  return (
    <Page title={item.canonical_name}>
      {confirmed.length === 0 ? (
        <Empty title="Nothing confirmed for this item yet">
          It appears on an invoice whose figures still need checking, so it is
          left out of the totals until that is resolved.
        </Empty>
      ) : (
        currencies
          .map((currency) => confirmed.filter((purchase) => purchase.currency === currency))
          .filter((purchases) => purchases.length > 0)
          .map((purchases) => (
            <CurrencySummary key={purchases[0].currency} purchases={purchases} />
          ))
      )}

      {signedIn && (
        <ItemAliases
          itemId={item.id}
          canonicalName={item.canonical_name}
          aliases={item.aliases}
        />
      )}

      {signedIn && (
        <MergeItem
          itemId={item.id}
          itemName={item.canonical_name}
          purchases={item.purchases.length}
          candidates={candidates}
        />
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
            {item.purchases.map((purchase) => (
              <tr key={`${purchase.invoice_id}-${purchase.raw_description}`}>
                <td className="py-2 pr-4 whitespace-nowrap">
                  {formatDate(purchase.invoice_date)}
                  {purchase.status !== "confirmed" && (
                    <span className="ml-2">
                      <StatusBadge status={purchase.status} />
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  <Link href={`/vendors/${purchase.vendor_id}`} className="underline">
                    {purchase.vendor_name}
                  </Link>
                  <span className="block text-xs opacity-60">{purchase.raw_description}</span>
                </td>
                <td className="py-2 pr-4 text-right tabular-nums whitespace-nowrap">
                  {purchase.quantity} {purchase.unit ?? ""}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {money(purchase.unit_price, purchase.currency)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {money(purchase.amount, purchase.currency)}
                </td>
                {signedIn && (
                  <td className="py-2 pl-2 text-right">
                    <InvoiceOriginal
                      invoiceNumber={purchase.invoice_number}
                      date={formatDate(purchase.invoice_date)}
                      blobUrl={purchase.blob_url}
                      contentType={purchase.content_type}
                      firstPage={purchase.first_page}
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

function CurrencySummary({ purchases }: { purchases: PurchaseRow[] }) {
  const currency = purchases[0].currency;
  const oldestFirst = [...purchases].reverse();
  const spend = purchases.reduce((sum, purchase) => sum + purchase.amount, 0);
  const latest = purchases[0];
  const earliest = oldestFirst[0];

  // Prices are reconciled to one unit where the units convert, and refused
  // where they do not. A confident wrong comparison is worse than none.
  const comparison = comparePrices(purchases);
  const comparable = comparison.comparable;
  const basePrices = comparable ? comparison.priced.map((purchase) => purchase.basePrice) : [];
  const basePriceAt = (index: number) =>
    basePrices[index] ?? purchases[index]?.unit_price ?? 0;
  const cheapest = comparable ? cheapestVendorNow(purchases) : null;
  const movement =
    comparable && latest && earliest && latest !== earliest
      ? changeSince(basePriceAt(0), basePriceAt(purchases.length - 1))
      : null;

  return (
    <section className="mb-10 last:mb-0">
      <h2 className="mb-3 text-sm font-medium">{currency}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Total paid"
          value={moneyRounded(spend, currency)}
          note={`${purchases.length} ${purchases.length === 1 ? "purchase" : "purchases"}, ${new Set(purchases.map((purchase) => purchase.vendor_id)).size} vendors`}
        />
        <Stat
          label={comparable ? `Price ${comparison.label}` : "Unit price now"}
          value={comparable ? unitMoney(basePriceAt(0), currency) : "Mixed units"}
          note={comparable ? movement ?? "Only one purchase so far" : "Not comparable"}
        />
        <Stat
          label="Cheapest vendor now"
          value={
            cheapest
              ? unitMoney(basePriceAt(purchases.indexOf(cheapest)), currency)
              : "Not comparable"
          }
          note={
            cheapest
              ? `${cheapest.vendor_name}, as at ${formatDate(cheapest.invoice_date)}`
              : "Units differ between invoices"
          }
        />
      </div>

      {!comparable && (
        <Alert className="mt-4">
          <TriangleAlertIcon />
          <AlertTitle>These prices cannot be compared</AlertTitle>
          <AlertDescription>
            <p>{comparison.reason}</p>
            <p>
              No trend is drawn rather than a misleading one. Every purchase is
              still listed below, at the price its invoice printed.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {comparable && purchases.length === 1 && (
        <p className="text-muted-foreground mt-6 text-sm">
          One purchase so far, at {money(latest.unit_price, currency)}
          {latest.unit ? ` per ${latest.unit}` : ""} from {latest.vendor_name} on{" "}
          {formatDate(latest.invoice_date)}. A trend needs a second one: a line
          through a single point is a decoration, not a price history.
        </p>
      )}

      {comparable && purchases.length > 1 && (
        <>
          <h3 className="mt-8 text-lg font-semibold">
            Price over time, {comparison.label}
          </h3>
          <PriceChart
            points={oldestFirst.map((purchase, index) => ({
              date: purchase.invoice_date,
              price: basePriceAt(purchases.length - 1 - index),
              vendor: purchase.vendor_name,
              currency,
            }))}
          />
        </>
      )}
    </section>
  );
}
