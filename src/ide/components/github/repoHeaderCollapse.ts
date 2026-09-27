/**
 * Scroll-linked header collapse for the repository page.
 *
 * The repo header (identity row, language bar, tabs) eats a large slice of a
 * phone screen. Once the README is what the user is reading, the header
 * slides away with the scroll so the README owns the whole viewport — and
 * comes straight back when they scroll up.
 *
 * Pure geometry, no React: `useRepoHeaderCollapse` projects these numbers
 * onto Animated values, and the numbers are asserted headlessly.
 */

/**
 * How far the collapse spreads, as a multiple of the header height. The
 * window always ENDS where the README's top reaches the top of the screen, so
 * a larger ratio starts the slide earlier and glides it slower. Anything
 * below 2 makes the content under the finger travel faster than 1.5x the
 * finger (the body has to take over `headerHeight` of space either way), so 2
 * is the snappiest ratio that still reads as a glide.
 */
export const COLLAPSE_TRAVEL_RATIO = 2;

export interface CollapseWindow {
  /** Scroll offset where the header starts to move. */
  start: number;
  /** Scroll distance over which it fully leaves. */
  distance: number;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * `readmeY` is the README card's top in scroll-content coordinates, so
 * `scrollY === readmeY` is exactly the offset where the README's top is level
 * with the top of the screen. A short tree puts the window start above the
 * first pixel of scroll, which would leave the header part-collapsed on open —
 * clamp to 0 so the header is always whole until the user actually scrolls.
 * Nothing measurable (no README, or not laid out yet) means no collapse.
 */
export function collapseWindow(
  headerHeight: number,
  readmeY: number,
  ratio = COLLAPSE_TRAVEL_RATIO
): CollapseWindow | null {
  if (!(headerHeight > 0) || !(readmeY > 0)) return null;
  const distance = headerHeight * ratio;
  return { start: Math.max(0, readmeY - distance), distance };
}

/** Header displacement in px: 0 = fully visible, headerHeight = fully gone. */
export function collapseOffset(
  scrollY: number,
  window: CollapseWindow | null,
  headerHeight: number
): number {
  if (!window || !(headerHeight > 0) || !(window.distance > 0)) return 0;
  return clamp01((scrollY - window.start) / window.distance) * headerHeight;
}

/**
 * The README's top in screen coordinates once the container has been lifted
 * by `collapseOffset` (the body's top sits `headerHeight` inside it). The
 * probe asserts this reaches 0 exactly as `scrollY` reaches `readmeY` — "the
 * screen fully displays the README" — and never stays positive while the
 * header is gone.
 */
export function readmeTopOnScreen(
  scrollY: number,
  window: CollapseWindow | null,
  headerHeight: number,
  readmeY: number
): number {
  return headerHeight - collapseOffset(scrollY, window, headerHeight) + readmeY - scrollY;
}