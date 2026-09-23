"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { deleteSecret, setSecret, setSetting } from "@/lib/settings/store.ts";
import { checkThresholds, THRESHOLDS_SETTING } from "@/lib/items/match.ts";
import { checkTolerance } from "@/lib/extract/validate.ts";
import {
  isProvider,
  MODEL_SETTING,
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

export async function chooseModel(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  await requireSession();

  const model = form.get("model");
  if (typeof model !== "string" || !model.trim()) {
    return { ok: false, message: "Pick a model first." };
  }

  await setSetting(MODEL_SETTING, model.trim());
  revalidatePath("/settings");
  return { ok: true, message: "Saved. New uploads will use it." };
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

/**
 * The two matching thresholds, saved together.
 *
 * Together because they are one decision: a suggest threshold above the link
 * threshold would mean a band that links and suggests at once, and saving them
 * one at a time would pass through that state on the way to a valid pair.
 */
export async function saveThresholds(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  await requireSession();

  const link = Number(form.get("link"));
  const suggest = Number(form.get("suggest"));

  try {
    checkThresholds({ link, suggest });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Those thresholds do not work together.",
    };
  }

  // One write, so the pair is never half changed.
  await setSetting(THRESHOLDS_SETTING, { link, suggest });
  revalidatePath("/settings");

  return {
    ok: true,
    message:
      link === suggest
        ? "Saved. With both the same there is no band, so every match either links or becomes a new item."
        : "Saved. This applies to the next invoice you save, not to matches already decided.",
  };
}

/**
 * How much rounding to forgive before an invoice is held for checking.
 *
 * Read by the arithmetic checks at extraction and again at save, so a change
 * here is the difference between an invoice counting and an invoice waiting.
 */
export async function saveTolerance(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  await requireSession();

  const entered = form.get("tolerance");
  if (typeof entered !== "string" || entered.trim() === "") {
    // An empty box is not zero. Number("") is 0, which would quietly save the
    // strictest possible setting and report success.
    return { ok: false, message: "Enter a tolerance in rupees." };
  }

  const rupees = Number(entered);
  try {
    checkTolerance(rupees);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "That tolerance will not do.",
    };
  }

  await setSetting("rounding_tolerance", rupees);
  revalidatePath("/settings");

  return {
    ok: true,
    message:
      rupees === 0
        ? "Saved. With no tolerance at all, a one paisa rounding difference will hold an invoice."
        : "Saved. This applies to the next invoice you read or save.",
  };
}
