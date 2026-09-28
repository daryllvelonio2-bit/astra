/**
 * Pure planning for the contribution-graph animations: grid geometry, the
 * snake's route through the squares, the aircraft's strafing passes and the
 * exact instant each green square dies. No React and no Animated in here — the
 * visual layers only replay these numbers, which keeps the schedule readable
 * and keeps per-frame work out of the render path.
 */

import { ShooterPlan, buildShooterPlan } from "./contribShooterPlan";
import {
  CELL,
  CELL_STEP,
  GAP,
  PLANE_BOX,
  ROWS,
  SKY,
  type ContribCell,
  type ContribPoint,
} from "./contribGrid";

/** Grid geometry + base cell types live in ./contribGrid (leaf module, no cycle). Re-exported here so existing imports keep working. */
export {
  BULLET_H,
  BULLET_W,
  CELL,
  CELL_STEP,
  GAP,
  JET_H,
  JET_W,
  PLANE_BOX,
  ROWS,
  SKY,
  cellCenterX,
  gridWidth,
  muzzleY,
  planeTop,
  rowCenterY,
} from "./contribGrid";
export type { ContribCell, ContribPoint } from "./contribGrid";

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
/** Longest a single animation may run: multi-batch hunts cruise for minutes. */
const MAX_CYCLE_MS = ms(600000);
/** Cruise pace: one deliberate tick per block of the hunt (220ms effective). */
const SNAKE_MS_PER_CELL = ms(220);
/** Full grid sweeps chained into one hunt: fewer handoffs, fewer visible stops. */
const HUNT_BATCHES = 3;
const SNAKE_MIN_MS = ms(1300);
/** Classic arcade body: head plus this many trailing segments, in cells. */
export const SNAKE_BODY_CELLS = 6;
/** Strafing pass bounds, and the budget all passes share. */
const PASS_MIN_MS = ms(900);
const PASS_MAX_MS = ms(1400);
const PLANE_BUDGET_MS = ms(5200);

export type ContribMode = "snake" | "plane";

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

export type PlanePlan = ShooterPlan;
export const buildPlanePlan = buildShooterPlan;

export type ContribPlan = SnakePlan | PlanePlan;

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
  prev: SnakeStep | null,
  target: ContribPoint,
  occupied: Set<string>,
  tail: SnakeStep | null,
  c0: number,
  c1: number
): SnakeStep {
  const key = (c: number, r: number): string => `${c}:${r}`;
  const neckKey = prev ? key(prev.col, prev.row) : null;
  const targetKey = key(target.col, target.row);
  if (key(head.col, head.row) === targetKey) return head;

  // Shortest path to target: treat body squares and neck as impassable walls.
  // Target cannot be entered if it is currently occupied or our neck.
  const queue: SnakeStep[] = [{ col: head.col, row: head.row }];
  const prevMap = new Map<string, SnakeStep | null>();
  prevMap.set(key(head.col, head.row), null);

  let found = false;
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    if (key(cur.col, cur.row) === targetKey && targetKey !== neckKey && !occupied.has(targetKey)) {
      found = true;
      break;
    }
    for (const [dc, dr] of DIRS) {
      const nc = cur.col + dc;
      const nr = cur.row + dr;
      if (nc < c0 || nc > c1 || nr < 0 || nr >= ROWS) continue;
      const k = key(nc, nr);
      if (prevMap.has(k) || k === neckKey || occupied.has(k)) continue;
      prevMap.set(k, cur);
      queue.push({ col: nc, row: nr });
    }
  }

  if (found) {
    let node = target;
    let p = prevMap.get(key(node.col, node.row));
    while (p && (p.col !== head.col || p.row !== head.row)) {
      node = p;
      p = prevMap.get(key(node.col, node.row));
    }
    if (node) return node;
  }

  // Fallback 1: free in-bounds neighbor that is not neck and not occupied, closest to target.
  let best: SnakeStep | null = null;
  let bestDist = Infinity;
  for (const [dc, dr] of DIRS) {
    const nc = head.col + dc;
    const nr = head.row + dr;
    if (nc < c0 || nc > c1 || nr < 0 || nr >= ROWS) continue;
    const k = key(nc, nr);
    if (k === neckKey || occupied.has(k)) continue;
    const d = Math.abs(target.col - nc) + Math.abs(target.row - nr);
    if (d < bestDist) {
      bestDist = d;
      best = { col: nc, row: nr };
    }
  }
  if (best) return best;

  // Fallback 2: escape onto tail tip if adjacent (tail vacates as head arrives).
  if (
    tail &&
    Math.abs(tail.col - head.col) + Math.abs(tail.row - head.row) === 1 &&
    key(tail.col, tail.row) !== neckKey &&
    tail.col >= c0 &&
    tail.col <= c1 &&
    tail.row >= 0 &&
    tail.row < ROWS
  ) {
    return { col: tail.col, row: tail.row };
  }

  // Fallback 3: any in-bounds neighbor that is NOT neck (never reverse 180° into body).
  for (const [dc, dr] of DIRS) {
    const nc = head.col + dc;
    const nr = head.row + dr;
    if (nc < c0 || nc > c1 || nr < 0 || nr >= ROWS) continue;
    const k = key(nc, nr);
    if (k === neckKey) continue;
    return { col: nc, row: nr };
  }

  return head;
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
): { route: SnakeStep[]; carried: number; eats: Array<{ stepIndex: number; key: string }> } {
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
  const eats: Array<{ stepIndex: number; key: string }> = [];
  // Squares eaten so far (the start square dies under the head at t=0).
  const eaten = new Set<string>([at(head)]);
  eats.push({ stepIndex: route.length - 1, key: first.key });
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

    // Pick a waypoint if target is too close (< 10 steps) to guarantee 2-4 seconds (no less than 2s)
    const directDist = Math.abs(head.col - target.col) + Math.abs(head.row - target.row);
    let waypoint: SnakeStep | null = null;
    if (directDist < 10) {
      const needed = 11 + Math.floor(Math.random() * 4);
      const offset = Math.max(2, Math.ceil(needed / 2));
      const candWps: SnakeStep[] = [
        { col: Math.min(c1, Math.max(c0, head.col + offset)), row: Math.max(0, Math.min(6, head.row + 2)) },
        { col: Math.min(c1, Math.max(c0, head.col - offset)), row: Math.max(0, Math.min(6, head.row - 2)) },
        { col: Math.min(c1, Math.max(c0, head.col + offset)), row: head.row },
        { col: Math.min(c1, Math.max(c0, head.col - offset)), row: head.row },
      ];
      for (const wp of candWps) {
        if (wp.col !== target.col || wp.row !== target.row) {
          waypoint = wp;
          break;
        }
      }
    }

    let activeDest = waypoint || target;
    let reachedWaypoint = !waypoint;
    let legCount = 0;

    while (legCount < 60 && route.length < maxSteps) {
      legCount++;
      const occupied = new Set<string>();
      for (let k = Math.max(0, route.length - SNAKE_BODY_CELLS); k < route.length; k++) {
        occupied.add(`${route[k].col}:${route[k].row}`);
      }

      // Block all other uneaten greens so snake never steps on/eats multiple colors
      for (let m = 0; m < lunch.length; m++) {
        const lk = at(lunch[m]);
        if (!eaten.has(lk)) {
          if (!reachedWaypoint || lk !== at(target)) {
            occupied.add(lk);
          }
        }
      }

      const tailTip = route.length >= SNAKE_BODY_CELLS + 1 ? route[route.length - SNAKE_BODY_CELLS - 1] : null;
      const prev = route.length >= 2 ? route[route.length - 2] : null;
      head = nextStep(head, prev, activeDest, occupied, tailTip, c0, c1);
      route.push(head);

      if (!reachedWaypoint && ((waypoint && head.col === waypoint.col && head.row === waypoint.row) || legCount >= 8)) {
        reachedWaypoint = true;
        activeDest = target;
      }

      if (reachedWaypoint && head.col === target.col && head.row === target.row) {
        eaten.add(at(head));
        eats.push({ stepIndex: route.length - 1, key: target.key });
        next++;
        break;
      }
    }

    if (legCount >= 60 && !eaten.has(at(target))) {
      eaten.add(at(target));
      next++;
    }
  }
  return { route, carried: joint && tail ? tail.length : 0, eats };
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
  // Long hunts, few handoffs: each hunt chains several full batches, so the
  // visible stop-and-swap happens every few minutes, not every minute. Every
  // batch starts where the last ended; only the first lays the carried tail.
  const route: SnakeStep[] = [];
  const allEats: Array<{ stepIndex: number; key: string }> = [];
  let headStart = 0;
  let curStart = start;
  let curCarry = carry && carry.length ? carry : [];
  for (let b = 0; b < HUNT_BATCHES; b++) {
    const lunch = huntOrder(alive, curStart);
    const seg = buildRoute(lunch, c0, c1, curCarry);
    const offset = route.length === 0 ? 0 : route.length - seg.carried;
    seg.eats.forEach((e) => {
      allEats.push({ stepIndex: e.stepIndex + offset, key: e.key });
    });
    // The segment re-lays its carry up front — keep those cells once.
    route.push(...(route.length === 0 ? seg.route : seg.route.slice(seg.carried)));
    if (b === 0) headStart = seg.carried > 0 ? seg.carried - 1 : 0;
    const end = seg.route[seg.route.length - 1];
    curStart = { col: end.col, row: end.row };
    curCarry = seg.route.slice(-(SNAKE_BODY_CELLS + 1));
  }
  // One steady tick per cell: a long year costs more than a short one. The
  // floor keeps a bare year readable, the cap a crowded one from crawling.
  const cycleMs = Math.min(MAX_CYCLE_MS, Math.max(SNAKE_MIN_MS, route.length * SNAKE_MS_PER_CELL));
  const span = Math.max(1, route.length - 1);
  // Only intentional target hits eat squares (1 color per 2-4 seconds)
  const visitAt = new Map<string, number[]>();
  allEats.forEach(({ stepIndex, key }) => {
    if (stepIndex < headStart) return;
    const t = ((stepIndex - headStart) / span) * cycleMs;
    const arr = visitAt.get(key);
    if (arr) arr.push(t);
    else visitAt.set(key, [t]);
  });
  const vanishAt = new Map<string, number>();
  visitAt.forEach((times, key) => vanishAt.set(key, times[0]));
  return { mode: "snake", route, cycleMs, vanishAt, visitAt, headStart };
}

