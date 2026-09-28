import { ContribCell, cellCenterX, gridWidth, JET_W, rowCenterY } from "./contribGrid";

/**
 * The jet hovers in the sky lane ABOVE the grid and dives down onto the
 * squares it shoots, so it never sits beside the grid reserving a lane that
 * would unbalance the graph's margins. It slides horizontally to line up over
 * the current target; each bolt then falls straight down onto that square.
 */
/** Flight duration for a bolt from the jet's belly to a target (fast by default). */
export const LASER_FLIGHT_MS = 130;
/** Duration of the block fragment explosion. */
export const EXPLOSION_MS = 220;
/** Gap between consecutive shots fired by the jet (no bombing in less than 2 sec). */
const MIN_SHOT_GAP_MS = 2200;
const MAX_SHOT_GAP_MS = 2600;
/** Maximum targets engaged in one shooting round. */
const MAX_ROUND_TARGETS = 14;

export interface ShooterShot {
  id: string;
  key: string;
  col: number;
  row: number;
  color: string;
  fireAt: number;
  landAt: number;
  flightMs: number;
  explosionMs: number;
  targetX: number;
  targetY: number;
  /** Jet's top-left x while firing this shot — it hovers above the target. */
  jetX: number;
}

export interface ShooterPlan {
  mode: "plane";
  shots: ShooterShot[];
  cycleMs: number;
  vanishAt: Map<string, number>;
  /** Fixed top y of the jet: it flies in the sky lane, above the squares. */
  hoverY: number;
}

/** Jet x that lines it up over a given column, kept inside the grid. */
function jetXOver(col: number, width: number): number {
  const centered = cellCenterX(col) - JET_W / 2;
  return Math.max(0, Math.min(width - JET_W, centered));
}

/**
 * Plans a shooting round: the jet flies in the lane above the grid, slides
 * over each green square in turn and drops a bolt straight down onto it.
 * Targets are swept newest to oldest, with varied rows so the sweep does not
 * march down a single line.
 */
export function buildShooterPlan(alive: ContribCell[], cols: number): ShooterPlan {
  const width = gridWidth(cols);
  const hoverY = 0;

  if (!alive.length) {
    return { mode: "plane", shots: [], cycleMs: 1200, vanishAt: new Map(), hoverY };
  }

  // Pick up to MAX_ROUND_TARGETS, prioritizing recent weeks (right side in view)
  // and varying rows so consecutive hits are not all in one row.
  const remaining = [...alive].sort((a, b) => b.col - a.col || a.row - b.row);
  const targets: ContribCell[] = [];
  let curRow = remaining[0]?.row ?? 0;

  while (remaining.length && targets.length < MAX_ROUND_TARGETS) {
    const windowSize = Math.min(8, remaining.length);
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let k = 0; k < windowSize; k++) {
      const d = Math.abs(remaining[k].row - curRow);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = k;
      }
    }
    const [picked] = remaining.splice(bestIdx, 1);
    targets.push(picked);
    curRow = picked.row;
  }

  const shots: ShooterShot[] = [];
  const vanishAt = new Map<string, number>();
  let t = 350; // initial delay for the jet to slide over its first target

  targets.forEach((target) => {
    const fireAt = t;
    const landAt = fireAt + LASER_FLIGHT_MS;
    const tx = cellCenterX(target.col);
    const ty = rowCenterY(target.row);

    shots.push({
      id: `${target.key}-${fireAt}`,
      key: target.key,
      col: target.col,
      row: target.row,
      color: target.color || "#2ea44f",
      fireAt,
      landAt,
      flightMs: LASER_FLIGHT_MS,
      explosionMs: EXPLOSION_MS,
      targetX: tx,
      targetY: ty,
      jetX: jetXOver(target.col, width),
    });

    vanishAt.set(target.key, landAt);
    const shotGap = MIN_SHOT_GAP_MS + Math.floor(Math.random() * (MAX_SHOT_GAP_MS - MIN_SHOT_GAP_MS));
    t += shotGap;
  });

  return {
    mode: "plane",
    shots,
    cycleMs: Math.max(1200, t + 400),
    vanishAt,
    hoverY,
  };
}
