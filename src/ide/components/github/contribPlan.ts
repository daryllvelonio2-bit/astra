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
/** Hunt pace: one steady cruise speed, plus the cycle floor. */
const SNAKE_MS_PER_CELL = ms(95);
const SNAKE_MIN_MS = ms(2600);
/** Classic arcade body: head plus this many trailing segments, in cells. */
export const SNAKE_BODY_CELLS = 6;
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

/** A square on the grid: the classic snake walks whole cells, never pixels. */
export interface SnakeStep {
  col: number;
  row: number;
}

export interface SnakePlan {
  mode: "snake";
  /** The head's walk in travel order: every cell entered, one grid step apart. */
  route: SnakeStep[];
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
 * Classic snake pacing: a steady cruise from cell to cell. The game moves one
 * square per tick, so the head's progress is a straight line — no easing, no
 * lunging, nothing to solve backwards.
 */
export function snakeEase(u: number): number {
  return u;
}

/**
 * Totally-ordered lunch: a plain left-to-right, top-to-bottom line of targets
 * the route keeps marching toward.
 */
function lunchLine(alive: ContribCell[]): ContribCell[] {
  return alive.slice().sort((a, b) => a.col - b.col || a.row - b.row);
}

/**
 * Walk one cell toward a target, the way the game steers: the axis that is
 * further off moves first, so corners land on whole cells and the walk never
 * cuts diagonally across one.
 */
function stepToward(from: SnakeStep, to: ContribPoint): SnakeStep {
  const dx = to.col - from.col;
  const dy = to.row - from.row;
  if (dx === 0 && dy === 0) return from;
  if (Math.abs(dx) >= Math.abs(dy)) return { col: from.col + Math.sign(dx), row: from.row };
  return { col: from.col, row: from.row + Math.sign(dy) };
}

/**
 * The classic route: the head walks the grid one cell at a time and eats every
 * square it steps on, chasing its lunch line until nothing is left. Steps are
 * plain up/down/left/right — the body simply follows the head's footprints, so
 * the whole snake reads like the game: a chain of whole cells winding around.
 */
function buildRoute(lunch: ContribCell[]): { route: SnakeStep[]; bites: number[] } {
  const route: SnakeStep[] = [];
  const bites: number[] = [];
  let head = { col: lunch[0].col, row: lunch[0].row };
  route.push(head);
  let next = 1;
  while (next < lunch.length) {
    head = stepToward(head, lunch[next]);
    route.push(head);
    if (head.col === lunch[next].col && head.row === lunch[next].row) next++;
  }
  const keyAt = new Map<string, number>();
  lunch.forEach((cell, i) => keyAt.set(`${cell.col}:${cell.row}`, i));
  route.forEach((step, i) => {
    const target = keyAt.get(`${step.col}:${step.row}`);
    // First visit eats it; the walk can cross a square it already ate.
    if (target !== undefined && bites[target] === undefined) bites[target] = i;
  });
  return { route, bites };
}

export function buildSnakePlan(alive: ContribCell[], cols: number): SnakePlan {
  void cols;
  if (!alive.length) {
    return { mode: "snake", route: [], cycleMs: SNAKE_MIN_MS, vanishAt: new Map() };
  }
  const lunch = lunchLine(alive);
  const { route, bites } = buildRoute(lunch);
  // One steady tick per cell: a long year costs more than a short one. The
  // floor keeps a bare year readable, the cap a crowded one from crawling.
  const cycleMs = Math.min(MAX_CYCLE_MS, Math.max(SNAKE_MIN_MS, route.length * SNAKE_MS_PER_CELL));
  const vanishAt = new Map<string, number>();
  const span = Math.max(1, route.length - 1);
  lunch.forEach((cell, i) => vanishAt.set(cell.key, (bites[i] / span) * cycleMs));
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

