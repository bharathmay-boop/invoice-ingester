/**
 * The one entrance every public section uses: a short fade up, once, when it
 * scrolls into view (#236).
 *
 * Reduced motion is handled by CSS, not by asking the browser in JavaScript.
 * The server cannot know the preference, so a JavaScript answer arrives after
 * the server has already rendered the section invisible, and the two renders
 * disagree. The media query applies from the first paint.
 */
export function revealMotion({ delay = 0 }: { delay?: number } = {}) {
  return {
    initial: { opacity: 0, y: 12 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "0px 0px -10% 0px" },
    transition: { duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] as const },
  };
}

/**
 * Beats motion's inline styles, so a reduced motion visitor never sees it
 * hidden or moving, and a visitor without JavaScript, for whom nothing would
 * ever animate the section in, still sees it.
 */
export const SHOWN_WITHOUT_ANIMATION =
  "motion-reduce:opacity-100! motion-reduce:transform-none! noscript:opacity-100! noscript:transform-none!";

/**
 * How a list row comes in on the app's list screens: a short fade up,
 * staggered, with no row waiting more than 0.3s however long the list. CSS
 * rather than motion, since the lists are server rendered (#246).
 */
export function rowEnter(index: number) {
  return {
    className: "motion-safe:animate-[fade-up_0.35s_ease-out_backwards]",
    style: { animationDelay: `${Math.min(index * 0.03, 0.3)}s` },
  };
}

/** Hover and press on a row link, so a click is seen to land. */
export const LINK_FEEDBACK = "transition-opacity hover:opacity-80 active:opacity-60";

/**
 * A piece of a screen arriving in a new state: a contract's status, the
 * finding just opened, the filtered rows. Keyed on that state where it is
 * used, so a change mounts it again and it plays once more (#248).
 */
export const STATE_ENTER = "motion-safe:animate-[fade-up_0.3s_ease-out_backwards]";
