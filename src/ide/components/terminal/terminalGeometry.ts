/**
 * Viewport geometry helpers (headlessly testable).
 *
 * The shell runs on pipes (no PTY yet), so there is no kernel window size.
 * We estimate the grid from the measured viewport + font size and export
 * COLUMNS/LINES so readline-style wrapping stays sane. Phase 2 (real PTY)
 * replaces the export with a native TIOCSWINSZ resize call using this grid.
 */

export interface TerminalGrid {
  cols: number;
  rows: number;
}

const MIN_COLS = 20;
const MAX_COLS = 240;
const MIN_ROWS = 10;
const MAX_ROWS = 120;
const FALLBACK_GRID: TerminalGrid = { cols: 80, rows: 24 };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function estimateTerminalGrid(
  viewportWidthPx: number,
  viewportHeightPx: number,
  fontSizePx: number
): TerminalGrid {
  if (
    !Number.isFinite(viewportWidthPx) ||
    !Number.isFinite(viewportHeightPx) ||
    !Number.isFinite(fontSizePx) ||
    viewportWidthPx <= 0 ||
    viewportHeightPx <= 0 ||
    fontSizePx <= 0
  ) {
    return FALLBACK_GRID;
  }
  // Monospace advance ≈ 0.6em, line height ≈ 1.45em; minus viewport padding.
  const cols = Math.floor((viewportWidthPx - 20) / (fontSizePx * 0.6));
  const rows = Math.floor((viewportHeightPx - 16) / (fontSizePx * 1.45));
  return {
    cols: clamp(cols, MIN_COLS, MAX_COLS),
    rows: clamp(rows, MIN_ROWS, MAX_ROWS),
  };
}

/** Shell command that publishes the grid. Caller writes it (with newline). */
export function buildViewportExport(grid: TerminalGrid): string {
  return `export COLUMNS=${grid.cols} LINES=${grid.rows}\n`;
}

export function sameGrid(a: TerminalGrid | null, b: TerminalGrid): boolean {
  return !!a && a.cols === b.cols && a.rows === b.rows;
}
