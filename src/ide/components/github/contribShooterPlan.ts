import {
  CELL,
  ContribCell,
  GAP,
  ROWS,
  SKY,
  cellCenterX,
  gridWidth,
  rowCenterY,
} from "./contribPlan";

/** Dedicated space on the right edge of the grid for the shooter turret. */
export const SHOOTER_SPACE = 24;
/** Flight duration for a laser bolt from the turret to a target. */
export const LASER_FLIGHT_MS = 140;
/** Duration of the block fragment explosion. */
export const EXPLOSION_MS = 240;
/** Gap between consecutive shots fired by the turret. */
const SHOT_GAP_MS = 360;
/** Maximum targets engaged in one shooting round. */
const MAX_ROUND_TARGETS = 24;

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
}

export interface ShooterPlan {
  mode: "plane";
  shots: ShooterShot[];
  cycleMs: number;
  vanishAt: Map<string, number>;
  turretX: number;
}

/**
 * Plans a shooting round: the turret sits stationed on the right edge and
 * fires lasers leftward at green blocks. Targets are chosen from right (newest)
 * to left, with varied rows so the turret slides vertically between shots.
 */
export function buildShooterPlan(alive: ContribCell[], cols: number): ShooterPlan {
  if (!alive.length) {
    return { mode: "plane", shots: [], cycleMs: 1200, vanishAt: new Map(), turretX: 0 };
  }

  const width = gridWidth(cols);
  const turretX = width + 4;

  // Pick up to MAX_ROUND_TARGETS, starting from the rightmost columns (in view)
  // and interleave rows for dynamic vertical aiming motion.
  const pool = [...alive].sort((a, b) => b.col - a.col || ((a.row * 3) % ROWS) - ((b.row * 3) % ROWS));
  const targets = pool.slice(0, Math.min(MAX_ROUND_TARGETS, pool.length));

  const shots: ShooterShot[] = [];
  const vanishAt = new Map<string, number>();
  let t = 200; // initial delay for turret to align

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
    });

    vanishAt.set(target.key, landAt);
    t += SHOT_GAP_MS;
  });

  return {
    mode: "plane",
    shots,
    cycleMs: Math.max(1200, t + 600),
    vanishAt,
    turretX,
  };
}
