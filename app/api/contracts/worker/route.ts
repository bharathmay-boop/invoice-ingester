import { NextResponse, type NextRequest } from "next/server.js";
import { get } from "@vercel/blob";
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
import { locate, readPages } from "@/lib/contracts/locate.ts";

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
    // `get` rather than a fetch of a download URL: the contract is stored
    // privately, so there is no URL that works without the store's own
    // credentials.
    const stored = await get(contract.blob_url, { access: "private" });
    if (!stored) throw new Error("the stored contract could not be read back");
    const bytes = Buffer.from(await new Response(stored.stream).arrayBuffer());

    const read = await readContract({
      data: bytes.toString("base64"),
      contentType: contract.content_type,
    });

    if (read.ok) {
      // Checked against the document while the bytes are still here. The page
      // a model names is a guess; the page a quote is found on is a fact, and
      // a jump that lands nowhere costs more trust than no jump at all.
      const pages = await readPages(bytes).catch(() => []);
      const rates = read.contract.rates.map((rate) => ({
        ...rate,
        page: locate(pages, rate.quote).page,
      }));
      const terms = read.contract.other_terms.map((term) => ({
        ...term,
        page: locate(pages, term.quote).page,
      }));

      await recordRates(contract.id, read.contract.currency, rates);
      await markReadyForReview(contract.id, { ...read.contract, rates }, read.meta, terms);
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
