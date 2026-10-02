import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { getContract } from "@/lib/queries.ts";
import { formatDate, money } from "@/lib/format.ts";
import { Empty, Page } from "../../ui.tsx";

export const dynamic = "force-dynamic";

/** What a term that is recorded but never checked is called on screen. */
const TERM: Record<string, string> = {
  slab: "Volume slab",
  rebate: "Rebate",
  revenue_share: "Revenue share",
  minimum_guarantee: "Minimum guarantee",
  escalation: "Escalation",
  other: "Other term",
};

export default async function Contract({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jar = await cookies();
  if (!(await isValidSession(jar.get(sessionCookie.name)?.value))) notFound();

  const contract = await getContract(id);
  if (!contract) notFound();

  return (
    <Page
      title={contract.title}
      lead={`${contract.vendor_name ?? "Vendor not confirmed yet"}, added ${formatDate(contract.created_at)}`}
    >
      <section>
        <h2 className="text-sm font-medium">Agreed rates</h2>
        {contract.rates.length === 0 ? (
          <p className="text-muted-foreground mt-2 max-w-prose text-sm">
            No rate card was found in this contract. That is an ordinary
            document rather than a failure: a services agreement can set out
            what is owed without listing a price per item.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-black/10 dark:divide-white/15">
            {contract.rates.map((rate) => (
              <li key={rate.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-medium">{rate.printed_name}</span>
                  <span className="tabular-nums">
                    {money(rate.rate, rate.currency)}
                    {rate.unit && <span className="opacity-60"> per {rate.unit}</span>}
                  </span>
                </div>
                <div className="text-muted-foreground mt-1 text-xs">
                  {formatDate(rate.effective_from)}
                  {rate.effective_to ? ` to ${formatDate(rate.effective_to)}` : " onwards"}
                  {rate.item_name
                    ? `, matched to ${rate.item_name}`
                    : ", not yet matched to an item"}
                  {rate.source_page && `, page ${rate.source_page}`}
                </div>
                {rate.source_quote && (
                  <blockquote className="text-muted-foreground mt-1 border-l-2 border-black/20 pl-3 text-xs dark:border-white/20">
                    {rate.source_quote}
                  </blockquote>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {contract.other_terms.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-medium">Recorded, not checked</h2>
          <p className="text-muted-foreground mt-1 max-w-prose text-sm">
            These were found in the contract and are not compared against
            anything. A volume slab needs a running total across invoices, a
            rebate is worked out at the end of a period, and a revenue share
            depends on a figure no invoice carries. Checking them against one
            invoice would mean guessing.
          </p>
          <ul className="mt-3 divide-y divide-black/10 dark:divide-white/15">
            {contract.other_terms.map((term, i) => (
              <li key={`${term.label}-${i}`} className="py-3">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-medium">{term.label}</span>
                  <span className="text-muted-foreground text-xs">
                    {TERM[term.kind] ?? term.kind}
                    {term.page && `, page ${term.page}`}
                  </span>
                </div>
                <p className="mt-1 max-w-prose text-sm">{term.summary}</p>
                {term.quote && (
                  <blockquote className="text-muted-foreground mt-1 border-l-2 border-black/20 pl-3 text-xs dark:border-white/20">
                    {term.quote}
                  </blockquote>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {contract.rates.length === 0 && contract.other_terms.length === 0 && (
        <Empty title="Nothing was read out of this one">
          The document was read and no rates or commercial terms came back. It
          may be an annexure, a signature page, or a scan too faint to read.
        </Empty>
      )}
    </Page>
  );
}
