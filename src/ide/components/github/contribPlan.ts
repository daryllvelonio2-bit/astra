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

/**
 * Duration multiplier for the whole animation: 1 is the reference pace, 2
 * plays everything at half speed. Pacing is tuned here, in one place.
 */
const PACE = 2;
/** Reference duration, scaled by PACE. */
const ms = (base: number): number => Math.round(base * PACE);

/** Bullet travel time from the plane's belly to a square. */
export const BULLET_FLIGHT_MS = ms(240);
/** A hit square shrinks away over this long. */
export const FADE_MS = ms(180);
/** The wiped grid holds this long before the squares come back. */
export const HOLD_MS = ms(850);
/** Squares fade back in together over this long. */
export const REAPPEAR_MS = ms(420);
/** Rest on the refilled grid before the next animation is picked. */
export const REST_MS = ms(750);
/** The snake's whole-snake fade-out once its route is done. */
export const EXIT_MS = ms(260);
/** Gap between two strafing passes (the aircraft lines up out of sight). */
const PASS_GAP_MS = ms(170);
/** Longest a single animation may run before every square is gone. */
const MAX_CYCLE_MS = ms(9000);
/** Ms the snake spends on one square, and its cycle floor. */
const SNAKE_MS_PER_SQUARE = ms(20);
const SNAKE_MIN_MS = ms(2600);
/** How hard the head lunges: 0.45 = speed swings between ~55% and ~145%. */
const LUNGE_DEPTH = 0.45;
const LUNGE_WAVES = 5;
/** Resolution used to turn the lunge curve back into exact hit times. */
const ARRIVAL_SAMPLES = 2048;
/** Strafing pass bounds, and the budget all passes share. */
const PASS_MIN_MS = ms(900);
const PASS_MAX_MS = ms(1400);
const PLANE_BUDGET_MS = ms(5200);

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
  /** Squares in travel order: the snake's hunt, entrance cell first. */
  route: ContribPoint[];
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
 * Speed profile for the head: it lunges ahead and eases off instead of
 * sliding at a dead constant rate. `snakeArrivals` runs the same curve
 * backwards, so a square is still eaten exactly when the head is on it.
 */
export function snakeEase(u: number): number {
  const k = 2 * Math.PI * LUNGE_WAVES;
  return u + (LUNGE_DEPTH / k) * (1 - Math.cos(k * u));
}

/** Times (ms into the cycle) at which the head reaches each route index. */
function snakeArrivals(count: number, cycleMs: number): number[] {
  const arrivals = new Array<number>(count).fill(0);
  if (count < 2) return arrivals;
  const last = count - 1;
  let index = 0;
  for (let sample = 0; sample <= ARRIVAL_SAMPLES && index < count; sample++) {
    const reached = snakeEase(sample / ARRIVAL_SAMPLES) * last;
    while (index <= last && reached >= index) {
      arrivals[index] = (sample / ARRIVAL_SAMPLES) * cycleMs;
      index++;
    }
  }
  arrivals[last] = cycleMs;
  return arrivals;
}

/** Walks from one cell to the next: diagonal while both axes need it, then straight. */
function appendStaircase(route: ContribPoint[], from: ContribPoint, to: ContribPoint): void {
  let col = from.col;
  let row = from.row;
  const stepX = Math.sign(to.col - col);
  const stepY = Math.sign(to.row - row);
  while (col !== to.col || row !== to.row) {
    if (col !== to.col) col += stepX;
    if (row !== to.row) row += stepY;
    route.push({ col, row });
  }
}

/**
 * Hunt route: the snake drops in past the newest edge and always strikes the
 * nearest green still standing, so it dashes across the field instead of
 * sweeping it lane by lane. Distance is measured in diagonal steps (the way it
 * actually moves), ties break towards the way it is already heading so it
 * commits to a dash, and any remaining tie goes at random — which is why two
 * snakes in a row never hunt the same way. Empty cells on the way are simply
 * travelled over.
 */
function buildHuntRoute(alive: ContribCell[], cols: number): ContribPoint[] {
  const route: ContribPoint[] = [{ col: cols, row: 1 + Math.floor(Math.random() * (ROWS - 2)) }];
  const remaining = alive.map((c) => ({ col: c.col, row: c.row }));
  let headingX = -1;
  let headingY = 0;
  while (remaining.length) {
    const from = route[route.length - 1];
    let best = 0;
    let bestGap = Infinity;
    let bestAhead = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dx = remaining[i].col - from.col;
      const dy = remaining[i].row - from.row;
      const gap = Math.max(Math.abs(dx), Math.abs(dy));
      const ahead = gap === 0 ? 1 : (dx * headingX + dy * headingY) / gap;
      const better =
        gap < bestGap ||
        (gap === bestGap && ahead > bestAhead) ||
        (gap === bestGap && ahead === bestAhead && Math.random() < 0.5);
      if (better) {
        best = i;
        bestGap = gap;
        bestAhead = ahead;
      }
    }
    const target = remaining.splice(best, 1)[0];
    headingX = Math.sign(target.col - from.col);
    headingY = Math.sign(target.row - from.row);
    appendStaircase(route, from, target);
  }
  return route;
}

export function buildSnakePlan(alive: ContribCell[], cols: number): SnakePlan {
  const route = buildHuntRoute(alive, cols);
  // Quick enough to feel alive, slow enough to follow; short hunts get a floor
  // so a nearly empty year still reads as a snake instead of a teleport.
  const cycleMs = Math.min(MAX_CYCLE_MS, Math.max(SNAKE_MIN_MS, route.length * SNAKE_MS_PER_SQUARE));
  const arrivals = snakeArrivals(route.length, cycleMs);
  const keyAtPos = new Map<string, string>();
  alive.forEach((c) => keyAtPos.set(posKey(c.col, c.row), c.key));
  const vanishAt = new Map<string, number>();
  route.forEach((point, i) => {
    const key = keyAtPos.get(posKey(point.col, point.row));
    // First visit eats it; the staircase can cross a square it already ate.
    if (key && !vanishAt.has(key)) vanishAt.set(key, arrivals[i]);
  });
  return { mode: "snake", route, cycleMs, vanishAt };
}

/** Random every cycle, never twice in a row so both animations get seen. */
export function pickContribMode(previous: ContribMode | null): ContribMode {
  const pick: ContribMode = Math.random() < 0.5 ? "snake" : "plane";
  if (!previous || pick !== previous) return pick;
  return previous === "snake" ? "plane" : "snake";
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
  const passMs = Math.min(PASS_MAX_MS, Math.max(PASS_MIN_MS, Math.round(PLANE_BUDGET_MS / Math.max(1, layers.length))));

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

