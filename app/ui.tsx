import Link from "next/link";
import { STATUS, type InvoiceStatus } from "@/lib/format.ts";
import { Button } from "@/components/ui/button";

export function Page({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
      {lead && <p className="mt-2 max-w-prose text-sm opacity-70">{lead}</p>}
      <div className="mt-8">{children}</div>
    </main>
  );
}

/** A headline number. Three of these are the whole point of the item screen. */
export function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <div className="text-xs uppercase tracking-wide opacity-60">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {note && <div className="mt-1 text-xs opacity-70">{note}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const known = STATUS[status as InvoiceStatus];
  if (!known) return <span className="text-xs opacity-70">{status}</span>;

  const tone = {
    good: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200",
    warning: "bg-amber-500/20 text-amber-900 dark:text-amber-200",
    neutral: "bg-black/10 dark:bg-white/15",
  }[known.tone];

  return (
    <span
      title={known.meaning}
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {known.label}
    </span>
  );
}

/**
 * An empty state says what goes here and how to fill it. A bare "no results"
 * tells you nothing you did not already know.
 */
/**
 * What a screen says before it has anything to show.
 *
 * `action` is the point of it: an empty screen that only says "nothing here"
 * leaves someone to work out what would fill it. The demo data hides every one
 * of these, so they are first seen by whoever runs this on their own invoices,
 * which is the worst moment to find a dead end.
 */
export function Empty({
  title,
  action,
  children,
}: {
  title: string;
  action?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-black/20 px-6 py-12 text-center dark:border-white/20">
      <p className="font-medium">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-sm text-sm opacity-70">{children}</p>}
      {action && (
        <p className="mt-4">
          <Button asChild size="sm">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        </p>
      )}
    </div>
  );
}

export function DemoNotice() {
  return (
    <p className="mt-8 text-xs opacity-60">
      These are made up invoices, loaded so the screens have something to show.
      Nothing here came from a model.{" "}
      <Link href="https://github.com/bharathmay-boop/invoice-ingester" className="underline">
        Source
      </Link>
      .
    </p>
  );
}
