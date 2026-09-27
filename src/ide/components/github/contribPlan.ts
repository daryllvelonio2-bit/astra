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
/** Hunt pace: ms per px travelled, plus the cycle floor. */
const SNAKE_MS_PER_PX = ms(1.5);
const SNAKE_MIN_MS = ms(2600);
/** Body length in px; also how far the hunt streams in and out of the field. */
export const SNAKE_BODY_PX = 110;
/** px between curve samples, and how many near squares one hop may reach. */
const PATH_SPACING = 3;
const HUNT_REACH = 8;
/** How hard the head lunges: 0.45 = speed swings between ~55% and ~145%. */
const LUNGE_DEPTH = 0.45;
const LUNGE_WAVES = 5;
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

/** A point in the grid's own pixel space. */
export interface PathPoint {
  x: number;
  y: number;
}

export interface SnakePlan {
  mode: "snake";
  /** Centre-line of the hunt in grid px, resampled every `spacing` px. */
  path: PathPoint[];
  /** px between two neighbouring path points. */
  spacing: number;
  /** Total hunt distance in px. */
  length: number;
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

/** Moment at which the lunging head has covered `fraction` of the hunt. */
function arrivalAt(fraction: number, cycleMs: number): number {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (snakeEase(mid) < fraction) low = mid;
    else high = mid;
  }
  return ((low + high) / 2) * cycleMs;
}

/** What one hop costs the snake: the larger of its two axis distances. */
const hop = (a: ContribPoint, b: ContribPoint): number =>
  Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));

/**
 * The order the snake eats in: it grabs a square at random out of the few
 * nearest still standing, so it darts off somewhere new every hop instead of
 * clearing the field lane by lane — without flinging itself across the whole
 * year, which is what would turn a busy graph into a crawl.
 */
function huntOrder(alive: ContribCell[]): ContribCell[] {
  const left = alive.slice();
  const order: ContribCell[] = [left.splice(Math.floor(Math.random() * left.length), 1)[0]];
  while (left.length) {
    const from = order[order.length - 1];
    const reach = Math.min(HUNT_REACH, left.length);
    // Partial selection sort brings the `reach` closest squares to the front.
    for (let i = 0; i < reach; i++) {
      let best = i;
      for (let j = i + 1; j < left.length; j++) {
        if (hop(left[j], from) < hop(left[best], from)) best = j;
      }
      const swap = left[i];
      left[i] = left[best];
      left[best] = swap;
    }
    order.push(left.splice(Math.floor(Math.random() * reach), 1)[0]);
  }
  return order;
}

/**
 * Prolongs the line `toward -> from` past `from`, so the snake is already
 * travelling when it slides into view and never stops, doubles back or is cut
 * off at the edge of the field.
 */
function stretch(
  from: PathPoint,
  toward: PathPoint,
  px: number,
  box: { right: number; bottom: number }
): PathPoint {
  const dx = from.x - toward.x;
  const dy = from.y - toward.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: Math.min(box.right, Math.max(-SNAKE_BODY_PX, from.x + (dx / length) * px)),
    y: Math.min(box.bottom, Math.max(-SNAKE_BODY_PX, from.y + (dy / length) * px)),
  };
}

/** Catmull-Rom coordinate at t along the segment b -> c, pulled by a and d. */
const bend = (a: number, b: number, c: number, d: number, t: number, t2: number, t3: number): number =>
  0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);

/**
 * The curve the head actually follows: it glides *through* its target squares
 * rather than stopping and cornering on them, which is what makes a snake look
 * like a snake. `mark[i]` is where in the samples point i landed.
 */
function curveThrough(points: PathPoint[]): { dense: PathPoint[]; mark: number[] } {
  const at = (i: number): PathPoint => points[Math.min(points.length - 1, Math.max(0, i))];
  const dense: PathPoint[] = [];
  const mark: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    mark.push(dense.length);
    const steps = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / PATH_SPACING));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      dense.push({
        x: bend(p0.x, p1.x, p2.x, p3.x, t, t2, t3),
        y: bend(p0.y, p1.y, p2.y, p3.y, t, t2, t3),
      });
    }
  }
  mark.push(dense.length);
  dense.push(points[points.length - 1]);
  return { dense, mark };
}

/**
 * The hunt as a centre-line: `path` is the curve resampled at an even spacing,
 * so turning a travelled distance into a spot on it is one multiplication, and
 * `bites[i]` is how far along it the snake reaches square i.
 */
function buildHunt(order: ContribCell[], cols: number): { path: PathPoint[]; spacing: number; length: number; bites: number[] } {
  const squares = order.map((c) => ({ x: cellCenterX(c.col), y: rowCenterY(c.row) }));
  const box = { right: gridWidth(cols) + SNAKE_BODY_PX, bottom: rowCenterY(ROWS - 1) + SNAKE_BODY_PX };
  const tail = squares.length - 1;
  const entry = stretch(squares[0], squares[1] || { x: squares[0].x - 120, y: squares[0].y }, SNAKE_BODY_PX + 24, box);
  const exit = stretch(squares[tail], squares[tail - 1] || squares[0], SNAKE_BODY_PX + 24, box);
  const { dense, mark } = curveThrough([entry, ...squares, exit]);

  const cum: number[] = [0];
  for (let i = 1; i < dense.length; i++) {
    cum[i] = cum[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y);
  }
  const total = cum[cum.length - 1];
  const count = Math.max(3, Math.round(total / PATH_SPACING) + 1);
  const path: PathPoint[] = [];
  let segment = 0;
  for (let i = 0; i < count; i++) {
    const wanted = (i / (count - 1)) * total;
    while (segment < cum.length - 2 && cum[segment + 1] < wanted) segment++;
    const span = cum[segment + 1] - cum[segment] || 1;
    const t = Math.min(1, Math.max(0, (wanted - cum[segment]) / span));
    path.push({
      x: dense[segment].x + (dense[segment + 1].x - dense[segment].x) * t,
      y: dense[segment].y + (dense[segment + 1].y - dense[segment].y) * t,
    });
  }
  // mark[0] is the entry point, so the eaten squares start at mark[1].
  return { path, spacing: total / (count - 1), length: total, bites: squares.map((_, i) => cum[mark[i + 1]]) };
}

export function buildSnakePlan(alive: ContribCell[], cols: number): SnakePlan {
  if (!alive.length) {
    return { mode: "snake", path: [], spacing: PATH_SPACING, length: 0, cycleMs: SNAKE_MIN_MS, vanishAt: new Map() };
  }
  const order = huntOrder(alive);
  const hunt = buildHunt(order, cols);
  // Pace is distance, so a long dash costs more than a short one. The floor
  // keeps a bare year readable, the cap a crowded one from turning into a crawl.
  const cycleMs = Math.min(MAX_CYCLE_MS, Math.max(SNAKE_MIN_MS, Math.round(hunt.length * SNAKE_MS_PER_PX)));
  const vanishAt = new Map<string, number>();
  order.forEach((cell, i) => vanishAt.set(cell.key, arrivalAt(hunt.bites[i] / hunt.length, cycleMs)));
  return { mode: "snake", path: hunt.path, spacing: hunt.spacing, length: hunt.length, cycleMs, vanishAt };
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

