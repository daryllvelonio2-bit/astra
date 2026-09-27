import { Animated } from "react-native";
import { CELL, SNAKE_BODY_CELLS, SnakePlan, SnakeStep, cellCenterX, rowCenterY } from "./contribPlan";

/**
 * Animated nodes for the classic snake: one value walks the head's route cell
 * by cell (0 -> last step), and each body segment replays where the head was a
 * whole number of cells ago — exactly how the game trails its tail. One
 * running animation, one steady easing, no per-frame JS.
 */

export interface SnakeSegment {
  x: Animated.AnimatedInterpolation<number>;
  y: Animated.AnimatedInterpolation<number>;
}

export interface SnakeNodes {
  /** Route step of the head, 0 -> end. */
  progress: Animated.Value;
  /** Steps the head walks, for the driving animation. */
  end: number;
  /** Index 0 is the head; each next segment trails one cell behind. */
  segments: SnakeSegment[];
  /** Whole-snake opacity, used to fade it out once the route is done. */
  fade: Animated.Value;
}

export function buildSnakeNodes(plan: SnakePlan): SnakeNodes | null {
  const route = plan.route;
  if (route.length < 2) return null;

  const progress = new Animated.Value(plan.headStart);
  const inputRange = route.map((_, i) => i);
  const left = (step: SnakeStep): number => cellCenterX(step.col) - CELL / 2;
  const top = (step: SnakeStep): number => rowCenterY(step.row) - CELL / 2;

  const segments: SnakeSegment[] = [];
  for (let k = 0; k <= SNAKE_BODY_CELLS; k++) {
    // Segment k sits where the head was k cells ago; before the head has
    // walked that far it stacks on the first cell, so the tail unrolls.
    segments.push({
      x: progress.interpolate({ inputRange, outputRange: route.map((_, j) => left(route[Math.max(0, j - k)])) }),
      y: progress.interpolate({ inputRange, outputRange: route.map((_, j) => top(route[Math.max(0, j - k)])) }),
    });
  }

  return { progress, end: route.length - 1, segments, fade: new Animated.Value(1) };
}

