import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { findingTotals, listFindings } from "@/lib/queries.ts";
import { FindingsList } from "./findings-list.tsx";

export const dynamic = "force-dynamic";

export const metadata = { title: "Findings" };

/**
 * The list lives in the layout, so moving between findings never refetches it
 * and the browser's back button behaves. On a narrow screen the list hides
 * itself once a finding is open, which is the same two routes rather than a
 * second layout to keep in step.
 */
export default async function FindingsLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  if (!(await isValidSession(jar.get(sessionCookie.name)?.value))) notFound();

  const [findings, totals] = await Promise.all([listFindings(), findingTotals()]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-semibold sm:text-3xl">Findings</h1>
      <p className="mt-2 max-w-prose text-sm opacity-70">
        What you were billed that disagrees with a contract you have.
      </p>

      <div className="mt-8 flex flex-col gap-8 lg:flex-row">
        <FindingsList findings={findings} totals={totals} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </main>
  );
}
