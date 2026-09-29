import {
  FileText,
  Copy,
  Sparkles,
  Table2,
  Search,
  GitBranch,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The hero. Replaces the static invoice specimen with the pipeline itself:
 * source through extraction, cross-check, and the branch a mismatch takes
 * versus a match, ending at the ERP. One continuous flow, not sectioned
 * boxes — a connector dot between each stage instead of a group boundary.
 * Each row reveals once on load, in order, rather than looping, so a
 * repeat visitor isn't shown a flicker.
 */
export function FlowHero() {
  return (
    <div className="border-border bg-card flex flex-col gap-2 rounded-xl border p-4 shadow-sm sm:p-5">
      <Pair>
        <Row icon={FileText} title="Invoice" subtitle="1 file" delay={0} />
        <Row icon={Copy} title="Contract" subtitle="Coming soon" ghost delay={0.13} />
      </Pair>

      <Connector delay={0.26} branch="converge" />

      <Row
        icon={Sparkles}
        title="AI Extraction"
        subtitle="14 fields"
        badge="reading → done"
        highlight
        delay={0.39}
      />

      <Connector delay={0.52} branch="diverge" />

      <Pair>
        <Row icon={Table2} title="Invoice fields" subtitle="₹18,400 · Q3" delay={0.65} />
        <Row icon={Copy} title="Contract terms" subtitle="Coming soon" ghost delay={0.78} />
      </Pair>

      <Connector delay={0.91} branch="converge" />

      <Row
        icon={Search}
        title="Cross-check"
        subtitle="3 of 3 matched"
        badge="comparing → matched"
        highlight
        delay={1.04}
      />

      <Connector delay={1.17} />

      <Row icon={GitBranch} title="Condition" subtitle="value · period · item" delay={1.3} />

      <Connector delay={1.43} branch="diverge" />

      <Pair>
        <Row
          icon={AlertTriangle}
          title="Human intervention"
          subtitle="Mismatch · needs review"
          tone="amber"
          delay={1.56}
        />
        <Row
          icon={CheckCircle2}
          title="Auto-clear"
          subtitle="Condition met"
          tone="emerald"
          delay={1.69}
        />
      </Pair>

      <Connector delay={1.82} branch="converge" />

      <Row
        icon={RefreshCw}
        title="Your ledger"
        subtitle={<LedgerNames />}
        badge="coming soon"
        ghost
        delay={1.95}
      />
    </div>
  );
}

function Pair({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

/** The ledgers people actually keep, named in turn rather than picking one. */
const LEDGERS = ["Tally", "Zoho Books", "QuickBooks", "Xero"];

/**
 * The names take turns on one CSS loop, stacked in a grid cell so the row
 * never changes height, each offset a quarter of the loop further in. No
 * state and no timer, so the hero stays a server component.
 *
 * Whoever asks for less motion gets the first name and nothing moving, which
 * is why the animation is behind `motion-safe` and the rest are hidden rather
 * than merely transparent.
 */
function LedgerNames() {
  return (
    <span className="grid grid-cols-1 grid-rows-1">
      {LEDGERS.map((name, i) => (
        <span
          key={name}
          aria-hidden={i > 0 || undefined}
          className={cn(
            "col-start-1 row-start-1 block truncate",
            "motion-safe:animate-[name-cycle_8s_ease-in-out_infinite] motion-safe:opacity-0",
            i > 0 && "motion-reduce:hidden",
          )}
          style={{ animationDelay: `${-i * 2}s` }}
        >
          {name}
        </span>
      ))}
    </span>
  );
}

/**
 * A dashed wire with a dot travelling along it on a loop, rather than the
 * static pulsing dot this replaced. `branch` draws two wires meeting in the
 * middle for the places two rows become one (or one becomes two), so the
 * shape of the pipeline reads even at this size. Sized to match its own
 * fixed viewBox (40x22) so `preserveAspectRatio`'s default scaling never
 * distorts the dash pattern.
 */
function Connector({
  delay,
  branch = "straight",
}: {
  delay: number;
  branch?: "straight" | "converge" | "diverge";
}) {
  const paths =
    branch === "converge"
      ? ["M10 0 V10 H20 V22", "M30 0 V10 H20 V22"]
      : branch === "diverge"
        ? ["M20 0 V10 H10 V22", "M20 0 V10 H30 V22"]
        : ["M20 0 V22"];

  return (
    <div
      className="animate-reveal motion-reduce:animate-none flex justify-center"
      style={{ animationDelay: `${delay}s` }}
    >
      <svg viewBox="0 0 40 22" width={40} height={22} aria-hidden>
        {paths.map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="1.5"
            strokeDasharray="1.5 3.5"
            strokeLinecap="round"
          />
        ))}
        {paths.map((d) => (
          <circle key={`dot-${d}`} r="2" className="fill-primary motion-reduce:hidden">
            <animateMotion dur="1.1s" begin={`${delay + 0.4}s`} repeatCount="indefinite" path={d} />
          </circle>
        ))}
      </svg>
    </div>
  );
}

function Row({
  icon: Icon,
  title,
  subtitle,
  badge,
  ghost = false,
  highlight = false,
  tone,
  delay,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: React.ReactNode;
  badge?: string;
  ghost?: boolean;
  highlight?: boolean;
  tone?: "amber" | "emerald";
  delay: number;
}) {
  return (
    <div
      className={cn(
        "animate-reveal motion-reduce:animate-none flex items-center gap-2.5 rounded-lg border px-2.5 py-2",
        ghost && "border-dashed opacity-60",
        highlight && "border-primary/40 bg-primary/5",
        !ghost && !highlight && "border-border",
        tone === "amber" && "border-amber-500/40 bg-amber-500/10",
        tone === "emerald" && "border-emerald-500/40 bg-emerald-500/10",
      )}
      style={{ animationDelay: `${delay}s` }}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md",
          ghost ? "bg-transparent" : "bg-muted",
          highlight && "bg-primary/10",
          tone === "amber" && "bg-transparent",
          tone === "emerald" && "bg-transparent",
        )}
      >
        <Icon
          className={cn(
            "size-3.5",
            ghost && "text-muted-foreground/50",
            tone === "amber" && "text-amber-700 dark:text-amber-400",
            tone === "emerald" && "text-emerald-700 dark:text-emerald-400",
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-xs font-medium", ghost && "text-muted-foreground")}>
          {title}
        </span>
        <span className="text-muted-foreground block truncate text-[11px]">{subtitle}</span>
      </span>
      {badge && (
        <span className="text-muted-foreground shrink-0 font-mono text-[10px] whitespace-nowrap">
          {badge}
        </span>
      )}
    </div>
  );
}
