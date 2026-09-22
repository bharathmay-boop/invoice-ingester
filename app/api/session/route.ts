import { NextResponse, type NextRequest } from "next/server.js";
import { isCorrectPassword, mintSession, sessionCookie } from "@/lib/auth.ts";
import {
  checkLoginRate,
  clearLoginFailures,
  recordLoginFailure,
  sweepLoginAttempts,
} from "@/lib/rate-limit.ts";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // Checked before the password is even read, so a locked out source cannot
  // keep spending a constant time comparison per guess.
  const limit = await checkLoginRate(request);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many wrong passwords. Try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  let password: unknown;
  try {
    ({ password } = await request.json());
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  if (typeof password !== "string" || !password) {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }

  if (!(await isCorrectPassword(password))) {
    await recordLoginFailure(request);
    // Deliberately says nothing about which part was wrong.
    return NextResponse.json({ error: "That password is not right." }, { status: 401 });
  }

  // A correct password clears the record, so one mistyped evening is not a
  // lockout, and old rows go with it rather than needing a scheduled job.
  await clearLoginFailures(request);
  await sweepLoginAttempts();

  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie.name, await mintSession(), {
    ...sessionCookie.options,
    maxAge: sessionCookie.maxAge,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie.name, "", {
    ...sessionCookie.options,
    maxAge: 0,
  });
  return response;
}
