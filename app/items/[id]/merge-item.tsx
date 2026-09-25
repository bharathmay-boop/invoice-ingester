"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { mergeIntoAction, type MergeOutcome } from "./merge-actions.ts";

type Candidate = { id: string; name: string; purchases: number };

/**
 * Fold this item into another one.
 *
 * The undo for a wrong automatic link, which is what makes automatic linking
 * safe to offer at all. It is also the one destructive action in the app:
 * afterwards nothing records which purchase came from which entry, so the
 * confirmation says what will move and where, in those words.
 */
export function MergeItem({
  itemId,
  itemName,
  purchases,
  candidates,
}: {
  itemId: string;
  itemName: string;
  purchases: number;
  candidates: Candidate[];
}) {
  const [choice, setChoice] = useState("");
  const [asking, setAsking] = useState(false);
  const [result, merge, merging] = useActionState<MergeOutcome, FormData>(mergeIntoAction, null);

  if (candidates.length === 0) return null;
  const target = candidates.find((c) => c.id === choice);

  return (
    <div className="border-border mt-10 rounded-lg border p-4">
      <h2 className="text-sm font-medium">Same thing as another item?</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Move every purchase of {itemName} onto another catalogue entry, and keep
        that one. Use this when a match was wrong, or when the same product was
        typed two ways.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="merge-target">Keep this item instead</Label>
          <select
            id="merge-target"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className="border-input bg-background w-full max-w-sm rounded-md border px-3 py-2 text-sm"
          >
            <option value="">Choose an item…</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name} ({candidate.purchases})
              </option>
            ))}
          </select>
        </div>

        <Button type="button" variant="outline" disabled={!target} onClick={() => setAsking(true)}>
          Merge
        </Button>
      </div>

      {result && !result.ok && (
        <p role="alert" className="text-destructive mt-2 text-sm">
          {result.message}
        </p>
      )}

      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge these two items?</DialogTitle>
            <DialogDescription>
              {purchases === 1 ? "One purchase" : `All ${purchases} purchases`} of{" "}
              {itemName} will move onto {target?.name}, and {itemName} will be
              removed. The two price histories become one, and this cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <form action={merge}>
              <input type="hidden" name="mergeId" value={itemId} />
              <input type="hidden" name="keepId" value={choice} />
              <Button type="submit" disabled={merging}>
                {merging ? "Merging…" : `Keep ${target?.name}`}
              </Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
