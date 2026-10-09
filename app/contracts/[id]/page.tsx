import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { getContract } from "@/lib/queries.ts";
import { formatDate, money } from "@/lib/format.ts";
import { Empty, Page } from "../../ui.tsx";
import { ContractReview } from "./review.tsx";
import { listVendorChoices, listItemChoices } from "@/lib/queries.ts";
import { pool } from "@/lib/db.ts";
import { getThresholds } from "@/lib/items/match.ts";
import { nearMisses } from "@/lib/items/near.ts";

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

  // A contract waiting on a person gets the review screen. One already
  // confirmed gets the read only view below it, because re-presenting a form
  // for something already agreed invites it to be agreed again by accident.
  if (contract.status === "ready_for_review") {
    const [vendors, items] = await Promise.all([listVendorChoices(), listItemChoices()]);
    // Offered before a new item is made: the matcher leaves a rate unmatched
    // when it scores below the link threshold, which is not the same as the
    // catalogue lacking the thing (#149).
    const { suggest } = await getThresholds();
    const near = Object.fromEntries(
      await Promise.all(
        contract.rates
          .filter((rate) => !rate.item_id)
          .map(async (rate) => [rate.id, await nearMisses(pool, rate.printed_name, suggest)] as const),
      ),
    );
    const read = (contract.extraction ?? {}) as {
      vendor_name?: string;
      vendor_address?: string | null;
      tax_id?: string | null;
      tax_id_kind?: string | null;
      effective_from?: string | null;
      effective_to?: string | null;
    };

    return (
      <Page
        title={contract.title}
        lead="Check this against the document before it starts counting. Nothing here affects an invoice until you confirm."
      >
        <ContractReview
          contractId={contract.id}
          blobUrl={contract.blob_url}
          scanned={contract.rates.length > 0 && contract.rates.every((r) => r.source_page === null)}
          vendors={vendors}
          suggested={{
            name: read.vendor_name ?? contract.title,
            address: read.vendor_address ?? null,
            taxId: read.tax_id ?? null,
            taxIdKind: read.tax_id_kind ?? null,
          }}
          period={{ from: read.effective_from ?? null, to: read.effective_to ?? null }}
          rates={contract.rates}
          items={items}
          near={near}
        />
      </Page>
    );
  }

  return (
    <Page
      title={contract.title}
      lead={`${contract.vendor_name ?? "Vendor not confirmed yet"}, added ${formatDate(contract.created_at)}`}
    >
      {contract.effective_from && (
        <section>
          <h2 className="text-sm font-medium">Period covered</h2>
          <p className="text-muted-foreground mt-2 max-w-prose text-sm">
            {formatDate(contract.effective_from)}
            {contract.effective_to ? ` to ${formatDate(contract.effective_to)}` : " onwards"}
            . Invoices dated in this period are checked against it, even for an
            item the rates below do not price.
          </p>
        </section>
      )}

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
                  {rate.effective_from ? formatDate(rate.effective_from) : "No start date"}
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
