import { NextResponse, type NextRequest } from "next/server.js";
import { reclaimStale, waitingCount } from "@/lib/contracts/queue.ts";
import { callWorker, isCronRequest } from "@/lib/contracts/cron.ts";

export const runtime = "nodejs";

/**
 * Hand back anything a dead function was holding, then restart the chain.
 *
 * A worker that runs out of its sixty seconds leaves a contract marked
 * `reading` with a heartbeat that stops moving, and the chain behind it has
 * already ended. Without this the queue simply stops, with no error anywhere
 * saying so.
 *
 * Once a day, because that is what Hobby allows and because this is the job a
 * daily cadence actually suits: it is cleaning up after a crash, not driving
 * the queue. The chain does the driving.
 */
export async function GET(request: NextRequest) {
  if (!isCronRequest(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Not for you." }, { status: 401 });
  }

  const reclaimed = await reclaimStale();
  const waiting = await waitingCount();

  if (waiting > 0) callWorker(request.nextUrl.origin);

  return NextResponse.json({ reclaimed, waiting });
}
