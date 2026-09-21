import { Badge } from "@/components/ui/badge";

/**
 * Marks a section that is a shell rather than a working control. A settings
 * page full of inputs that silently do nothing is worse than one that says
 * which issue fills each part in.
 */
export function Pending({ issue, what }: { issue: number; what: string }) {
  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
      <Badge variant="secondary" className="font-mono">
        <a
          href={`https://github.com/bharathmay-boop/invoice-ingester/issues/${issue}`}
          className="hover:underline"
        >
          #{issue}
        </a>
      </Badge>
      {what}
    </p>
  );
}
