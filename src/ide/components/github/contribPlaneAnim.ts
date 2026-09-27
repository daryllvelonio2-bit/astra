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
  clock: Animated.Value;
  turretX: number;
  turretY: Animated.AnimatedInterpolation<number>;
  shots: ShotNodes[];
}

export function buildPlaneNodes(plan: PlanePlan, _cols: number): PlaneNodes | null {
  if (!plan.shots.length) return null;

  const clock = new Animated.Value(0);
  const turretX = plan.turretX;

  // Turret Y clock: steps smoothly between the target row positions
  const clockInput: number[] = [0];
  const clockOutput: number[] = [plan.shots[0].targetY - 8];
  plan.shots.forEach((shot, i) => {
    clockInput.push(i + 1);
    clockOutput.push(shot.targetY - 8);
  });

  const turretY = clock.interpolate({
    inputRange: clockInput,
    outputRange: clockOutput,
  });

  const shots: ShotNodes[] = plan.shots.map((shot: ShooterShot) => {
    const value = new Animated.Value(0);
    const muzzleX = turretX - 6;

    // Laser bolt translates leftward from muzzleX to targetX
    const laserX = value.interpolate({
      inputRange: [0, 1, 2],
      outputRange: [muzzleX, shot.targetX, shot.targetX],
    });

    const laserOpacity = value.interpolate({
      inputRange: [0, 0.05, 0.95, 1, 2],
      outputRange: [0, 1, 1, 0, 0],
    });

    // Block explosion: starts when bullet impacts (value >= 1)
    const explosionOpacity = value.interpolate({
      inputRange: [0, 1, 1.05, 1.7, 2],
      outputRange: [0, 0, 1, 0.6, 0],
    });

    const fragScale = value.interpolate({
      inputRange: [0, 1, 1.1, 2],
      outputRange: [0, 1, 1.1, 0.25],
    });

    const SPREAD = 8;
    // 4 fragments bursting outward diagonally:
    // Frag 1 (top-left): -X, -Y
    const frag1X = value.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0, -SPREAD] });
    const frag1Y = value.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0, -SPREAD] });
    // Frag 2 (top-right): +X, -Y
    const frag2X = value.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0, +SPREAD] });
    const frag2Y = value.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0, -SPREAD] });
    // Frag 3 (bottom-left): -X, +Y
    const frag3X = value.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0, -SPREAD] });
    const frag3Y = value.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0, +SPREAD] });
    // Frag 4 (bottom-right): +X, +Y
    const frag4X = value.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0, +SPREAD] });
    const frag4Y = value.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0, +SPREAD] });

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

  return { clock, turretX, turretY, shots };
}

/** Slides the turret between target rows before each shot. */
export function planeClockSteps(plan: PlanePlan, clock: Animated.Value): Animated.CompositeAnimation[] {
  const steps: Animated.CompositeAnimation[] = [];
  let prevFire = 0;

  plan.shots.forEach((shot, i) => {
    const delay = Math.max(0, shot.fireAt - 80 - prevFire);
    if (delay > 0) steps.push(Animated.delay(delay));
    steps.push(
      Animated.timing(clock, {
        toValue: i + 1,
        duration: 80,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    prevFire = shot.fireAt;
  });

  return steps.length ? steps : [Animated.delay(100)];
}

/** Drives one shot: laser flight (0 -> 1) then block explosion (1 -> 2). */
export function shotFlight(shot: ShotNodes): Animated.CompositeAnimation {
  return Animated.timing(shot.value, {
    toValue: 2,
    delay: shot.fireAt,
    duration: shot.flightMs + shot.explosionMs,
    easing: Easing.linear,
    useNativeDriver: true,
  });
}
