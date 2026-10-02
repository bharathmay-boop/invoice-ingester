import Link from "next/link";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { listContracts } from "@/lib/queries.ts";
import { formatDate } from "@/lib/format.ts";
import { DemoNotice, Empty, Page } from "../ui.tsx";
import { ContractDropzone } from "./contract-dropzone.tsx";

export const dynamic = "force-dynamic";

export const metadata = { title: "Contracts" };

/** What each status means, in the words the screen uses rather than the column's. */
const STATE: Record<string, { label: string; tone: "good" | "warning" | "neutral" }> = {
  queued: { label: "Waiting to be read", tone: "neutral" },
  reading: { label: "Being read", tone: "neutral" },
  ready_for_review: { label: "Ready for review", tone: "warning" },
  reviewed: { label: "Reviewed", tone: "good" },
  could_not_read: { label: "Could not be read", tone: "warning" },
};

export default async function Contracts() {
  const jar = await cookies();
  const signedIn = await isValidSession(jar.get(sessionCookie.name)?.value);
  const contracts = await listContracts();

  return (
    <Page
      title="Contracts"
      lead="What you agreed to pay, so an invoice can be checked against it."
    >
      {signedIn && (
        <div className="mb-8">
          <ContractDropzone />
        </div>
      )}

      {contracts.length === 0 ? (
        <Empty
          title="No contracts yet"
          action={signedIn ? undefined : { href: "/login", label: "Sign in" }}
        >
          A contract records the rates you agreed with a supplier. Once one is
          read and reviewed, every invoice from that supplier is checked against
          it, and anything billed above the agreed rate is held.
        </Empty>
      ) : (
        <ul className="divide-y divide-black/10 dark:divide-white/15">
          {contracts.map((contract) => {
            const state = STATE[contract.status] ?? { label: contract.status, tone: "neutral" };
            const tone = {
              good: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200",
              warning: "bg-amber-500/20 text-amber-900 dark:text-amber-200",
              neutral: "bg-black/10 dark:bg-white/15",
            }[state.tone];

            const row = (
              <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-4">
                <span className="flex flex-col">
                  <span className="font-medium">{contract.title}</span>
                  <span className="text-xs opacity-60">
                    {contract.vendor_name ?? "Vendor not confirmed yet"}
                    {contract.rate_count > 0 &&
                      `, ${contract.rate_count} ${contract.rate_count === 1 ? "rate" : "rates"}`}
                    {`, added ${formatDate(contract.created_at)}`}
                  </span>
                  {contract.failure && (
                    <span className="mt-1 max-w-prose text-xs opacity-70">{contract.failure}</span>
                  )}
                </span>
                <span
                  className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
                >
                  {state.label}
                </span>
              </span>
            );

            // Only a contract that has something to review is worth opening.
            // A link to a page that says "still reading" teaches nothing.
            return (
              <li key={contract.id}>
                {contract.status === "ready_for_review" || contract.status === "reviewed" ? (
                  <Link href={`/contracts/${contract.id}`} className="block hover:opacity-80">
                    {row}
                  </Link>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ul>
      )}

      <DemoNotice />
    </Page>
  );
}
