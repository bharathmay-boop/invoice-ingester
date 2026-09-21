import { put } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server.js";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { getProvider, SECRET_FOR } from "@/lib/extract/provider.ts";
import { describeSecret } from "@/lib/settings/store.ts";
import { reject } from "@/lib/upload.ts";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // The proxy already refuses writes without a session. Checked again here
  // because a route is its own entry point.
  const jar = await cookies();
  if (!(await isValidSession(jar.get(sessionCookie.name)?.value))) {
    return NextResponse.json({ error: "Sign in to upload." }, { status: 401 });
  }

  // A disabled dropzone is a courtesy, not a guard. Without a key the upload
  // would succeed and then fail during extraction, which is the worst place to
  // find out.
  const provider = await getProvider();
  const key = await describeSecret(SECRET_FOR[provider]);
  if (!key.present) {
    return NextResponse.json(
      { error: "No provider key is saved. Add one in settings before uploading." },
      { status: 409 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was sent." }, { status: 400 });
  }

  const refusal = reject(file);
  if (refusal) {
    return NextResponse.json({ error: refusal.reason }, { status: 415 });
  }

  // Private, not public. An invoice is a business document: putting it on a
  // world readable URL because that is the easier call would be a bad trade.
  // It is read back through /api/original, which checks the session first.
  const blob = await put(`invoices/${crypto.randomUUID()}-${file.name}`, file, {
    access: "private",
    addRandomSuffix: false,
    contentType: file.type,
  });

  return NextResponse.json({
    url: blob.url,
    pathname: blob.pathname,
    name: file.name,
    size: file.size,
    contentType: file.type,
  });
}
