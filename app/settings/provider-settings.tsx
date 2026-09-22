"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  checkConnection,
  chooseProvider,
  removeKey,
  saveKey,
  type ActionResult,
} from "./actions.ts";

export type ProviderView = {
  id: "anthropic" | "openrouter";
  label: string;
  blurb: string;
  present: boolean;
  masked: string | null;
};

export function ProviderSettings({
  providers,
  selected,
}: {
  providers: ProviderView[];
  selected: string;
}) {
  const [choice, chooseAction] = useActionState<ActionResult | null, FormData>(
    chooseProvider,
    null,
  );

  return (
    <div className="space-y-6">
      <form action={chooseAction} className="space-y-3">
        <fieldset>
          <legend className="text-sm font-medium">Extract invoices with</legend>
          <div className="mt-3 space-y-2">
            {providers.map((provider) => (
              <label
                key={provider.id}
                className="border-border hover:bg-accent/40 flex cursor-pointer items-start gap-3 rounded-lg border p-3"
              >
                <input
                  type="radio"
                  name="provider"
                  value={provider.id}
                  defaultChecked={provider.id === selected}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-medium">{provider.label}</span>
                  <span className="text-muted-foreground block text-xs">{provider.blurb}</span>
                  {!provider.present && (
                    <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">
                      No key saved, so this provider cannot run yet.
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm">
            Use this provider
          </Button>
          {choice && (
            <span
              role="status"
              className={
                choice.ok
                  ? "text-sm text-emerald-700 dark:text-emerald-400"
                  : "text-destructive text-sm"
              }
            >
              {choice.message}
            </span>
          )}
        </div>
      </form>

      <Separator />

      <div className="space-y-6">
        {providers.map((provider) => (
          <KeyField key={provider.id} provider={provider} />
        ))}
      </div>
    </div>
  );
}

function KeyField({ provider }: { provider: ProviderView }) {
  // A saved key is never shown, so the only way to change it is to replace it.
  const [replacing, setReplacing] = useState(!provider.present);

  // One message, always the most recent thing that happened. Rendering three
  // independent action results side by side left a stale "rejected that key"
  // sitting next to a key that had just been replaced.
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // The follow-up state lives in the action rather than an effect keyed on its
  // result: it is a consequence of the submit, not synchronisation with
  // anything outside React.
  const [, saveAction, saving] = useActionState<ActionResult | null, FormData>(
    async (previous, form) => {
      const result = await saveKey(previous, form);
      setMessage({ ok: result.ok, text: result.message });
      // Without this the field stays in replace mode with the key still sitting
      // in it and the new mask never appears until a reload, so a save that
      // worked looks like nothing happened.
      if (result.ok) setReplacing(false);
      return result;
    },
    null,
  );

  const [, removeAction] = useActionState<ActionResult | null, FormData>(
    async (previous, form) => {
      const result = await removeKey(previous, form);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) setReplacing(true);
      return result;
    },
    null,
  );

  const [, testAction, testing] = useActionState(
    async (previous: Awaited<ReturnType<typeof checkConnection>> | null, form: FormData) => {
      const result = await checkConnection(previous, form);
      setMessage(
        result.ok ? { ok: true, text: result.detail } : { ok: false, text: result.error },
      );
      return result;
    },
    null,
  );

  const id = `key-${provider.id}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>{provider.label} key</Label>
        {provider.present && !replacing && (
          <span className="text-muted-foreground font-mono text-sm">{provider.masked}</span>
        )}
      </div>

      {replacing ? (
        <form action={saveAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="provider" value={provider.id} />
          <Input
            id={id}
            name="key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={provider.id === "anthropic" ? "sk-ant-..." : "sk-or-..."}
            className="max-w-sm flex-1 font-mono"
          />
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : "Save key"}
          </Button>
          {provider.present && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setReplacing(false)}>
              Cancel
            </Button>
          )}
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setReplacing(true)}>
            Replace
          </Button>
          <form action={testAction}>
            <input type="hidden" name="provider" value={provider.id} />
            <Button type="submit" size="sm" variant="outline" disabled={testing}>
              {testing ? "Testing…" : "Test connection"}
            </Button>
          </form>
          <form action={removeAction}>
            <input type="hidden" name="provider" value={provider.id} />
            <Button type="submit" size="sm" variant="ghost">
              Remove
            </Button>
          </form>
        </div>
      )}

      {message && (
        <p
          role="status"
          className={
            message.ok
              ? "text-sm text-emerald-700 dark:text-emerald-400"
              : "text-destructive text-sm"
          }
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
