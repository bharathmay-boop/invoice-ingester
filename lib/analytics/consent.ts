/**
 * The analytics consent choice (#175). The one thing that legitimately lives
 * in the browser before consent, because it has to survive without it. Kept
 * with the time it was made, which is the record of what was agreed and when.
 */

export const CONSENT_KEY = "analytics-consent";

export type Choice = "accepted" | "rejected";

type Store = Pick<Storage, "getItem" | "setItem">;

/**
 * What applies now: the stored choice, or null when none was made. Global
 * Privacy Control is a refusal without asking, and wins over anything stored.
 */
export function currentChoice(store: Store, gpc: boolean): Choice | null {
  if (gpc) return "rejected";
  try {
    const stored = JSON.parse(store.getItem(CONSENT_KEY) ?? "null") as { choice?: unknown } | null;
    return stored?.choice === "accepted" || stored?.choice === "rejected" ? stored.choice : null;
  } catch {
    return null;
  }
}

export function recordChoice(store: Store, choice: Choice, at = new Date()): void {
  store.setItem(CONSENT_KEY, JSON.stringify({ choice, at: at.toISOString() }));
}

/**
 * Records a choice and then acts on it. Accept takes effect only if the
 * choice was actually recorded, so tracking never runs with no record of the
 * agreement, as in a browser that blocks storage. Reject always takes effect,
 * since it only removes things. Returns whether the choice was recorded.
 */
export function applyChoice(
  store: Store,
  choice: Choice,
  effects: { accept: () => void; reject: () => void },
): boolean {
  let recorded = true;
  try {
    recordChoice(store, choice);
  } catch {
    recorded = false;
  }
  if (choice === "rejected") effects.reject();
  else if (recorded) effects.accept();
  return recorded;
}

/**
 * The choice in force, reaching storage only through `open`, which a browser
 * that blocks storage makes throw. GPC is read first, so a refusal sent that
 * way holds even when storage cannot be read at all.
 */
export function choiceIn(open: () => Store, gpc: boolean): Choice | null {
  if (gpc) return "rejected";
  try {
    return currentChoice(open(), false);
  } catch {
    return null;
  }
}
