/**
 * What produced the figures on a review screen, said where they are shown
 * (EU AI Act Article 50, #178). Read from the metadata stored with the read,
 * so it names the model that actually ran rather than a hardcoded one, and a
 * demo row, marked `source: "demo-seed"` or `is_demo`, never claims a model.
 * Null when nothing was stored, rather than a guess.
 */
export function readBy(meta: unknown, isDemo = false): string | null {
  const record = (meta && typeof meta === "object" ? meta : {}) as { model?: unknown; source?: unknown };
  if (isDemo || record.source === "demo-seed") {
    return "Demo data, written for the demo. No model read this document.";
  }
  if (typeof record.model !== "string" || !record.model) return null;
  return `Read by ${record.model}, an AI model. Check each figure against the original before it counts.`;
}
