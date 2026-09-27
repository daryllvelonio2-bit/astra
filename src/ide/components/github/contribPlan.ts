/**
 * Pure planning for the contribution-graph animations: grid geometry, the
 * snake's route through the squares, the aircraft's strafing passes and the
 * exact instant each green square dies. No React and no Animated in here — the
 * visual layers only replay these numbers, which keeps the schedule readable
 * and keeps per-frame work out of the render path.
 */

export const ROWS = 7;
export const CELL = 11;
export const GAP = 2.5;
/** Distance between two square origins (square + gap). */
export const CELL_STEP = CELL + GAP;
/** Flight lane reserved above the grid for the aircraft. */
export const SKY = 16;
/** Sprite box the aircraft is drawn in — also how far off-screen it parks. */
export const PLANE_BOX = 16;
export const BULLET_W = 2;
export const BULLET_H = 6;

/** Bullet travel time from the plane's belly to a square. */
export const BULLET_FLIGHT_MS = 240;
/** A hit square shrinks away over this long. */
export const FADE_MS = 180;
/** The wiped grid holds this long before the squares come back. */
export const HOLD_MS = 850;
/** Squares fade back in together over this long. */
export const REAPPEAR_MS = 420;
/** Rest on the refilled grid before the next animation is picked. */
export const REST_MS = 750;
/** The snake's whole-snake fade-out once its route is done. */
export const EXIT_MS = 260;
/** Gap between two strafing passes (the aircraft lines up out of sight). */
const PASS_GAP_MS = 170;
/** Longest a single animation may run before every square is gone. */
const MAX_CYCLE_MS = 9000;

export type ContribMode = "snake" | "plane";

export interface ContribPoint {
  col: number;
  row: number;
}

/** A square that carries at least one contribution. */
export interface ContribCell extends ContribPoint {
  key: string;
}

export interface SnakePlan {
  mode: "snake";
  /** Squares in travel order: newest week first, snaking through the grid. */
  route: ContribPoint[];
  /** Milliseconds the head spends on one square. */
  stepMs: number;
  cycleMs: number;
  /** Square key -> ms after cycle start at which the snake eats it. */
  vanishAt: Map<string, number>;
}

export interface PlanePass {
  start: number;
  duration: number;
}

export interface PlaneShot {
  key: string;
  col: number;
  row: number;
  /** Muzzle moment: the plane sits directly above the square here. */
  fireAt: number;
  /** Pixels the bullet drops before it lands on the square. */
  fall: number;
}

export interface PlanePlan {
  mode: "plane";
  passes: PlanePass[];
  shots: PlaneShot[];
  cycleMs: number;
  vanishAt: Map<string, number>;
}

export type ContribPlan = SnakePlan | PlanePlan;

export const cellCenterX = (col: number): number => col * CELL_STEP + CELL / 2;

export const rowCenterY = (row: number): number => SKY + row * CELL_STEP + CELL / 2;

export const gridWidth = (cols: number): number => cols * CELL + Math.max(0, cols - 1) * GAP;

/** Bullets leave the plane's belly, right at the top edge of the grid. */
export const muzzleY = (): number => SKY;

export const planeTop = (): number => SKY / 2 - PLANE_BOX / 2;

const posKey = (col: number, row: number): string => `${col}:${row}`;

/**
 * Serpentine route covering the whole grid, newest week first (the end the
 * scroller is pinned to, so the snake is visible from its first step).
 */
function buildRoute(cols: number): ContribPoint[] {
  const route: ContribPoint[] = [];
  for (let i = 0; i < cols; i++) {
    const col = cols - 1 - i;
    if (i % 2 === 0) {
      for (let row = 0; row < ROWS; row++) route.push({ col, row });
    } else {
      for (let row = ROWS - 1; row >= 0; row--) route.push({ col, row });
    }
  }
  return route;
}

/** Random every cycle, never twice in a row so both animations get seen. */
export function pickContribMode(previous: ContribMode | null): ContribMode {
  const pick: ContribMode = Math.random() < 0.5 ? "snake" : "plane";
  if (!previous || pick !== previous) return pick;
  return previous === "snake" ? "plane" : "snake";
}

export function buildSnakePlan(alive: ContribCell[], cols: number): SnakePlan {
  const route = buildRoute(cols);
  // Quick enough to feel alive, slow enough to follow; short routes get a floor
  // so a nearly empty year still reads as a snake instead of a teleport.
  const cycleMs = Math.min(MAX_CYCLE_MS, Math.max(2600, route.length * 20));
  const stepMs = cycleMs / Math.max(1, route.length - 1);
  const keyAtPos = new Map<string, string>();
  alive.forEach((c) => keyAtPos.set(posKey(c.col, c.row), c.key));
  const vanishAt = new Map<string, number>();
  route.forEach((point, i) => {
    const key = keyAtPos.get(posKey(point.col, point.row));
    if (key) vanishAt.set(key, i * stepMs);
  });
  return { mode: "snake", route, stepMs, cycleMs, vanishAt };
}

export function buildPlanePlan(alive: ContribCell[], cols: number): PlanePlan {
  const rowsByCol = new Map<number, number[]>();
  const keyAtPos = new Map<string, string>();
  alive.forEach((c) => {
    const rows = rowsByCol.get(c.col);
    if (rows) rows.push(c.row);
    else rowsByCol.set(c.col, [c.row]);
    keyAtPos.set(posKey(c.col, c.row), c.key);
  });
  rowsByCol.forEach((rows) => rows.sort((a, b) => a - b));

  // A pass clears the top-most surviving square of every column the aircraft
  // crosses, so a column n squares tall needs n passes — and a pass with
  // nothing left to shoot never happens at all.
  const layers: ContribPoint[][] = [];
  const taken = new Map<number, number>();
  for (let pass = 0; pass < ROWS; pass++) {
    const targets: ContribPoint[] = [];
    rowsByCol.forEach((rows, col) => {
      const i = taken.get(col) || 0;
      if (i < rows.length) {
        targets.push({ col, row: rows[i] });
        taken.set(col, i + 1);
      }
    });
    if (!targets.length) break;
    layers.push(targets);
  }

  const width = gridWidth(cols);
  const span = width + PLANE_BOX; // right edge -> just past the left edge
  // The aircraft flies right to left, so a column decides when the plane is
  // above it — and therefore when the bullet leaves the belly.
  const lane = (col: number) => Math.min(0.97, Math.max(0.03, (width - cellCenterX(col)) / span));
  const passMs = Math.min(1400, Math.max(900, Math.round(5200 / Math.max(1, layers.length))));

  const shots: PlaneShot[] = [];
  const passes: PlanePass[] = [];
  const vanishAt = new Map<string, number>();
  let t = 0;
  layers.forEach((targets) => {
    targets.forEach((target) => {
      // The square dies when the bullet lands, and no bullet is airborne longer
      // than its flight time.
      const at = Math.max(t + BULLET_FLIGHT_MS + 20, t + lane(target.col) * passMs);
      const key = keyAtPos.get(posKey(target.col, target.row));
      shots.push({
        key: key || posKey(target.col, target.row),
        col: target.col,
        row: target.row,
        fireAt: at - BULLET_FLIGHT_MS,
        fall: Math.max(2, rowCenterY(target.row) - muzzleY() - BULLET_H / 2),
      });
      if (key) vanishAt.set(key, at);
    });
    passes.push({ start: t, duration: passMs });
    t += passMs + PASS_GAP_MS;
  });

  return { mode: "plane", passes, shots, cycleMs: Math.max(600, t - PASS_GAP_MS), vanishAt };
}

