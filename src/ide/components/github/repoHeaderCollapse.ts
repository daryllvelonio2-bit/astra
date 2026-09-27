/**
 * Scroll-linked header collapse for the repository page.
 *
 * The repo header (identity row, language bar, tabs) eats a large slice of a
 * phone screen. Once the README is what the user is reading, the header
 * slides away with the scroll so the README owns the whole viewport — and
 * comes straight back when they scroll up.
 *
 * Pure geometry, no React: `useRepoHeaderCollapse` projects these numbers
 * onto Animated values, and every claim here is asserted headlessly.
 */

/**
 * How long the glide is, as a multiple of the header height — two headers'
 * worth of scrolling puts the content at 1.5x the finger while the header
 * leaves, which still reads as a glide. A lower ratio looks like a snap, so
 * the glide shortens only when the list has less scroll to give.
 */
export const COLLAPSE_TRAVEL_RATIO = 2;

/**
 * Least amount of scroll a glide is worth: below this the header would jump
 * out of the way in a couple of frames and read as a glitch rather than a
 * slide.
 */
export const MIN_GLIDE = 24;

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

/** The offset where the README's top is level with the top of the screen. */
export function arrivalOffset(readmeY: number, maxScroll: number): number {
  return Math.min(readmeY, maxScroll);
}

/**
 * `readmeY` is the README card's top in scroll-content coordinates and
 * `maxScroll` is the furthest the list can scroll (content height minus the
 * viewport) — both measured on device.
 *
 * The glide ENDS at the README's arrival, so the header is exactly gone when
 * the README's top reaches the top of the screen (the two edges stay flush
 * the whole way, so the README never paints over the leaving header). The
 * arrival is itself clamped to how far the list can actually scroll, which is
 * what keeps the end of the glide reachable — a short tree simply leaves a
 * shorter glide, and under MIN_GLIDE nothing animates at all.
 *
 * Nothing measurable (no README, no data yet) means no collapse.
 */
export function collapseWindow(
  headerHeight: number,
  readmeY: number,
  maxScroll: number,
  ratio = COLLAPSE_TRAVEL_RATIO
): CollapseWindow | null {
  if (!(headerHeight > 0) || !(readmeY > 0) || !(maxScroll > 0)) return null;
  const arrival = arrivalOffset(readmeY, maxScroll);
  const distance = Math.min(headerHeight * ratio, arrival);
  if (distance < MIN_GLIDE) return null;
  return { start: arrival - distance, distance };
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
 * The README's top in screen coordinates once everything above it has been
 * lifted by `collapseOffset`. The probe asserts this reaches the top of the
 * screen exactly as the glide completes — "the screen fully displays the
 * README" — and that the header is whole again at the top of the list.
 */
export function readmeTopOnScreen(
  scrollY: number,
  window: CollapseWindow | null,
  headerHeight: number,
  readmeY: number
): number {
  return headerHeight - collapseOffset(scrollY, window, headerHeight) + readmeY - scrollY;
}