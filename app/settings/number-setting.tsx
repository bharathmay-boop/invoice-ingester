"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "./actions.ts";

type Field = {
  name: string;
  label: string;
  /** What this number means in the product, not what it means to the database. */
  note: string;
  value: number;
  min: number;
  max: number;
  step: number;
};

/**
 * One form, one save, for settings that are numbers.
 *
 * The thresholds are saved as a pair because they are one decision, so this
 * takes a list of fields rather than being a control per number.
 */
export function NumberSetting({
  fields,
  action,
  children,
}: {
  fields: Field[];
  action: (previous: ActionResult | null, form: FormData) => Promise<ActionResult>;
  /** What the numbers do, said once above the fields. */
  children?: React.ReactNode;
}) {
  const [result, save, saving] = useActionState<ActionResult | null, FormData>(action, null);

  return (
    <form action={save} className="space-y-4">
      {children}

      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.name} className="space-y-1.5">
            <Label htmlFor={field.name}>{field.label}</Label>
            <Input
              id={field.name}
              name={field.name}
              type="number"
              inputMode="decimal"
              defaultValue={field.value}
              min={field.min}
              max={field.max}
              step={field.step}
              className="max-w-40"
            />
            <p className="text-muted-foreground text-xs">{field.note}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {result && (
          <span
            role="status"
            className={`text-xs ${result.ok ? "text-muted-foreground" : "text-destructive"}`}
          >
            {result.message}
          </span>
        )}
      </div>
    </form>
  );
}
