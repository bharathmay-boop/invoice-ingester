"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ACCEPT_ATTRIBUTE, MAX_INVOICES_PER_FILE, reject } from "@/lib/upload.ts";
import { capture } from "../analytics-provider.tsx";

type Stage = "queued" | "uploading" | "extracting" | "ready" | "rejected" | "not_invoice" | "failed";

type Item = {
  id: string;
  name: string;
  size: number;
  stage: Stage;
  note: string;
  /** One per invoice found in the file. */
  drafts?: Draft[];
  /** When the current in-flight stage began, for the elapsed timer. */
  startedAt?: number;
};

type Draft = { id: string; firstPage: number; lastPage: number; summary: string };

const pagesOf = (d: Draft) =>
  d.lastPage > d.firstPage ? `Pages ${d.firstPage} to ${d.lastPage}` : `Page ${d.firstPage}`;

const STEPS = [
  { label: "Upload", stage: "uploading" },
  { label: "Read", stage: "extracting" },
  { label: "Check", stage: "ready" },
] as const;

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  return <span className="tabular-nums">{Math.max(0, Math.round((now - since) / 1000))}s</span>;
}

/**
 * Upload, read, check, with the live step spinning. Only drawn while a file is
 * in flight or done: a file that stopped just shows its reason.
 */
function Steps({ stage }: { stage: Stage }) {
  const current = STEPS.findIndex((s) => s.stage === stage);
  const at = stage === "queued" ? -1 : current;
  return (
    <ol className="flex items-center gap-2 text-xs">
      {STEPS.map((step, i) => {
        const done = i < at || stage === "ready";
        const active = i === at && stage !== "ready";
        return (
          <li
            key={step.label}
            className={`flex items-center gap-1.5 ${
              done ? "text-foreground" : active ? "text-foreground font-medium" : "text-muted-foreground"
            }`}
          >
            {done ? (
              <CheckIcon className="text-primary size-3.5" aria-hidden />
            ) : active ? (
              <Spinner className="size-3.5 motion-reduce:animate-none" aria-hidden />
            ) : (
              <span className="bg-border size-1.5 rounded-full" aria-hidden />
            )}
            {step.label}
            {i < STEPS.length - 1 && <span className="bg-border ml-1 h-px w-4" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

/** Stages where the file went no further, so there is no step trail to draw. */
const STOPPED: Stage[] = ["rejected", "not_invoice", "failed"];

const STAGE_TEXT: Record<Stage, string> = {
  queued: "Waiting",
  uploading: "Uploading",
  extracting: "Reading the invoice",
  ready: "Ready to review",
  rejected: "Not accepted",
  not_invoice: "Not an invoice",
  failed: "Failed",
};

export function Dropzone({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [items, setItems] = useState<Item[]>([]);

  function update(id: string, patch: Partial<Item>) {
    setItems((current) => current.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function handle(files: FileList | null) {
    if (!files || !enabled) return;

    const queued: Item[] = [...files].map((file) => {
      const refusal = reject(file);
      return {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        stage: refusal ? ("rejected" as Stage) : ("queued" as Stage),
        note: refusal?.reason ?? "",
      };
    });

    setItems((current) => [...queued, ...current]);

    // One at a time. Extraction costs money per file, and a serial queue makes
    // the running total visible rather than spending it all at once.
    for (const [index, file] of [...files].entries()) {
      const item = queued[index];
      if (item.stage === "rejected") continue;

      try {
        update(item.id, { stage: "uploading", startedAt: Date.now() });
        capture("upload_started", { content_type: file.type, size_bytes: file.size });
        const body = new FormData();
        body.append("file", file);

        const stored = await fetch("/api/upload", { method: "POST", body });
        const result = await stored.json().catch(() => ({}));
        if (!stored.ok) {
          update(item.id, { stage: "failed", note: result.error ?? "Upload failed." });
          continue;
        }

        update(item.id, { stage: "extracting", startedAt: Date.now() });
        const extracted = await fetch("/api/extract", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: result.url, name: result.name, contentType: result.contentType }),
        });
        const outcome = await extracted.json().catch(() => ({}));
        if (!extracted.ok) {
          capture("upload_rejected", { not_an_invoice: outcome.notInvoice === true });
          update(item.id, {
            stage: outcome.notInvoice ? "not_invoice" : "failed",
            note: outcome.error ?? "Extraction failed.",
          });
          continue;
        }

        const drafts: Draft[] = outcome.drafts ?? [];
        capture("upload_extracted", { invoices: drafts.length, over_limit: outcome.overLimit === true });
        update(item.id, {
          stage: "ready",
          drafts,
          note:
            drafts.length === 1
              ? drafts[0].summary
              : `${drafts.length} invoices found.` +
                (outcome.overLimit
                  ? ` That is over the ${MAX_INVOICES_PER_FILE} per file limit. All were read, but split larger files next time.`
                  : ""),
        });
      } catch (error) {
        update(item.id, {
          stage: "failed",
          note: error instanceof Error ? error.message : "Something went wrong.",
        });
      }
    }

    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (enabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void handle(e.dataTransfer.files);
        }}
        className={`rounded-lg border border-dashed px-6 py-12 text-center transition-colors ${
          over ? "border-primary bg-accent/50" : "border-border"
        } ${enabled ? "" : "opacity-60"}`}
      >
        <p className="font-medium">
          {enabled ? "Drop invoices here" : "Uploading needs a provider key"}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          PDF or image (JPEG, PNG, WebP), up to {MAX_INVOICES_PER_FILE} invoices per file.
          Several files at once is fine.
        </p>

        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          disabled={!enabled}
          onChange={(e) => {
            void handle(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          disabled={!enabled}
          onClick={() => input.current?.click()}
        >
          Choose files
        </Button>
      </div>

      {items.length > 0 && (
        <ul className="divide-border divide-y">
          {items.map((item) => (
            <li key={item.id} className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              {(item.stage === "uploading" || item.stage === "extracting") && (
                <span className="bg-muted absolute inset-x-0 bottom-0 h-0.5 overflow-hidden" aria-hidden>
                  <span className="bg-primary animate-indeterminate block h-full w-1/4 motion-reduce:animate-none" />
                </span>
              )}
              <span className="flex flex-col gap-1">
                <span className="text-sm font-medium">{item.name}</span>
                {!STOPPED.includes(item.stage) && <Steps stage={item.stage} />}
                {item.note && (
                  <span
                    className={`text-xs ${
                      STOPPED.includes(item.stage)
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {item.note}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-muted-foreground text-xs">
                  <span aria-live="polite">{STAGE_TEXT[item.stage]}</span>
                  {(item.stage === "uploading" || item.stage === "extracting") && item.startedAt && (
                    // Out of the live region, or a reader would announce every tick.
                    <span aria-hidden>
                      {" · "}
                      <Elapsed key={item.startedAt} since={item.startedAt} />
                    </span>
                  )}
                </span>
                {item.stage === "ready" && item.drafts?.length === 1 && (
                  <Button asChild size="sm">
                    <a href={`/review/${item.drafts[0].id}`}>Review</a>
                  </Button>
                )}
              </span>
              {item.stage === "ready" && item.drafts && item.drafts.length > 1 && (
                <ol className="border-border w-full space-y-2 border-l pl-4">
                  {item.drafts.map((draft, i) => (
                    <li key={draft.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                      <span className="flex flex-col">
                        <span className="text-sm">
                          Invoice {i + 1}
                          <span className="text-muted-foreground"> · {pagesOf(draft)}</span>
                        </span>
                        <span className="text-muted-foreground text-xs">{draft.summary}</span>
                      </span>
                      <Button asChild size="sm" variant={i === 0 ? "default" : "outline"}>
                        <a href={`/review/${draft.id}`}>Review</a>
                      </Button>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
