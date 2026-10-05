import { NextResponse, type NextRequest } from "next/server.js";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { waitingCount } from "@/lib/contracts/queue.ts";
import { callWorker } from "@/lib/contracts/cron.ts";

export const runtime = "nodejs";

/**
 * Start the chain.
 *
 * The browser cannot call the worker directly: the worker is guarded by a
 * shared secret precisely so nothing a browser sends can reach it, and sending
 * that secret to a browser would defeat the point. So the browser asks here,
 * with its session, and this makes the one call that starts the queue draining
 * itself.
 */
export async function POST(request: NextRequest) {
  const jar = await cookies();
  if (!(await isValidSession(jar.get(sessionCookie.name)?.value))) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const waiting = await waitingCount();
  if (waiting === 0) return NextResponse.json({ waiting: 0, started: false });

  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set, so the reader cannot be started." },
      { status: 500 },
    );
  }

  // Not awaited. The chain outlives this request by design, and waiting for it
  // would hold the browser for as long as the whole queue takes.
  callWorker(request.nextUrl.origin);

  return NextResponse.json({ waiting, started: true });
}
