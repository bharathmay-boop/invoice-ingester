"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { deleteSecret, setSecret, setSetting } from "@/lib/settings/store.ts";
import {
  isProvider,
  PROVIDER_SETTING,
  SECRET_FOR,
  testConnection,
  type ConnectionResult,
} from "@/lib/extract/provider.ts";

/**
 * The proxy already refuses a write without a session, but an action is a
 * public endpoint of its own and should not rely on something upstream
 * remembering to guard it.
 */
async function requireSession() {
  const jar = await cookies();
  if (!(await isValidSession(jar.get(sessionCookie.name)?.value))) {
    throw new Error("Sign in to change settings.");
  }
}

export type ActionResult = { ok: boolean; message: string };

export async function saveKey(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  await requireSession();

  const provider = form.get("provider");
  const key = form.get("key");

  if (!isProvider(provider)) return { ok: false, message: "Unknown provider." };
  if (typeof key !== "string" || !key.trim()) {
    return { ok: false, message: "Paste a key first." };
  }

  await setSecret(SECRET_FOR[provider], key);
  revalidatePath("/settings");
  // The key is never echoed, not even to confirm what was saved.
  return { ok: true, message: "Saved. Only the last four characters are shown from now on." };
}

export async function removeKey(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  await requireSession();

  const provider = form.get("provider");
  if (!isProvider(provider)) return { ok: false, message: "Unknown provider." };

  await deleteSecret(SECRET_FOR[provider]);
  revalidatePath("/settings");
  return { ok: true, message: "Key removed." };
}

export async function chooseProvider(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  await requireSession();

  const provider = form.get("provider");
  if (!isProvider(provider)) return { ok: false, message: "Unknown provider." };

  await setSetting(PROVIDER_SETTING, provider);
  revalidatePath("/settings");
  revalidatePath("/upload");
  return { ok: true, message: "Provider updated." };
}

export async function checkConnection(
  _previous: ConnectionResult | null,
  form: FormData,
): Promise<ConnectionResult> {
  await requireSession();

  const provider = form.get("provider");
  if (!isProvider(provider)) return { ok: false, error: "Unknown provider." };

  return testConnection(provider);
}
