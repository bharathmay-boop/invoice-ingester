"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { chooseModel, type ActionResult } from "./actions.ts";

export type ModelOption = {
  id: string;
  name: string;
  cost: string;
  recommended: string | null;
};

/** "free" already reads as a price; the others need the unit. */
function priceLabel(cost: string): string {
  return cost === "free" ? "free" : `${cost} an invoice`;
}

export function ModelPicker({
  models,
  selected,
  stale,
}: {
  models: ModelOption[];
  selected: string;
  stale: boolean;
}) {
  const [choice, setChoice] = useState(selected);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [, save, saving] = useActionState<ActionResult | null, FormData>(
    async (previous, form) => {
      const result = await chooseModel(previous, form);
      setMessage({ ok: result.ok, text: result.message });
      return result;
    },
    null,
  );

  const current = models.find((m) => m.id === choice);
  const recommended = models.filter((m) => m.recommended);
  const rest = models.filter((m) => !m.recommended);

  return (
    <form action={save} className="space-y-3">
      <Label htmlFor="model">Model</Label>

      <select
        id="model"
        name="model"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        className="border-input bg-background w-full max-w-lg rounded-md border px-3 py-2 text-sm"
      >
        {/* The selected model may have been retired since it was chosen, so it
            is listed even when the catalogue no longer offers it. */}
        {!models.some((m) => m.id === choice) && (
          <option value={choice}>{choice} (no longer listed)</option>
        )}
        {recommended.length > 0 && (
          <optgroup label="Recommended">
            {recommended.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {priceLabel(m.cost)}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label={`Everything that can read an invoice (${rest.length}), cheapest first`}>
          {rest.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} — {priceLabel(m.cost)}
            </option>
          ))}
        </optgroup>
      </select>

      {current?.recommended && (
        <p className="text-muted-foreground text-sm">{current.recommended}</p>
      )}

      <p className="text-muted-foreground text-xs">
        Prices are a rough guide for one page and a short answer, so treat them
        as a ratio between models rather than a bill. Only models that accept an
        image and support structured output are listed, because the rest cannot
        do this job.
        {stale && " This list is the last one fetched; OpenRouter was unreachable just now."}
      </p>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={saving || choice === selected}>
          {saving ? "Saving…" : "Use this model"}
        </Button>
        {message && (
          <span
            role="status"
            className={
              message.ok
                ? "text-sm text-emerald-700 dark:text-emerald-400"
                : "text-destructive text-sm"
            }
          >
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
