import { get } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server.js";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { query } from "@/lib/db.ts";
import { extractWithAnthropic } from "@/lib/extract/anthropic.ts";
import { getProvider, PROVIDER_LABEL } from "@/lib/extract/provider.ts";
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

  const provider = await getProvider();
  if (provider !== "anthropic") {
    return NextResponse.json(
      { error: `${PROVIDER_LABEL[provider]} extraction is not built yet. Switch to Claude in settings.` },
      { status: 409 },
    );
  }

  // Read the private blob here rather than handing the provider a URL. A
  // private blob has no URL anyone can fetch, which is the point of it.
  const stored = await get(url, { access: "private" });
  if (!stored) {
    return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 502 });
  }
  const data = Buffer.from(await new Response(stored.stream).arrayBuffer()).toString("base64");

  const outcome = await extractWithAnthropic({ data, contentType });
  if (!outcome.ok) {
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

  return NextResponse.json({
    draftId: draft.id,
    status: checks.status,
    summary:
      checks.status === "confirmed"
        ? `${outcome.invoice.vendor_name}, ${outcome.invoice.line_items.length} line items. The figures add up.`
        : checks.discrepancies.map(describeDiscrepancy).join(" "),
  });
}
