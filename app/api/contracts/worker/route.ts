import { NextResponse, type NextRequest } from "next/server.js";
import { head } from "@vercel/blob";
import { query } from "@/lib/db.ts";
import {
  beat,
  claimNext,
  markFailed,
  markReadyForReview,
  recordRates,
  waitingCount,
} from "@/lib/contracts/queue.ts";
import { readContract } from "@/lib/contracts/read.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One contract, then hand the chain on.
 *
 * Hobby runs a cron once a day at best, so this does not wait for a tick: the
 * upload fires a request here without awaiting it, and this does the same
 * before returning. The queue drains itself and starts the instant the files
 * land.
 *
 * ponytail: one at a time, no concurrency control. For a batch somebody
 * uploads and walks away from that is the right behaviour anyway, and the
 * chain becomes a fan-out if throughput ever matters.
 */
export async function POST(request: NextRequest) {
  // Not a user route. It is called by the upload and by itself, both of which
  // know the secret; nothing a browser sends can reach it. Guarded this way
  // rather than by session because the chain outlives the request that started
  // it, and by then there is no session to check.
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Not for you." }, { status: 401 });
  }

  const contract = await claimNext();
  if (!contract) return NextResponse.json({ read: 0, waiting: 0 });

  // Held while the model reads, so the sweeper can tell a worker that is
  // working from one that died.
  const pulse = setInterval(() => {
    void beat(contract.id);
  }, 20_000);

  try {
    const blob = await head(contract.blob_url);
    const file = await fetch(blob.downloadUrl);
    if (!file.ok) throw new Error(`the stored file came back ${file.status}`);
    const bytes = Buffer.from(await file.arrayBuffer());

    const read = await readContract({
      data: bytes.toString("base64"),
      contentType: contract.content_type,
    });

    if (read.ok) {
      await recordRates(contract.id, read.contract.currency, read.contract.rates);
      await markReadyForReview(contract.id, read.contract, read.meta, read.contract.other_terms);
    } else if (read.notContract) {
      // Read and declined. Not a failure of the system, and never worth
      // another attempt, so it goes straight to terminal with what it is.
      await query(
        "UPDATE contract SET status = 'could_not_read', failure = $2, heartbeat_at = NULL WHERE id = $1",
        [contract.id, `This does not look like a contract. ${read.reason}`],
      );
    } else {
      // A retryable failure goes back in the queue by leaving the attempt
      // count to decide; one that will fail the same way again is spent.
      await markFailed(
        contract.id,
        read.failure.retryable ? contract.attempts : Number.MAX_SAFE_INTEGER,
        read.failure.message,
      );
    }
  } catch (error) {
    await markFailed(
      contract.id,
      contract.attempts,
      error instanceof Error ? error.message : "Reading this contract failed.",
    );
  } finally {
    clearInterval(pulse);
  }

  const waiting = await waitingCount();
  if (waiting > 0) handOn(request);

  return NextResponse.json({ read: 1, waiting });
}

/**
 * Start the next one without waiting for it.
 *
 * Deliberately not awaited: awaiting would make this function's lifetime the
 * whole queue's, and sixty seconds is one contract. The catch is there because
 * an unhandled rejection from a request nobody is waiting on would take the
 * function down and strand the contract it had already finished.
 */
function handOn(request: NextRequest) {
  const url = new URL("/api/contracts/worker", request.nextUrl.origin);
  void fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch(() => {});
}
