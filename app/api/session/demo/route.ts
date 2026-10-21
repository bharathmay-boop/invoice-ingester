import { NextResponse } from "next/server.js";
import { mintDemoSession, sessionCookie } from "@/lib/auth.ts";

export const runtime = "nodejs";

/**
 * Anyone can take a demo session. It costs nothing to issue and can only read
 * the seeded, invented data, since the proxy refuses its writes (#233).
 *
 * ponytail: no switch to turn this off. Production holds only demo data until
 * accounts (#174); the day it holds real invoices, this route has to go first.
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie.name, await mintDemoSession(), {
    ...sessionCookie.options,
    maxAge: sessionCookie.maxAge,
  });
  return response;
}
