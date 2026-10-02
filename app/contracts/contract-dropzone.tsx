"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Button } from "@/components/ui/button";
import {
  CONTRACT_ACCEPT_ATTRIBUTE,
  MAX_CONTRACTS_PER_BATCH,
  rejectContract,
} from "@/lib/contracts/limits.ts";

type Progress = { name: string; state: "hashing" | "uploading" | "done" | "failed"; detail?: string };

type Stalled = { reason: string } | null;

/**
 * Drop contracts in and leave.
 *
 * The files go from here straight to blob storage, because a two hundred page
 * agreement is past what a Vercel function takes as a request body. That also
 * means the browser is the only place that ever holds the bytes, so it is the
 * only place that can hash them, and the hash is what stops the same contract
 * being read twice.
 */
export function ContractDropzone() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [stalled, setStalled] = useState<Stalled>(null);

  async function send(files: File[]) {
    if (!files.length || busy) return;

    const batch = files.slice(0, MAX_CONTRACTS_PER_BATCH);
    setBusy(true);
    setProgress(batch.map((file) => ({ name: file.name, state: "hashing" })));

    const update = (i: number, next: Partial<Progress>) =>
      setProgress((rows) => rows.map((row, at) => (at === i ? { ...row, ...next } : row)));

    for (const [i, file] of batch.entries()) {
      const refusal = rejectContract(file);
      if (refusal) {
        update(i, { state: "failed", detail: refusal.reason });
        continue;
      }

      try {
        const digest = await sha256(file);
        update(i, { state: "uploading" });
        await upload(`contracts/${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/contracts/upload",
          clientPayload: JSON.stringify({ name: file.name, digest }),
        });
        update(i, { state: "done" });
      } catch (error) {
        update(i, {
          state: "failed",
          detail: error instanceof Error ? error.message : "That upload did not finish.",
        });
      }
    }

    // One nudge once everything is stored, rather than one per file. The
    // worker chains to the next contract itself, so the queue only needs
    // starting once.
    //
    // The answer matters. If the queue cannot be started the files sit there
    // looking uploaded and nothing ever reads them, which is the worst of both:
    // it appears to have worked and did not. So the reason is shown.
    setStalled(null);
    try {
      const started = await fetch("/api/contracts/start", { method: "POST" });
      if (!started.ok) {
        const body = (await started.json().catch(() => ({}))) as { error?: string };
        setStalled({
          reason: body.error ?? "The reader could not be started, so these are waiting.",
        });
      }
    } catch {
      setStalled({ reason: "The reader could not be reached, so these are waiting." });
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          void send([...event.dataTransfer.files]);
        }}
        className={`rounded-xl border border-dashed px-6 py-10 text-center transition-colors ${
          over ? "border-primary bg-primary/5" : "border-black/20 dark:border-white/20"
        }`}
      >
        <p className="font-medium">Drop contracts here</p>
        <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm">
          PDFs, up to {MAX_CONTRACTS_PER_BATCH} at a time. Reading a long one takes
          a while, so you can close this and come back.
        </p>
        <p className="mt-4">
          <Button type="button" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? "Uploading…" : "Choose files"}
          </Button>
        </p>
        <input
          ref={input}
          type="file"
          multiple
          accept={CONTRACT_ACCEPT_ATTRIBUTE}
          className="sr-only"
          onChange={(event) => void send([...(event.target.files ?? [])])}
        />
      </div>

      {stalled && (
        <p role="alert" className="text-destructive mt-4 text-sm">
          {stalled.reason} They stay in the queue, so nothing is lost: once the
          reader can start, it picks them up from where it left off.
        </p>
      )}

      {progress.length > 0 && (
        <ul className="mt-4 divide-y divide-black/10 text-sm dark:divide-white/15">
          {progress.map((row) => (
            <li key={row.name} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <span className="font-medium">{row.name}</span>
              <span className="text-muted-foreground text-xs">
                {row.state === "hashing" && "Checking the file…"}
                {row.state === "uploading" && "Uploading…"}
                {row.state === "done" && "Queued for reading"}
                {row.state === "failed" && (row.detail ?? "Did not upload")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The file's content hash, which is what makes the same contract dropped twice
 * one contract. Streamed through `crypto.subtle` rather than read into a
 * string, so a fifty megabyte scan does not have to fit anywhere twice.
 */
async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
