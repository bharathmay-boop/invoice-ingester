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
