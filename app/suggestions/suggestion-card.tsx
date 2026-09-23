"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { decideSuggestion, type Decision } from "./actions.ts";

type Props = {
  lineItemId: string;
  rawDescription: string;
  canonicalName: string;
  score: number;
  itemHref: string;
  purchases: number;
  context: string;
  line: string;
};

/**
 * One question: is this line the same product as this catalogue item?
 *
 * The two names sit side by side because that is what the decision is actually
 * made on. The score is shown, but as a note rather than the headline: it is
 * why this is being asked, not the answer.
 */
export function SuggestionCard({
  lineItemId,
  rawDescription,
  canonicalName,
  score,
  itemHref,
  purchases,
  context,
  line,
}: Props) {
  const [result, decide, deciding] = useActionState<Decision | null, FormData>(
    decideSuggestion,
    null,
  );

  // Decided rows disappear on the next render, but the action returns first, so
  // the card says what happened rather than sitting there looking untouched.
  if (result?.ok) {
    return (
      <div className="border-border text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-sm">
        {rawDescription}: {result.message}
      </div>
    );
  }

  return (
    <div className="border-border rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div>
          <p className="text-muted-foreground text-xs">On this invoice</p>
          <p className="font-medium">{rawDescription}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {context} · {line}
          </p>
        </div>

        <ArrowRightIcon className="text-muted-foreground hidden size-4 sm:block" aria-hidden />

        <div>
          <p className="text-muted-foreground text-xs">Already in the catalogue</p>
          <p className="font-medium">
            <Link href={itemHref} className="underline underline-offset-4">
              {canonicalName}
            </Link>
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {purchases === 1 ? "1 purchase" : `${purchases} purchases`} recorded
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <form action={decide} className="flex flex-wrap gap-2">
          <input type="hidden" name="lineItemId" value={lineItemId} />
          <Button type="submit" name="verdict" value="accepted" size="sm" disabled={deciding}>
            Same thing
          </Button>
          <Button
            type="submit"
            name="verdict"
            value="rejected"
            size="sm"
            variant="outline"
            disabled={deciding}
          >
            Different thing
          </Button>
        </form>

        <Badge variant="secondary">{Math.round(score * 100)}% alike</Badge>
        {result && !result.ok && (
          <span role="alert" className="text-destructive text-xs">
            {result.message}
          </span>
        )}
      </div>
    </div>
  );
}
