"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { mergeItems } from "@/lib/items/merge.ts";
import { track } from "@/lib/analytics/server.ts";

export type MergeOutcome = { ok: false; message: string } | null;

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Folds this item into another one and sends you to the item that remains.
 *
 * Merging is not reversible: the two histories become one and there is nothing
 * left recording which purchase came from where. The screen asks before
 * calling this, and this checks the ids are ids before trusting them.
 */
export async function mergeIntoAction(
  _previous: MergeOutcome,
  form: FormData,
): Promise<MergeOutcome> {
  const jar = await cookies();
  if (!(await isValidSession(jar.get(sessionCookie.name)?.value))) {
    return { ok: false, message: "Sign in to merge items." };
  }

  const mergeId = form.get("mergeId");
  const keepId = form.get("keepId");
  if (typeof mergeId !== "string" || typeof keepId !== "string") {
    return { ok: false, message: "Nothing to merge." };
  }
  if (!UUID.test(mergeId) || !UUID.test(keepId)) {
    return { ok: false, message: "That is not an item." };
  }

  let result;
  try {
    result = await mergeItems(keepId, mergeId);
  } catch (error) {
    console.error("merge failed", error instanceof Error ? error.message : error);
    return { ok: false, message: "Could not merge those items. Nothing was changed." };
  }

  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === "same_item"
          ? "That is the same item."
          : "One of those items is no longer there. Reload and try again.",
    };
  }

  await track("items_merged", { moved: result.moved });

  revalidatePath("/items");
  revalidatePath("/suggestions");
  // To the item that remains: the one this page was showing no longer exists.
  redirect(`/items/${result.keptId}`);
}
