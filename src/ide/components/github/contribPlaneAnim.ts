import { Animated, Easing } from "react-native";
import {
  BULLET_FLIGHT_MS,
  BULLET_W,
  PLANE_BOX,
  PlanePlan,
  cellCenterX,
  gridWidth,
  planeTop,
} from "./contribPlan";

/**
 * Animated nodes for the aircraft: one value is the flight clock (one step per
 * pass) and a sawtooth interpolation turns it into the position across the
 * grid, wrapping back to the right while the plane is out of sight. Each shot
 * gets its own tracer view whose drop distance and fade both read off a single
 * value, so a whole strafing run is native-driven with no sequencing.
 */

export interface BulletNodes {
  id: string;
  /** Left edge of the tracer — the square's centre line. */
  x: number;
  /** Pixels dropped (translateY) by the time the shot lands. */
  fall: number;
  /** Muzzle time, ms after cycle start. */
  fireAt: number;
  value: Animated.Value;
  /** translateY derived from `value`. */
  travel: Animated.AnimatedInterpolation<number>;
  /** Invisible before the muzzle moment and after the hit. */
  opacity: Animated.AnimatedInterpolation<number>;
}

export interface PlaneNodes {
  /** 0 -> one step per pass. */
  clock: Animated.Value;
  /** Position across the grid, in pixels. */
  x: Animated.AnimatedInterpolation<number>;
  y: number;
  bullets: BulletNodes[];
}

/** Most tracers fired in one animation — a fully green year stays smooth. */
const MAX_BULLETS = 120;

export function buildPlaneNodes(plan: PlanePlan, cols: number): PlaneNodes | null {
  if (!plan.passes.length) return null;

  const width = gridWidth(cols);
  const right = width; // just off the right edge
  const left = -PLANE_BOX; // just off the left edge

  const inputRange: number[] = [0];
  const outputRange: number[] = [right];
  plan.passes.forEach((_, i) => {
    inputRange.push(i + 1);
    outputRange.push(left);
    if (i < plan.passes.length - 1) {
      // 1/1000 of a pass: a wrap the eye can never catch, out of sight.
      inputRange.push(i + 1 + 0.001);
      outputRange.push(right);
    }
  });

  const clock = new Animated.Value(0);
  const stride = Math.max(1, Math.ceil(plan.shots.length / MAX_BULLETS));
  const bullets: BulletNodes[] = [];
  plan.shots.forEach((shot, i) => {
    if (i % stride) return;
    const value = new Animated.Value(0);
    bullets.push({
      id: shot.key,
      x: cellCenterX(shot.col) - BULLET_W / 2,
      fall: shot.fall,
      fireAt: shot.fireAt,
      value,
      travel: value.interpolate({ inputRange: [0, 1], outputRange: [0, shot.fall] }),
      opacity: value.interpolate({ inputRange: [0, 0.01, 0.8, 1], outputRange: [0, 1, 1, 0] }),
    });
  });

  return { clock, x: clock.interpolate({ inputRange, outputRange }), y: planeTop(), bullets };
}

/** One crossing per pass, holding still (out of sight) between passes. */
export function planeClockSteps(plan: PlanePlan, clock: Animated.Value): Animated.CompositeAnimation[] {
  const steps: Animated.CompositeAnimation[] = [];
  plan.passes.forEach((pass, i) => {
    steps.push(
      Animated.timing(clock, {
        toValue: i + 1,
        duration: pass.duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const next = plan.passes[i + 1];
    if (next) steps.push(Animated.delay(Math.max(0, next.start - (pass.start + pass.duration))));
  });
  return steps;
}

export const bulletFlight = (bullet: BulletNodes): Animated.CompositeAnimation =>
  Animated.timing(bullet.value, {
    toValue: 1,
    delay: bullet.fireAt,
    duration: BULLET_FLIGHT_MS,
    easing: Easing.linear,
    useNativeDriver: true,
  });
