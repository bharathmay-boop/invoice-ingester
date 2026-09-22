import { get } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server.js";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { query } from "@/lib/db.ts";
import { discardUpload } from "@/lib/blob.ts";
import { extractWithAnthropic } from "@/lib/extract/anthropic.ts";
import { extractWithOpenRouter } from "@/lib/extract/openrouter.ts";
import { getProvider } from "@/lib/extract/provider.ts";
import { DEFAULT_TOLERANCE_RUPEES, describeDiscrepancy, validateArithmetic } from "@/lib/extract/validate.ts";
import { getSetting } from "@/lib/settings/store.ts";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const jar = await cookies();
  if (!(await isValidSession(jar.get(sessionCookie.name)?.value))) {
    return NextResponse.json({ error: "Sign in to upload." }, { status: 401 });
  }

  const { url, name, contentType } = await request.json().catch(() => ({}));
  if (typeof url !== "string" || typeof name !== "string" || typeof contentType !== "string") {
    return NextResponse.json({ error: "Expected a stored file." }, { status: 400 });
  }

  // Only a blob this app stored, and only once. The delete is the claim: two
  // requests for the same file cannot both win it, so they cannot both call the
  // provider and end up with two drafts pointing at one blob, where discarding
  // either would pull the original out from under the other.
  const claimed = await query<{ id: string }>(
    "DELETE FROM upload WHERE blob_url = $1 RETURNING id",
    [url],
  );
  if (!claimed.length) {
    return NextResponse.json(
      { error: "That file was not uploaded here, or has already been read." },
      { status: 404 },
    );
  }

  // From here the upload row is gone, so nothing but this block knows the file
  // exists. Every path out of it either hands the blob to a draft or deletes
  // it: leaving on any other path strands a private invoice in the store that
  // no row can ever find again.
  try {
    const provider = await getProvider();

    // Read the private blob here rather than handing the provider a URL. A
    // private blob has no URL anyone can fetch, which is the point of it.
    const stored = await get(url, { access: "private" });
    if (!stored) {
      await discardUpload(url);
      return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 502 });
    }
    const data = Buffer.from(await new Response(stored.stream).arrayBuffer()).toString("base64");

    const outcome =
      provider === "anthropic"
        ? await extractWithAnthropic({ data, contentType })
        : await extractWithOpenRouter({ data, contentType });

    if (!outcome.ok) {
      await discardUpload(url);
      return NextResponse.json({ error: outcome.error }, { status: 422 });
    }

    const tolerance =
      (await getSetting<number>("rounding_tolerance")) ?? DEFAULT_TOLERANCE_RUPEES;
    const checks = validateArithmetic(outcome.invoice, tolerance);

    const [draft] = await query<{ id: string }>(
      `INSERT INTO draft (blob_url, file_name, content_type, extracted, discrepancies,
                          status, extraction_meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        url,
        name,
        contentType,
        JSON.stringify(outcome.invoice),
        JSON.stringify(checks.discrepancies),
        checks.status === "confirmed" ? "checks_passed" : "needs_review",
        JSON.stringify(outcome.meta),
      ],
    );

    // Ownership has transferred. The draft holds the blob from here.
    return NextResponse.json({
      draftId: draft.id,
      status: checks.status,
      summary:
        checks.status === "confirmed"
          ? `${outcome.invoice.vendor_name}, ${outcome.invoice.line_items.length} line items. The figures add up.`
          : checks.discrepancies.map(describeDiscrepancy).join(" "),
    });
  } catch (error) {
    // A throw anywhere above, including from the draft insert itself, leaves
    // nothing owning the file.
    await discardUpload(url);
    console.error("extraction failed after claiming the upload", error);
    return NextResponse.json({ error: "Could not read that invoice." }, { status: 500 });
  }
}
