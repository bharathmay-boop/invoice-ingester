/**
 * What a keystroke means on the review screen.
 *
 * Pure, so the rules are testable: whether Enter saves is the difference
 * between a flagged invoice being waved through by reflex and being looked at.
 */

export type Keystroke = {
  key: string;
  altKey?: boolean;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  /** The element the keystroke landed on, upper case as the DOM reports it. */
  tagName?: string;
};

export type Intent = "save" | "next" | null;

export function intentOf(
  event: Keystroke,
  { addsUp, saving, hasNext }: { addsUp: boolean; saving: boolean; hasNext: boolean },
): Intent {
  const onControl = event.tagName === "BUTTON" || event.tagName === "TEXTAREA";

  if (event.key === "Enter" && !onControl && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
    // Only when the figures agree. Saving an invoice whose own numbers
    // disagree should be a deliberate act, not a reflex on the way through a
    // stack of twenty.
    return addsUp && !saving ? "save" : null;
  }

  // Alt is the one modifier that neither browsers nor screen readers have
  // already claimed for the arrow keys.
  if (event.key === "ArrowRight" && event.altKey && hasNext) return "next";

  return null;
}
