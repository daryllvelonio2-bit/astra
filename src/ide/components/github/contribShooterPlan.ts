import {
  ContribCell,
  ROWS,
  cellCenterX,
  gridWidth,
  rowCenterY,
} from "./contribGrid";

/** Dedicated space on the right edge of the grid for the shooter turret. */
export const SHOOTER_SPACE = 24;
/** Flight duration for a laser bolt from the turret to a target (fast by default). */
export const LASER_FLIGHT_MS = 130;
/** Duration of the block fragment explosion. */
export const EXPLOSION_MS = 220;
/** Gap between consecutive shots fired by the turret (1 shot per 2 seconds). */
const SHOT_GAP_MS = 2000;
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

  // Pick up to MAX_ROUND_TARGETS, prioritizing recent weeks (right side in view)
  // and smoothly connecting rows so the turret glides naturally between nearby targets.
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
  let t = 350; // initial delay for turret to smoothly aim before the first shot

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
    cycleMs: Math.max(1200, t + 400),
    vanishAt,
    turretX,
  };
}
