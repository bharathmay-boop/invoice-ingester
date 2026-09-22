import { NextResponse, type NextRequest } from "next/server.js";
import { isCorrectPassword, mintSession, sessionCookie } from "@/lib/auth.ts";
import { clearLoginAttempts, registerLoginAttempt } from "@/lib/rate-limit.ts";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // Shape first, and it costs no slot. A request carrying no guess is not a
  // guess: counting them would let eight empty posts lock out everyone behind
  // one address without anybody trying a password.
  let password: unknown;
  try {
    ({ password } = await request.json());
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  if (typeof password !== "string" || !password) {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }

  // Then reserve, still before the comparison, so a locked out source cannot
  // keep spending a constant time comparison per guess and a parallel burst
  // cannot all pass on one count.
  const limit = await registerLoginAttempt(request);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many wrong passwords. Try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  if (!(await isCorrectPassword(password))) {
    // The attempt is already recorded. Deliberately says nothing about which
    // part was wrong.
    return NextResponse.json({ error: "That password is not right." }, { status: 401 });
  }

  // A correct password clears the record, so one mistyped evening is not a
  // lockout.
  await clearLoginAttempts(request);

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
