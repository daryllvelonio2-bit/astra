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
/**
 * After a square dies it stays dark for a random moment inside this window,
 * then fades back on its own — the grid breathes continuously instead of
 * wiping and refilling between rounds.
 */
export const RESPAWN_MIN_MS = ms(1500);
export const RESPAWN_MAX_MS = ms(6000);
/** A respawning square fades back in over this long. */
export const REAPPEAR_MS = ms(420);
/** The snake's whole-snake fade-out once its route is done (also its fade-in). */
export const EXIT_MS = ms(260);
/** Gap between two strafing passes (the aircraft lines up out of sight). */
const PASS_GAP_MS = ms(170);
/** Longest a single animation may run before every square is gone. */
const MAX_CYCLE_MS = ms(22500);
/** Cruise pace: one steady tick per cell of the hunt. */
const SNAKE_MS_PER_CELL = ms(30);
const SNAKE_MIN_MS = ms(1300);
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

/** How many of the closest uneaten squares the snake picks its next kill from. */
const HUNT_WIDTH = 3;

/**
 * Random hunt: the snake starts where the user looks (newest week, already in
 * view — the scroller pins to the recent end), then each kill is a random pick
 * among the closest uneaten squares, so every cycle darts a different trail.
 * Hops stay short (no cross-grid dashes), which keeps the walk — and the pace
 * below — bounded no matter how the shuffle lands.
 */
function huntOrder(alive: ContribCell[]): ContribCell[] {
  const remaining = new Map<string, ContribCell>();
  alive.forEach((c) => remaining.set(c.key, c));
  const order: ContribCell[] = [];
  let head: ContribPoint = alive.reduce((best, c) =>
    c.col > best.col || (c.col === best.col && c.row < best.row) ? c : best
  );
  while (remaining.size) {
    const byDist = Array.from(remaining.values())
      .map((c) => ({ c, d: Math.abs(c.col - head.col) + Math.abs(c.row - head.row) }))
      .sort((a, b) => a.d - b.d || (a.c.key < b.c.key ? -1 : 1));
    const pool = byDist.slice(0, Math.min(HUNT_WIDTH, byDist.length));
    const next = pool[Math.floor(Math.random() * pool.length)].c;
    remaining.delete(next.key);
    order.push(next);
    head = { col: next.col, row: next.row };
  }
  return order;
}

const DIRS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * One step toward the target along the shortest path that avoids the body.
 * The body slides every step, so the search runs per step against the current
 * trail — the head threads around itself instead of crossing through it, and
 * shortest-path steps never wander away from the kill. If no free path exists,
 * it escapes onto the free neighbor closest to the target; only a head fully
 * surrounded by body falls through to the direct stride (and the route guard
 * below bounds even that).
 */
function nextStep(
  head: SnakeStep,
  target: ContribPoint,
  occupied: Set<string>,
  tail: SnakeStep | null,
  c0: number,
  c1: number
): SnakeStep {
  const key = (c: number, r: number): string => `${c}:${r}`;
  if (head.col === target.col && head.row === target.row) return head;
  const prev = new Map<string, SnakeStep | null>();
  const queue: SnakeStep[] = [{ col: head.col, row: head.row }];
  prev.set(key(head.col, head.row), null);
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    if (cur.col === target.col && cur.row === target.row) {
      let node = cur;
      let p = prev.get(key(node.col, node.row));
      while (p && (p.col !== head.col || p.row !== head.row)) {
        node = p;
        p = prev.get(key(p.col, p.row));
      }
      return node;
    }
    for (const [dc, dr] of DIRS) {
      const nc = cur.col + dc;
      const nr = cur.row + dr;
      if (nc < c0 || nc > c1 || nr < 0 || nr >= ROWS) continue;
      const k = key(nc, nr);
      if (prev.has(k)) continue;
      const isTarget = nc === target.col && nr === target.row;
      if (!isTarget && occupied.has(k)) continue;
      prev.set(k, cur);
      queue.push({ col: nc, row: nr });
    }
  }
  // Boxed in (no free path — rare with a 6-long body on an open grid):
  // escape onto the free neighbor closest to the target, or onto the tail tip
  // (it vacates as the head arrives, like the game) — never through the body.
  let best: SnakeStep | null = null;
  let bestDist = Infinity;
  for (const [dc, dr] of DIRS) {
    const nc = head.col + dc;
    const nr = head.row + dr;
    if (nc < c0 || nc > c1 || nr < 0 || nr >= ROWS || occupied.has(key(nc, nr))) continue;
    const d = Math.abs(target.col - nc) + Math.abs(target.row - nr);
    if (d < bestDist) {
      bestDist = d;
      best = { col: nc, row: nr };
    }
  }
  if (best) return best;
  // Fully surrounded: the tail tip vacates as the head arrives, so stepping
  // onto it when adjacent is safe — the last move that avoids the body.
  if (
    tail &&
    Math.abs(tail.col - head.col) + Math.abs(tail.row - head.row) === 1 &&
    tail.col >= c0 &&
    tail.col <= c1
  ) {
    return { col: tail.col, row: tail.row };
  }
  const dx = target.col - head.col;
  const dy = target.row - head.row;
  if (Math.abs(dx) >= Math.abs(dy)) return { col: head.col + Math.sign(dx), row: head.row };
  return { col: head.col, row: head.row + Math.sign(dy) };
}
/**
 * The classic route: the head walks the grid one cell at a time and eats every
 * square it steps on, chasing its hunt order until nothing is left. Every step
 * paths around the current body (see nextStep), so the head never crosses its
 * own trail and every stride approaches the kill — the walk stays tight like
 * the game instead of jumbling across the grid. The body simply follows the
 * head's footprints: a chain of whole cells winding around. Kills eaten in
 * passing are skipped as waypoints, so the head never doubles back onto its
 * own trail for one.
 */
function buildRoute(
  lunch: ContribCell[],
  c0: number,
  c1: number
): { route: SnakeStep[]; bites: number[] } {
  const route: SnakeStep[] = [];
  const bites: number[] = [];
  let head = { col: lunch[0].col, row: lunch[0].row };
  route.push(head);
  const pos = (s: SnakeStep): string => `${s.col}:${s.row}`;
  // Squares eaten so far (the start square dies under the head at t=0).
  const eaten = new Set<string>([pos(head)]);
  let next = 1;
  // Fail-safe: the stepper always returns a move, but a corrupt grid must
  // never spin — bail out instead of looping forever.
  const maxSteps = Math.max(500, lunch.length * 50);
  while (next < lunch.length && route.length < maxSteps) {
    // Skip kills already eaten in passing — the head never doubles back onto
    // its own trail for a dead waypoint.
    while (next < lunch.length && eaten.has(pos(lunch[next]))) next++;
    if (next >= lunch.length) break;
    const target = lunch[next];
    // Cells the visible body covers right now (the tail tip sits just outside
    // this window: it vacates as the head arrives, so it stays enterable).
    const occupied = new Set<string>();
    for (let k = Math.max(0, route.length - SNAKE_BODY_CELLS); k < route.length; k++) {
      occupied.add(`${route[k].col}:${route[k].row}`);
    }
    // The vacating tail tip, for the fully-surrounded escape in nextStep.
    const tail = route.length >= SNAKE_BODY_CELLS + 1 ? route[route.length - SNAKE_BODY_CELLS - 1] : null;
    head = nextStep(head, target, occupied, tail, c0, c1);
    route.push(head);
    eaten.add(pos(head));
    if (head.col === target.col && head.row === target.row) next++;
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
  if (!alive.length) {
    return { mode: "snake", route: [], cycleMs: SNAKE_MIN_MS, vanishAt: new Map() };
  }
  const lunch = huntOrder(alive);
  // Keep the pathfinder on the greens' turf (plus a little margin) so the
  // head routes around its body instead of detouring across empty grid.
  let lo = cols;
  let hi = -1;
  alive.forEach((c) => {
    if (c.col < lo) lo = c.col;
    if (c.col > hi) hi = c.col;
  });
  const c0 = Math.max(0, lo - 2);
  const c1 = Math.min(Math.max(cols - 1, 0), hi + 2);
  const { route, bites } = buildRoute(lunch, c0, c1);
  // One steady tick per cell: a long year costs more than a short one. The
  // floor keeps a bare year readable, the cap a crowded one from crawling.
  const cycleMs = Math.min(MAX_CYCLE_MS, Math.max(SNAKE_MIN_MS, route.length * SNAKE_MS_PER_CELL));
  const vanishAt = new Map<string, number>();
  const span = Math.max(1, route.length - 1);
  lunch.forEach((cell, i) => vanishAt.set(cell.key, ((bites[i] ?? span) / span) * cycleMs));
  return { mode: "snake", route, cycleMs, vanishAt };
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

