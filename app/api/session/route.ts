import { NextResponse, type NextRequest } from "next/server";
import { isCorrectPassword, mintSession, sessionCookie } from "@/lib/auth.ts";

export async function POST(request: NextRequest) {
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
    // Deliberately says nothing about which part was wrong.
    return NextResponse.json({ error: "That password is not right." }, { status: 401 });
  }

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
