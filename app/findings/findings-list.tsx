"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { money } from "@/lib/format.ts";
import { TAGS } from "@/lib/contracts/tags.tsx";
import type { Tag } from "@/lib/contracts/variance.ts";
import type { FindingRow } from "@/lib/queries.ts";

type Totals = { currency: "INR" | "USD" | "EUR"; variance_tag: string; total: number; lines: number }[];

/**
 * Findings, worst first, with the money in front.
 *
 * Sorted by what it costs rather than by how many there are. "Seventeen lines
 * billed above contract" is not something anybody can act on; a figure and the
 * supplier it came from is a phone call. Count ordering also sorts badly: a
 * hundred lines two rupees out beats one line forty thousand out.
 *
 * Hidden on a narrow screen once a finding is open, which is why this is a
 * client component: it is the only thing on the page that needs to know
 * whether a child route is showing.
 */
export function FindingsList({ findings, totals }: { findings: FindingRow[]; totals: Totals }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const open = pathname !== "/findings";
  const filter = params.get("tag");

  const valued = findings.filter((f) => TAGS[f.variance_tag as Tag]?.valued);
  const unvalued = findings.filter((f) => !TAGS[f.variance_tag as Tag]?.valued);
  const shown = filter ? findings.filter((f) => f.variance_tag === filter) : null;

  return (
    <div className={`w-full shrink-0 lg:w-[26rem] ${open ? "hidden lg:block" : ""}`}>
      {totals.length > 0 && (
        <ul className="mb-5 flex flex-col gap-2">
          {totals
            .filter((t) => TAGS[t.variance_tag as Tag]?.valued && t.total !== 0)
            .map((t) => (
              <li
                key={`${t.currency}-${t.variance_tag}`}
                className="border-border flex items-baseline justify-between rounded-lg border px-4 py-3"
              >
                <span className="text-xs uppercase tracking-wide opacity-60">
                  {TAGS[t.variance_tag as Tag]?.label ?? t.variance_tag}
                </span>
                <span className="text-lg font-semibold tabular-nums">
                  {money(Math.abs(t.total), t.currency)}
                </span>
              </li>
            ))}
        </ul>
      )}

      <div className="mb-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2">
          <Chip href="/findings" active={!filter} label="All" />
          {[...new Set(findings.map((f) => f.variance_tag))].map((tag) => (
            <Chip
              key={tag}
              href={`/findings?tag=${tag}`}
              active={filter === tag}
              label={TAGS[tag as Tag]?.label ?? tag}
            />
          ))}
        </div>
      </div>

      {findings.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-6 py-10 text-center text-sm">
          Nothing disagrees with a contract. Either every invoice matches what
          was agreed, or there is no reviewed contract to check them against
          yet.
        </p>
      ) : (
        <>
          <Rows findings={shown ?? valued} />
          {!shown && unvalued.length > 0 && (
            <>
              <h2 className="mt-6 text-sm font-medium">Cannot be valued</h2>
              <p className="text-muted-foreground mt-1 text-xs">
                There is no agreed rate to compare these against, or no way to
                convert between the units.
              </p>
              <Rows findings={unvalued} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function Rows({ findings }: { findings: FindingRow[] }) {
  const pathname = usePathname();
  return (
    <ul className="divide-y divide-black/10 dark:divide-white/15">
      {findings.map((finding) => {
        const tag = TAGS[finding.variance_tag as Tag];
        const here = pathname === `/findings/${finding.line_id}`;
        return (
          <li key={finding.line_id}>
            <Link
              href={`/findings/${finding.line_id}`}
              className={`flex items-baseline justify-between gap-3 rounded-md px-2 py-3 hover:opacity-80 ${
                here ? "bg-black/5 dark:bg-white/10" : ""
              }`}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">
                  {finding.item_name ?? finding.raw_description}
                </span>
                <span className="truncate text-xs opacity-60">
                  {finding.vendor_name} · {tag?.label ?? finding.variance_tag}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {tag?.valued && finding.variance_impact !== null
                  ? money(Math.abs(finding.variance_impact), finding.currency)
                  : "no figure"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium ${
        active ? "bg-foreground text-background" : "border-border border"
      }`}
    >
      {label}
    </Link>
  );
}
