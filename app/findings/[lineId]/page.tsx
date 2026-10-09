import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { getFinding } from "@/lib/queries.ts";
import { formatDate, money, unitMoney } from "@/lib/format.ts";
import { TAGS, TONE } from "@/lib/contracts/tags.ts";
import type { Tag } from "@/lib/contracts/variance.ts";

export const dynamic = "force-dynamic";

/**
 * One finding, with its source.
 *
 * The reason this screen exists rather than a list alone: a number on its own
 * is a claim, and a number with the line of the contract it came from is an
 * argument. This is the page somebody sends to a supplier, which is also why
 * it has its own URL.
 */
export default async function Finding({ params }: { params: Promise<{ lineId: string }> }) {
  const { lineId } = await params;
  const finding = await getFinding(lineId);
  if (!finding) notFound();

  const tag = TAGS[finding.variance_tag as Tag];
  const over = finding.variance_contracted !== null
    ? finding.unit_price - finding.variance_contracted
    : null;

  return (
    <article>
      <Link
        href="/findings"
        className="mb-4 inline-flex items-center gap-1.5 text-sm lg:hidden"
      >
        <ArrowLeftIcon className="size-4" aria-hidden />
        All findings
      </Link>

      <span
        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[tag?.tone ?? "soft"]}`}
      >
        {tag?.label ?? finding.variance_tag}
      </span>

      <h2 className="mt-3 text-xl font-semibold">
        {finding.item_name ?? finding.raw_description}
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">
        {finding.vendor_name} · {finding.invoice_number} · {formatDate(finding.invoice_date)}
      </p>

      {finding.variance_reason && (
        <p className="mt-4 max-w-prose text-sm">{finding.variance_reason}</p>
      )}

      {finding.variance_contracted !== null && (
        <dl className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <Row label="Billed" value={`${unitMoney(finding.unit_price, finding.currency)}${finding.unit ? ` per ${finding.unit}` : ""}`} />
          <Row label="Contracted" value={`${unitMoney(finding.variance_contracted, finding.currency)}${finding.unit ? ` per ${finding.unit}` : ""}`} />
          {over !== null && (
            <Row
              label="Difference"
              value={`${unitMoney(Math.abs(over), finding.currency)}, ${
                over > 0 ? "over" : "under"
              }`}
            />
          )}
          <Row label="Quantity" value={`${finding.quantity}${finding.unit ? ` ${finding.unit}` : ""}`} />
        </dl>
      )}

      {finding.variance_impact !== null && finding.variance_impact !== 0 && (
        <div className="mt-6 flex items-baseline justify-between rounded-lg bg-black/5 px-4 py-3.5 dark:bg-white/10">
          <span className="text-xs uppercase tracking-wide opacity-60">
            {finding.variance_impact > 0 ? "Overbilled on this line" : "Underbilled on this line"}
          </span>
          <span className="text-2xl font-semibold tabular-nums">
            {money(Math.abs(finding.variance_impact), finding.currency)}
          </span>
        </div>
      )}

      {finding.contract_title && (
        <section className="mt-6">
          <h3 className="text-xs uppercase tracking-wide opacity-60">The rate came from</h3>
          <p className="mt-1.5 text-sm font-medium">
            {finding.contract_id ? (
              <Link href={`/contracts/${finding.contract_id}`} className="underline underline-offset-4">
                {finding.contract_title}
                {finding.source_page && `, page ${finding.source_page}`}
              </Link>
            ) : (
              finding.contract_title
            )}
          </p>
          {finding.source_quote && (
            <blockquote className="text-muted-foreground mt-2 max-w-prose border-l-2 border-black/20 pl-3 text-sm dark:border-white/20">
              {finding.source_quote}
            </blockquote>
          )}
        </section>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href={`/vendors/${finding.vendor_id}`}
          className="border-border rounded-md border px-4 py-2 text-sm font-medium"
        >
          Everything from this supplier
        </Link>
      </div>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border/60 flex items-baseline justify-between gap-4 border-b pb-2 text-sm">
      <dt className="opacity-60">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
