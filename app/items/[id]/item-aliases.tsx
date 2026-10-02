"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addAliasAction,
  removeAliasAction,
  type AliasOutcome,
} from "./alias-actions.ts";

type Alias = { id: string; alias: string };

/**
 * The names this item also answers to.
 *
 * Trigram matching compares letters, so it can never learn that "Xerox" and
 * "photocopy" are the same thing: they share almost nothing to compare. This
 * is where somebody says so once, and it is the only part of matching a person
 * can teach rather than tune.
 */
export function ItemAliases({
  itemId,
  canonicalName,
  aliases,
}: {
  itemId: string;
  canonicalName: string;
  aliases: Alias[];
}) {
  const [added, add, adding] = useActionState<AliasOutcome, FormData>(addAliasAction, null);
  const [removed, remove] = useActionState<AliasOutcome, FormData>(removeAliasAction, null);
  const problem = added ?? removed;

  return (
    <section className="mt-10">
      <h2 className="text-sm font-medium">Other names for this</h2>
      <p className="text-muted-foreground mt-1 max-w-prose text-sm">
        Matching compares spellings, so it will never work out on its own that a
        name sharing no letters with {canonicalName} means the same thing. Add
        one here and every invoice read from now on is matched on it too.
      </p>

      {aliases.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {aliases.map((alias) => (
            <li key={alias.id}>
              <form action={remove} className="contents">
                <input type="hidden" name="itemId" value={itemId} />
                <input type="hidden" name="aliasId" value={alias.id} />
                <Button type="submit" variant="outline" size="sm" className="font-normal">
                  {alias.alias}
                  <span aria-hidden className="ml-1 opacity-50">
                    &times;
                  </span>
                  <span className="sr-only">, remove this name</span>
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={add} className="mt-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="itemId" value={itemId} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="alias" className="text-xs font-normal">
            A name invoices use for this
          </Label>
          <Input
            id="alias"
            name="alias"
            placeholder="photocopy"
            className="w-56"
            autoComplete="off"
          />
        </div>
        <Button type="submit" disabled={adding}>
          {adding ? "Adding…" : "Add"}
        </Button>
      </form>

      {problem && (
        <p role="alert" className="text-destructive mt-2 text-sm">
          {problem.message}
        </p>
      )}
    </section>
  );
}
