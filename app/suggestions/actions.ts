"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { applyDecision } from "@/lib/items/suggestions.ts";
import { track } from "@/lib/analytics/server.ts";

export type Decision = { ok: true; message: string } | { ok: false; message: string };

async function requireSession() {
  const jar = await cookies();
  if (!(await isValidSession(jar.get(sessionCookie.name)?.value))) {
    throw new Error("Sign in to decide a suggestion.");
  }
}

/**
 * Yes or no on one borderline match.
 *
 * Both answers are recorded, because "not the same thing" is an answer worth
 * keeping: without it the same line comes back tomorrow and the queue never
 * empties.
 *
 * Accepting links the line to the candidate in the same transaction as the
 * decision, so a price history cannot show a purchase whose decision was not
 * saved, or the reverse.
 */
export async function decideSuggestion(
  _previous: Decision | null,
  form: FormData,
): Promise<Decision> {
  await requireSession();

  const lineItemId = form.get("lineItemId");
  const verdict = form.get("verdict");
  if (typeof lineItemId !== "string" || (verdict !== "accepted" && verdict !== "rejected")) {
    return { ok: false, message: "Nothing to decide." };
  }

  let applied;
  try {
    applied = await applyDecision(lineItemId, verdict);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not save that decision.",
    };
  }
  if (!applied.ok) return { ok: false, message: "That one has already been decided." };

  await track("suggestion_decided", { verdict });

  // The accepted line changes a price history and an item's spend, so the
  // screens that show them are stale the moment this returns.
  revalidatePath("/suggestions");
  revalidatePath("/items");
  revalidatePath("/vendors");

  return {
    ok: true,
    message: verdict === "accepted" ? "Linked." : "Left unlinked.",
  };
}
