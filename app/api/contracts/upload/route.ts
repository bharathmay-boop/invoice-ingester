import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse, type NextRequest } from "next/server.js";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { getProvider, SECRET_FOR } from "@/lib/extract/provider.ts";
import { describeSecret } from "@/lib/settings/store.ts";
import { query } from "@/lib/db.ts";
import { MAX_CONTRACT_BYTES } from "@/lib/contracts/limits.ts";

export const runtime = "nodejs";

/**
 * A contract goes from the browser straight to blob storage.
 *
 * Invoices are posted through a route, which works because an invoice is a
 * page or two. A two hundred page contract is past the 4.5 MB a Vercel
 * function will take as a request body, so the server never sees the bytes: it
 * hands out a token, the browser uploads, and the callback records the row.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Checked here and not only in the browser: this is the point where a
        // token to write into the blob store is handed out.
        const jar = await cookies();
        if (!(await isValidSession(jar.get(sessionCookie.name)?.value))) {
          throw new Error("Sign in to upload a contract.");
        }

        // A disabled dropzone is a courtesy, not a guard. Without a key the
        // upload would succeed and the queue would then fail on every file.
        const provider = await getProvider();
        const key = await describeSecret(SECRET_FOR[provider]);
        if (!key.present) {
          throw new Error("No provider key is saved. Add one in settings before uploading.");
        }

        // The browser sends the file's SHA-256 alongside its name. Hashing
        // here instead would mean the server reading bytes it deliberately
        // never receives, which is the whole reason the upload is direct.
        const sent = readPayload(clientPayload);
        if (!sent) {
          throw new Error("That upload did not say what file it is. Reload the page and try again.");
        }

        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: MAX_CONTRACT_BYTES,
          // Carried through to the callback, which runs without a session.
          tokenPayload: JSON.stringify(sent),
          addRandomSuffix: true,
        };
      },

      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const sent = readPayload(tokenPayload);
        if (!sent) return;

        // The digest is the closest thing a contract has to a natural key.
        // Invoices get duplicate detection from UNIQUE (vendor_id,
        // invoice_number); a contract has no such pair, so the same file
        // dropped twice is recognised by being the same file.
        //
        // ON CONFLICT DO NOTHING rather than an error: dropping a folder that
        // happens to contain one you already have is an ordinary mistake, and
        // the screen shows it once either way.
        await query(
          `INSERT INTO contract (title, blob_url, content_type, digest, status)
           VALUES ($1, $2, 'application/pdf', $3, 'queued')
           ON CONFLICT (digest) DO NOTHING`,
          [sent.name, blob.url, sent.digest],
        );
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "That upload could not be accepted." },
      { status: 400 },
    );
  }
}

const SHA256 = /^[0-9a-f]{64}$/;

/**
 * The file's name and content hash, as the browser sent them.
 *
 * Checked rather than trusted. The digest is a unique key, so a caller sending
 * a constant would make every contract after the first vanish into an
 * ON CONFLICT DO NOTHING with nothing to show for it. A string that is not a
 * SHA-256 is refused outright.
 */
function readPayload(raw?: string | null): { name: string; digest: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { name?: unknown; digest?: unknown };
    const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
    const digest = typeof parsed.digest === "string" ? parsed.digest.toLowerCase() : "";
    if (!name || !SHA256.test(digest)) return null;
    return { name: name.slice(0, 200), digest };
  } catch {
    return null;
  }
}
