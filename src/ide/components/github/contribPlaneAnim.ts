import { Animated, Easing } from "react-native";
import { PlanePlan } from "./contribPlan";
import { ShooterShot } from "./contribShooterPlan";
import { BULLET_H, BULLET_W, JET_W, muzzleY } from "./contribGrid";

/**
 * Animated nodes for the jet pass:
 * The jet flies in the sky lane above the grid and slides horizontally to
 * hover over each target column. Every shot drops a bolt from its belly
 * straight down onto the target block, which then explodes into 4 fragments
 * of that exact color bursting outward diagonally and dissolving.
 *
 * Each shot is driven by a single native Animated.Value (0 -> duration):
 *  - 0 -> flightMs: bolt falls from the belly (muzzleY) onto the square
 *  - flightMs -> duration: the block's fragments burst outward and fade to 0
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
  /** Bolt's travel: from the jet's belly down onto the target square. */
  boltX: Animated.AnimatedInterpolation<number>;
  boltY: Animated.AnimatedInterpolation<number>;
  boltOpacity: Animated.AnimatedInterpolation<number>;
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
  /** Horizontal glide from one target column to the next. */
  turretX: Animated.AnimatedInterpolation<number>;
  /** Constant: the jet stays up in the sky lane, clear of the squares. */
  turretY: number;
  shots: ShotNodes[];
}

export function buildPlaneNodes(plan: PlanePlan, _cols: number): PlaneNodes | null {
  if (!plan.shots.length) return null;

  const time = new Animated.Value(0);

  // Keyframes for the jet's horizontal glide, mirroring the hip between shots:
  // hold over the target while firing, then ease across to the next column.
  const xKeyframes: [number, number][] = [];
  xKeyframes.push([0, plan.shots[0].jetX]);

  const AIM_HOLD_MS = 250;

  for (let i = 0; i < plan.shots.length; i++) {
    const curShot = plan.shots[i];
    xKeyframes.push([curShot.fireAt, curShot.jetX]);

    if (i < plan.shots.length - 1) {
      const nextShot = plan.shots[i + 1];
      const moveStart = curShot.fireAt + curShot.flightMs + 120;
      const moveEnd = nextShot.fireAt - AIM_HOLD_MS;
      const dt = moveEnd - moveStart;

      if (dt > 80) {
        xKeyframes.push([moveStart, curShot.jetX]);
        // Smooth S-curve easing points for slow, gradual glide to the next target
        xKeyframes.push([moveStart + dt * 0.25, curShot.jetX + (nextShot.jetX - curShot.jetX) * 0.156]);
        xKeyframes.push([moveStart + dt * 0.50, curShot.jetX + (nextShot.jetX - curShot.jetX) * 0.500]);
        xKeyframes.push([moveStart + dt * 0.75, curShot.jetX + (nextShot.jetX - curShot.jetX) * 0.844]);
        xKeyframes.push([moveEnd, nextShot.jetX]);
      }
    }
  }
  xKeyframes.push([plan.cycleMs, plan.shots[plan.shots.length - 1].jetX]);

  // Deduplicate and filter any non-strictly-increasing timestamps
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (const [t, x] of xKeyframes) {
    if (inputRange.length > 0 && t <= inputRange[inputRange.length - 1]) {
      continue;
    }
    inputRange.push(t);
    outputRange.push(x);
  }

  const turretX = time.interpolate({ inputRange, outputRange });

  const shots: ShotNodes[] = plan.shots.map((shot: ShooterShot) => {
    const duration = shot.flightMs + shot.explosionMs;
    const value = new Animated.Value(0);

    // Bolt leaves the jet's belly (centred on the jet, at the top edge of the
    // grid) and lands centred on the target square. Both ends are exact, so a
    // hit always lands on the block that gets destroyed.
    const muzzleX = shot.jetX + JET_W / 2 - BULLET_W / 2;
    const muzzleTop = muzzleY() - BULLET_H;
    const impactX = shot.targetX - BULLET_W / 2;
    const impactTop = shot.targetY - BULLET_H / 2;

    const boltX = value.interpolate({
      inputRange: [0, shot.flightMs, duration],
      outputRange: [muzzleX, impactX, impactX],
    });
    const boltY = value.interpolate({
      inputRange: [0, shot.flightMs, duration],
      outputRange: [muzzleTop, impactTop, impactTop],
    });

    const boltOpacity = value.interpolate({
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
      boltX,
      boltY,
      boltOpacity,
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

  return { time, turretX, turretY: plan.hoverY, shots };
}

/** Drives the jet along the sky lane: it holds over each target, then glides across. */
export function turretMotion(plane: PlaneNodes, plan: PlanePlan): Animated.CompositeAnimation {
  return Animated.timing(plane.time, {
    toValue: plan.cycleMs,
    duration: plan.cycleMs,
    easing: Easing.linear,
    useNativeDriver: true,
  });
}

/** Drives one shot: fast bolt drop (0 -> flightMs) then block explosion. */
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
