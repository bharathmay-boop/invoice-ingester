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
  /**
   * Mid composition in an input method: the Enter that commits a Japanese or
   * Hindi candidate is not an Enter meant for this screen.
   */
  isComposing?: boolean;
};

/**
 * Elements whose Enter already means something: a button presses, a link
 * follows, a textarea takes a newline, a select opens. Taking Enter from any
 * of them is how "See the one already stored" turns into a second save.
 */
const OWNS_ENTER = ["BUTTON", "TEXTAREA", "A", "SELECT"];

export type Intent = "save" | "next" | null;

export function intentOf(
  event: Keystroke,
  { addsUp, saving, hasNext }: { addsUp: boolean; saving: boolean; hasNext: boolean },
): Intent {
  const onControl = OWNS_ENTER.includes(event.tagName ?? "");
  const plain = !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;

  if (event.key === "Enter" && !onControl && plain && !event.isComposing) {
    // Only when the figures agree. Saving an invoice whose own numbers
    // disagree should be a deliberate act, not a reflex on the way through a
    // stack of twenty.
    return addsUp && !saving ? "save" : null;
  }

  // Alt is the one modifier that neither browsers nor screen readers have
  // already claimed for the arrow keys. Not while a save is in flight:
  // navigating away then would hide a failure and leave the draft unsaved, or
  // race the redirect a successful save is about to make.
  if (event.key === "ArrowRight" && event.altKey && hasNext && !saving) return "next";

  return null;
}
