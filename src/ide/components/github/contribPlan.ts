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
/** Longest a single animation may run: ~600 steps at cruise before it binds. */
const MAX_CYCLE_MS = ms(210000);
/** Cruise pace: one deliberate tick per block of the hunt (350ms effective). */
const SNAKE_MS_PER_CELL = ms(175);
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
  /** Square key -> every ms after cycle start at which the head walks over it. */
  visitAt: Map<string, number[]>;
  /**
   * Route index where the head begins this hunt: the tip of the carried tail,
   * so the head resumes exactly where it stopped with its body behind it —
   * handoffs are invisible. Zero on the first hunt.
   */
  headStart: number;
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
function huntOrder(alive: ContribCell[], start?: ContribPoint): ContribCell[] {
  const remaining = new Map<string, ContribCell>();
  alive.forEach((c) => remaining.set(c.key, c));
  // First kill is the start cell itself, so the head always appears in view
  // on the first hunt — and exactly where the last hunt ended on later ones.
  const newest = alive.reduce((best, c) =>
    c.col > best.col || (c.col === best.col && c.row < best.row) ? c : best
  );
  // Match the start by coordinates, not key: keys are date strings, so a
  // key lookup by "col:row" would miss every time and drop back to newest.
  let first: ContribCell | undefined;
  if (start) {
    for (const c of remaining.values()) {
      if (c.col === start.col && c.row === start.row) {
        first = c;
        break;
      }
    }
  }
  first ??= newest;
  remaining.delete(first.key);
  const order: ContribCell[] = [first];
  let head: ContribPoint = { col: first.col, row: first.row };
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
 * The head may cross empty squares to get there — but empties are never
 * targets, only greens are eaten. The body slides every step, so the search
 * runs per step against the current trail: the head threads around itself
 * instead of crossing through it, and shortest-path steps never wander away
 * from the kill.
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
  const targetKey = key(target.col, target.row);
  if (key(head.col, head.row) === targetKey) return head;
  // Shortest first step to the target, treating body squares as walls. The
  // target itself is always enterable.
  const search = (blocked: (k: string) => boolean): SnakeStep | null => {
    const prev = new Map<string, SnakeStep | null>();
    const queue: SnakeStep[] = [{ col: head.col, row: head.row }];
    prev.set(key(head.col, head.row), null);
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi];
      if (key(cur.col, cur.row) === targetKey) {
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
        if (k !== targetKey && blocked(k)) continue;
        prev.set(k, cur);
        queue.push({ col: nc, row: nr });
      }
    }
    return null;
  };
  const step = search((k) => occupied.has(k));
  if (step) return step;
  // No free path, but the grid is open ground: boxed in by body, so escape
  // onto the free neighbor closest to the target, or onto the tail tip (it
  // vacates as the head arrives, like the game).
  let best: SnakeStep | null = null;
  let bestDist = Infinity;
  for (const [dc, dr] of DIRS) {
    const nc = head.col + dc;
    const nr = head.row + dr;
    const k = key(nc, nr);
    if (nc < c0 || nc > c1 || nr < 0 || nr >= ROWS || occupied.has(k)) continue;
    const d = Math.abs(target.col - nc) + Math.abs(target.row - nr);
    if (d < bestDist) {
      bestDist = d;
      best = { col: nc, row: nr };
    }
  }
  if (best) return best;
  if (
    tail &&
    Math.abs(tail.col - head.col) + Math.abs(tail.row - head.row) === 1 &&
    tail.col >= c0 &&
    tail.col <= c1
  ) {
    return { col: tail.col, row: tail.row };
  }
  // Fully surrounded: one direct stride as the last resort (the route guard
  // bounds even this).
  const dx = target.col - head.col;
  const dy = target.row - head.row;
  if (Math.abs(dx) >= Math.abs(dy)) return { col: head.col + Math.sign(dx), row: head.row };
  return { col: head.col, row: head.row + Math.sign(dy) };
}
/**
 * The classic route: the head walks the grid one cell at a time and eats every
 * green square it steps on, chasing its hunt order until nothing is left. The
 * head may cross empty squares to reach its kills, but empties are never
 * targets — only the head's first visit to a green eats it. Every step paths
 * around the current body (see nextStep), so the head never crosses its own
 * trail and every stride approaches the kill — the walk stays tight like the
 * game instead of jumbling across the grid. The body simply follows the head's
 * footprints: a chain of whole cells winding around, so bites always land
 * under the head, never under the body. Kills eaten in passing are skipped as
 * waypoints, so the head never doubles back onto its own trail for one.
 *
 * A carried tail from the previous hunt lays ahead of the walk, so the first
 * steps route around the visible body instead of reversing straight into it.
 */
function buildRoute(
  lunch: ContribCell[],
  c0: number,
  c1: number,
  carry?: SnakeStep[]
): { route: SnakeStep[]; carried: number } {
  const at = (s: SnakeStep): string => `${s.col}:${s.row}`;
  // The carry joints only when its tip is the start cell; a stale carry is
  // dropped, never jumped to.
  const tail = carry && carry.length ? carry : null;
  const first = lunch[0];
  const joint = tail && first && tail[tail.length - 1].col === first.col && tail[tail.length - 1].row === first.row;
  const route: SnakeStep[] = joint && tail ? [...tail] : [];
  let head = { col: first.col, row: first.row };
  // Jointed: the tip is already laid as the last carry cell. Fresh: lay it.
  if (!route.length) route.push(head);
  // Squares eaten so far (the start square dies under the head at t=0).
  const eaten = new Set<string>([at(head)]);
  let next = 1;
  // Fail-safe: the stepper always returns a move, but a corrupt grid must
  // never spin — bail out instead of looping forever.
  const maxSteps = Math.max(500, lunch.length * 50);
  while (next < lunch.length && route.length < maxSteps) {
    // Skip kills already eaten in passing — the head never doubles back onto
    // its own trail for a dead waypoint.
    while (next < lunch.length && eaten.has(at(lunch[next]))) next++;
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
    eaten.add(at(head));
    if (head.col === target.col && head.row === target.row) next++;
  }
  return { route, carried: joint && tail ? tail.length : 0 };
}

export function buildSnakePlan(
  alive: ContribCell[],
  cols: number,
  start?: ContribPoint,
  carry?: SnakeStep[]
): SnakePlan {
  if (!alive.length) {
    return { mode: "snake", route: [], cycleMs: SNAKE_MIN_MS, vanishAt: new Map(), visitAt: new Map(), headStart: 0 };
  }
  const lunch = huntOrder(alive, start);
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
  const fresh = buildRoute(lunch, c0, c1);
  // Seamless handoff: lay the last hunt's tail ahead of the new walk, so the
  // head starts exactly where it stopped with its body behind it — no pop, no
  // teleport. The fresh walk's first cell duplicates the tail tip, counted
  // once. A carry that doesn't joint (stale grid) is dropped, never jumped.
  let route = fresh.route;
  let headStart = 0;
  const tail = carry && carry.length ? carry : null;
  if (tail) {
    const tip = tail[tail.length - 1];
    const first = fresh.route[0];
    if (first && tip.col === first.col && tip.row === first.row) {
      route = [...tail, ...fresh.route.slice(1)];
      // The head resumes ON the tip (not past it) — every step gets walked.
      headStart = tail.length - 1;
    }
  }
  // One steady tick per cell: a long year costs more than a short one. The
  // floor keeps a bare year readable, the cap a crowded one from crawling.
  const cycleMs = Math.min(MAX_CYCLE_MS, Math.max(SNAKE_MIN_MS, route.length * SNAKE_MS_PER_CELL));
  const span = Math.max(1, route.length - 1);
  // Every walk over a green eats it — first visits and revisits alike — so a
  // square that respawned behind the head dies again when walked over. The
  // carried tail ahead of headStart is body layout, never re-walked.
  const coordToKey = new Map<string, string>();
  alive.forEach((c) => coordToKey.set(`${c.col}:${c.row}`, c.key));
  const visitAt = new Map<string, number[]>();
  route.forEach((s, j) => {
    if (j < headStart) return;
    const key = coordToKey.get(`${s.col}:${s.row}`);
    if (!key) return;
    // Timed from the walk's start: the head stands on headStart at t=0, so
    // step j is reached (j - headStart) ticks in — the bite fires under it.
    const t = ((j - headStart) / span) * cycleMs;
    const arr = visitAt.get(key);
    if (arr) arr.push(t);
    else visitAt.set(key, [t]);
  });
  const vanishAt = new Map<string, number>();
  visitAt.forEach((times, key) => vanishAt.set(key, times[0]));
  return { mode: "snake", route, cycleMs, vanishAt, visitAt, headStart };
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

