"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { addAlias, removeAlias } from "@/lib/items/alias.ts";
import { track } from "@/lib/analytics/server.ts";

export type AliasOutcome = { ok: false; message: string } | null;

const UUID = /^[0-9a-f-]{36}$/i;

async function signedIn() {
  const jar = await cookies();
  return isValidSession(jar.get(sessionCookie.name)?.value);
}

/**
 * Teach the matcher that a name means this item.
 *
 * Unlike merging, this is reversible and changes nothing that has already been
 * saved: it only affects what the matcher does with lines it reads from here
 * on. So there is no confirmation, just a message when it cannot be done.
 */
export async function addAliasAction(
  _previous: AliasOutcome,
  form: FormData,
): Promise<AliasOutcome> {
  if (!(await signedIn())) return { ok: false, message: "Sign in to teach the matcher a name." };

  const itemId = form.get("itemId");
  const alias = form.get("alias");
  if (typeof itemId !== "string" || !UUID.test(itemId)) {
    return { ok: false, message: "That item id does not look like an id." };
  }
  if (typeof alias !== "string") return { ok: false, message: "Type the name you want matched." };

  const result = await addAlias(itemId, alias);
  if (!result.ok) return result;

  await track("alias_added", { item_id: itemId });
  revalidatePath(`/items/${itemId}`);
  return null;
}

export async function removeAliasAction(
  _previous: AliasOutcome,
  form: FormData,
): Promise<AliasOutcome> {
  if (!(await signedIn())) return { ok: false, message: "Sign in to remove a name." };

  const itemId = form.get("itemId");
  const aliasId = form.get("aliasId");
  if (typeof itemId !== "string" || !UUID.test(itemId)) {
    return { ok: false, message: "That item id does not look like an id." };
  }
  if (typeof aliasId !== "string" || !UUID.test(aliasId)) {
    return { ok: false, message: "That name has already gone." };
  }

  await removeAlias(itemId, aliasId);
  revalidatePath(`/items/${itemId}`);
  return null;
}
