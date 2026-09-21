"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ACCEPT_ATTRIBUTE, reject } from "@/lib/upload.ts";

type Stage = "queued" | "uploading" | "extracting" | "ready" | "rejected" | "failed";

type Item = {
  id: string;
  name: string;
  size: number;
  stage: Stage;
  note: string;
  invoiceId?: string;
};

const STAGE_TEXT: Record<Stage, string> = {
  queued: "Waiting",
  uploading: "Uploading",
  extracting: "Reading the invoice",
  ready: "Ready to review",
  rejected: "Not accepted",
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
        update(item.id, { stage: "uploading" });
        const body = new FormData();
        body.append("file", file);

        const stored = await fetch("/api/upload", { method: "POST", body });
        const result = await stored.json().catch(() => ({}));
        if (!stored.ok) {
          update(item.id, { stage: "failed", note: result.error ?? "Upload failed." });
          continue;
        }

        update(item.id, { stage: "extracting" });
        const extracted = await fetch("/api/extract", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: result.url, name: result.name, contentType: result.contentType }),
        });
        const outcome = await extracted.json().catch(() => ({}));
        if (!extracted.ok) {
          update(item.id, { stage: "failed", note: outcome.error ?? "Extraction failed." });
          continue;
        }

        update(item.id, {
          stage: "ready",
          invoiceId: outcome.draftId,
          note: outcome.summary ?? "",
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
          PDF, JPEG, PNG or WebP. Several at once is fine.
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
            <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
              <span className="flex flex-col">
                <span className="text-sm font-medium">{item.name}</span>
                {item.note && (
                  <span
                    className={`text-xs ${
                      item.stage === "rejected" || item.stage === "failed"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {item.note}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-muted-foreground text-xs">{STAGE_TEXT[item.stage]}</span>
                {item.stage === "ready" && item.invoiceId && (
                  <Button asChild size="sm">
                    <a href={`/review/${item.invoiceId}`}>Review</a>
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
