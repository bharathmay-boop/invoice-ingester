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
 * versus a match, ending at the ERP. Each row reveals once on load, in
 * order, rather than looping, so a repeat visitor isn't shown a flicker.
 */
// Delays step by 0.13s per row, in the order rows appear, so the pipeline
// reveals top to bottom instead of all at once.
export function FlowHero() {
  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-sm sm:p-5">
      <Group label="01 · Sources" delay={0}>
        <Row icon={FileText} title="Invoice" subtitle="1 file" delay={0.13} />
        <Row icon={Copy} title="Contract" subtitle="Coming soon" ghost delay={0.26} />
      </Group>

      <Connector delay={0.39} />

      <Group label="02 · Extract" delay={0.52}>
        <Row
          icon={Sparkles}
          title="AI Extraction"
          subtitle="14 fields"
          badge="reading → done"
          highlight
          delay={0.65}
        />
        <Row icon={Table2} title="Invoice fields" subtitle="₹18,400 · Q3" delay={0.78} />
        <Row icon={Copy} title="Contract terms" subtitle="Coming soon" ghost delay={0.91} />
      </Group>

      <Connector delay={1.04} />

      <Group label="03 · Verify" delay={1.17}>
        <Row
          icon={Search}
          title="Cross-check"
          subtitle="3 of 3 matched"
          badge="comparing → matched"
          highlight
          delay={1.3}
        />
        <Row icon={GitBranch} title="Condition" subtitle="value · period · item" delay={1.43} />
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
      </Group>

      <Connector delay={1.82} />

      <Group label="04 · Output" delay={1.95}>
        <Row icon={RefreshCw} title="ERP sync" subtitle="QuickBooks" badge="synced" delay={2.08} />
      </Group>
    </div>
  );
}

function Group({
  label,
  delay,
  children,
}: {
  label: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p
        className="animate-reveal text-muted-foreground motion-reduce:animate-none mb-2 font-mono text-[10px] uppercase tracking-[0.15em]"
        style={{ animationDelay: `${delay}s` }}
      >
        {label}
      </p>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function Connector({ delay }: { delay: number }) {
  return (
    <div
      className="animate-reveal motion-reduce:animate-none flex justify-center"
      style={{ animationDelay: `${delay}s` }}
    >
      <span className="bg-primary/60 size-1.5 animate-pulse rounded-full" />
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
  subtitle: string;
  badge?: string;
  ghost?: boolean;
  highlight?: boolean;
  tone?: "amber" | "emerald";
  delay: number;
}) {
  return (
    <div
      className={cn(
        "animate-reveal motion-reduce:animate-none col-span-2 flex items-center gap-2.5 rounded-lg border px-2.5 py-2 sm:col-span-1",
        ghost && "border-dashed opacity-60",
        highlight && "border-primary/40 bg-primary/5",
        !ghost && !highlight && "border-border",
        tone === "amber" && "border-amber-500/40 bg-amber-500/10",
        tone === "emerald" && "border-emerald-500/40 bg-emerald-500/10",
        badge && "col-span-2 sm:col-span-2",
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
