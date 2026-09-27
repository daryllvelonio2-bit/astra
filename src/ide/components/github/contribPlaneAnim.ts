import { Animated, Easing } from "react-native";
import { PlanePlan } from "./contribPlan";
import { ShooterShot } from "./contribShooterPlan";

/**
 * Animated nodes for the right-side shooter:
 * The turret sits stationed on the right edge and moves vertically to track
 * rows. Each shot fires a high-speed laser bolt from the turret leftward
 * into the target block. On impact, the block explodes into 4 fragments of
 * that exact color bursting outward diagonally and dissolving.
 *
 * Each shot is driven by a single native Animated.Value (0 -> 2):
 *  - 0 -> 1: laser bolt flies leftward from turretX to targetX
 *  - 1 -> 2: block explosion fragments burst outward and fade to 0
 */

export interface ShotNodes {
  id: string;
  key: string;
  color: string;
  targetX: number;
  targetY: number;
  fireAt: number;
  flightMs: number;
  explosionMs: number;
  value: Animated.Value;
  laserX: Animated.AnimatedInterpolation<number>;
  laserY: number;
  laserOpacity: Animated.AnimatedInterpolation<number>;
  explosionOpacity: Animated.AnimatedInterpolation<number>;
  fragScale: Animated.AnimatedInterpolation<number>;
  frag1X: Animated.AnimatedInterpolation<number>;
  frag1Y: Animated.AnimatedInterpolation<number>;
  frag2X: Animated.AnimatedInterpolation<number>;
  frag2Y: Animated.AnimatedInterpolation<number>;
  frag3X: Animated.AnimatedInterpolation<number>;
  frag3Y: Animated.AnimatedInterpolation<number>;
  frag4X: Animated.AnimatedInterpolation<number>;
  frag4Y: Animated.AnimatedInterpolation<number>;
}

export interface PlaneNodes {
  time: Animated.Value;
  turretX: number;
  turretY: Animated.AnimatedInterpolation<number>;
  shots: ShotNodes[];
}

export function buildPlaneNodes(plan: PlanePlan, _cols: number): PlaneNodes | null {
  if (!plan.shots.length) return null;

  const time = new Animated.Value(0);
  const turretX = plan.turretX;

  // Build smooth continuous keyframes for the jet's vertical tracking
  const timeKeyframes: [number, number][] = [];
  const y0 = plan.shots[0].targetY - 9;
  timeKeyframes.push([0, y0]);

  const AIM_HOLD_MS = 250;

  for (let i = 0; i < plan.shots.length; i++) {
    const curShot = plan.shots[i];
    const curY = curShot.targetY - 9;
    timeKeyframes.push([curShot.fireAt, curY]);

    if (i < plan.shots.length - 1) {
      const nextShot = plan.shots[i + 1];
      const nextY = nextShot.targetY - 9;
      const moveStart = curShot.fireAt + curShot.flightMs + 120;
      const moveEnd = nextShot.fireAt - AIM_HOLD_MS;
      const dt = moveEnd - moveStart;

      if (dt > 80) {
        timeKeyframes.push([moveStart, curY]);
        // Smooth S-curve easing points for slow, gradual glide to the next target
        timeKeyframes.push([moveStart + dt * 0.25, curY + (nextY - curY) * 0.156]);
        timeKeyframes.push([moveStart + dt * 0.50, curY + (nextY - curY) * 0.500]);
        timeKeyframes.push([moveStart + dt * 0.75, curY + (nextY - curY) * 0.844]);
        timeKeyframes.push([moveEnd, nextY]);
      }
    }
  }
  timeKeyframes.push([plan.cycleMs, plan.shots[plan.shots.length - 1].targetY - 9]);

  // Deduplicate and filter any non-strictly-increasing timestamps
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (const [t, y] of timeKeyframes) {
    if (inputRange.length > 0 && t <= inputRange[inputRange.length - 1]) {
      continue;
    }
    inputRange.push(t);
    outputRange.push(y);
  }

  const turretY = time.interpolate({
    inputRange,
    outputRange,
  });

  const shots: ShotNodes[] = plan.shots.map((shot: ShooterShot) => {
    const duration = shot.flightMs + shot.explosionMs;
    const value = new Animated.Value(0);
    const muzzleX = turretX - 16;

    // Laser bolt translates leftward from muzzleX to targetX
    const laserX = value.interpolate({
      inputRange: [0, shot.flightMs, duration],
      outputRange: [muzzleX, shot.targetX - 2, shot.targetX - 2],
    });

    const laserOpacity = value.interpolate({
      inputRange: [0, 8, shot.flightMs - 4, shot.flightMs, duration],
      outputRange: [0, 1, 1, 0, 0],
    });

    // Block explosion: starts when bullet impacts (value >= flightMs)
    const explosionOpacity = value.interpolate({
      inputRange: [0, shot.flightMs, shot.flightMs + 16, shot.flightMs + shot.explosionMs * 0.7, duration],
      outputRange: [0, 0, 1, 0.6, 0],
    });

    const fragScale = value.interpolate({
      inputRange: [0, shot.flightMs, shot.flightMs + 24, duration],
      outputRange: [0, 1, 1.15, 0.2],
    });

    const SPREAD = 9;
    // 4 fragments bursting outward diagonally:
    // Frag 1 (top-left): -X, -Y
    const frag1X = value.interpolate({ inputRange: [0, shot.flightMs, duration], outputRange: [0, 0, -SPREAD] });
    const frag1Y = value.interpolate({ inputRange: [0, shot.flightMs, duration], outputRange: [0, 0, -SPREAD] });
    // Frag 2 (top-right): +X, -Y
    const frag2X = value.interpolate({ inputRange: [0, shot.flightMs, duration], outputRange: [0, 0, +SPREAD] });
    const frag2Y = value.interpolate({ inputRange: [0, shot.flightMs, duration], outputRange: [0, 0, -SPREAD] });
    // Frag 3 (bottom-left): -X, +Y
    const frag3X = value.interpolate({ inputRange: [0, shot.flightMs, duration], outputRange: [0, 0, -SPREAD] });
    const frag3Y = value.interpolate({ inputRange: [0, shot.flightMs, duration], outputRange: [0, 0, +SPREAD] });
    // Frag 4 (bottom-right): +X, +Y
    const frag4X = value.interpolate({ inputRange: [0, shot.flightMs, duration], outputRange: [0, 0, +SPREAD] });
    const frag4Y = value.interpolate({ inputRange: [0, shot.flightMs, duration], outputRange: [0, 0, +SPREAD] });

    return {
      id: shot.id,
      key: shot.key,
      color: shot.color,
      targetX: shot.targetX,
      targetY: shot.targetY,
      fireAt: shot.fireAt,
      flightMs: shot.flightMs,
      explosionMs: shot.explosionMs,
      value,
      laserX,
      laserY: shot.targetY - 1.5,
      laserOpacity,
      explosionOpacity,
      fragScale,
      frag1X,
      frag1Y,
      frag2X,
      frag2Y,
      frag3X,
      frag3Y,
      frag4X,
      frag4Y,
    };
  });

  return { time, turretX, turretY, shots };
}

/** Drives the turret along the right edge: smoothly and slowly glides to each target. */
export function turretMotion(plane: PlaneNodes, plan: PlanePlan): Animated.CompositeAnimation {
  return Animated.timing(plane.time, {
    toValue: plan.cycleMs,
    duration: plan.cycleMs,
    easing: Easing.linear,
    useNativeDriver: true,
  });
}

/** Drives one shot: fast laser flight (0 -> flightMs) then block explosion (flightMs -> duration). */
export function shotFlight(shot: ShotNodes): Animated.CompositeAnimation {
  const duration = shot.flightMs + shot.explosionMs;
  return Animated.timing(shot.value, {
    toValue: duration,
    delay: shot.fireAt,
    duration,
    easing: Easing.linear,
    useNativeDriver: true,
  });
}
