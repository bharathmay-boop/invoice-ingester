import { put } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server.js";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { getProvider, SECRET_FOR } from "@/lib/extract/provider.ts";
import { describeSecret } from "@/lib/settings/store.ts";
import { PDFDocument } from "pdf-lib";
import { MAX_INVOICES_PER_FILE, MAX_PDF_PAGES, reject } from "@/lib/upload.ts";
import { query } from "@/lib/db.ts";
import { discardUpload } from "@/lib/blob.ts";

export const runtime = "nodejs";

/**
 * Null when the PDF cannot be parsed here, for instance one that is encrypted
 * in a way pdf-lib cannot open. The model may still read it, so an unknown
 * count is let through rather than refused.
 */
async function countPages(bytes: ArrayBuffer): Promise<number | null> {
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    return pdf.getPageCount();
  } catch {
    return null;
  }
}

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

  // Counted here, before the file is stored or any model is paid to read it.
  if (file.type === "application/pdf") {
    const pages = await countPages(await file.arrayBuffer());
    if (pages !== null && pages > MAX_PDF_PAGES) {
      return NextResponse.json(
        {
          error: `${pages} pages is over the ${MAX_PDF_PAGES} page limit. Split it into smaller files of up to ${MAX_INVOICES_PER_FILE} invoices.`,
        },
        { status: 413 },
      );
    }
  }

  // Private, not public. An invoice is a business document: putting it on a
  // world readable URL because that is the easier call would be a bad trade.
  // It is read back through /api/original, which checks the session first.
  const blob = await put(`invoices/${crypto.randomUUID()}-${file.name}`, file, {
    access: "private",
    addRandomSuffix: false,
    contentType: file.type,
  });

  // Recorded so /api/extract can tell this blob from a URL a caller invented.
  // If this fails the blob goes with it: an untracked file is one nothing can
  // ever find again, which means paying to store someone's invoice forever.
  try {
    await query(
      `INSERT INTO upload (blob_url, file_name, content_type) VALUES ($1, $2, $3)
       ON CONFLICT (blob_url) DO NOTHING`,
      [blob.url, file.name, file.type],
    );
  } catch (error) {
    await discardUpload(blob.url);
    throw error;
  }

  return NextResponse.json({
    url: blob.url,
    pathname: blob.pathname,
    name: file.name,
    size: file.size,
    contentType: file.type,
  });
}
