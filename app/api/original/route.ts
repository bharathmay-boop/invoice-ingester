import { get } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server.js";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { query } from "@/lib/db.ts";

export const runtime = "nodejs";

/**
 * Streams a stored original back to the browser. The blobs are private, so
 * this is the only way to see one, and it checks the session first.
 *
 * Only URLs this app actually recorded are served. Without that check the
 * route would happily fetch any blob URL handed to it.
 */
export async function GET(request: NextRequest) {
  const jar = await cookies();
  if (!(await isValidSession(jar.get(sessionCookie.name)?.value))) {
    return NextResponse.json({ error: "Sign in to view the original." }, { status: 401 });
  }

  const url = request.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "No file requested." }, { status: 400 });

  const known = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM (
       SELECT blob_url FROM draft WHERE blob_url = $1
       UNION ALL
       SELECT blob_url FROM invoice WHERE blob_url = $1
     ) AS m`,
    [url],
  );
  if (!known[0]?.n) {
    return NextResponse.json({ error: "Not a stored original." }, { status: 404 });
  }

  const stored = await get(url, { access: "private" });
  if (!stored) {
    return NextResponse.json({ error: "Could not read the stored file." }, { status: 502 });
  }

  return new NextResponse(stored.stream, {
    headers: {
      "content-type": stored.blob.contentType ?? "application/octet-stream",
      // Private document: never cached by anything in between.
      "cache-control": "private, no-store",
      "content-disposition": "inline",
    },
  });
}
