import { Animated } from "react-native";
import { CELL, SnakePlan, cellCenterX, rowCenterY } from "./contribPlan";

/**
 * Animated nodes for the snake: one value walks the route (0 -> last square)
 * and every body segment reads its position out of it by interpolation, so a
 * whole snake costs a single running animation and no per-frame JS.
 */

export interface SnakeSegment {
  x: Animated.AnimatedInterpolation<number>;
  y: Animated.AnimatedInterpolation<number>;
}

export interface SnakeNodes {
  /** Route index of the head, 0 -> end. */
  progress: Animated.Value;
  /** Travel distance the head covers, for the driving animation. */
  end: number;
  /** Index 0 is the head; the rest trails one square behind each. */
  segments: SnakeSegment[];
  /** Whole-snake opacity, used to fade it out once the route is done. */
  fade: Animated.Value;
}

/** Body squares behind the head. */
const BODY = 8;

export function buildSnakeNodes(plan: SnakePlan): SnakeNodes | null {
  const route = plan.route;
  if (route.length < 2) return null;

  const progress = new Animated.Value(0);
  const fade = new Animated.Value(1);
  const inputRange = route.map((_, i) => i);
  const xs = route.map((p) => cellCenterX(p.col) - CELL / 2);
  const ys = route.map((p) => rowCenterY(p.row) - CELL / 2);
  const body = Math.min(BODY, Math.max(3, Math.floor(route.length / 6)));

  const segments: SnakeSegment[] = [];
  for (let k = 0; k <= body; k++) {
    // The segment k squares behind the head sits where the head was k steps
    // ago; before the head has travelled that far it stacks on the first
    // square, so the tail simply unrolls as the snake moves.
    const tailX = xs.map((_, j) => xs[Math.max(0, j - k)]);
    const tailY = ys.map((_, j) => ys[Math.max(0, j - k)]);
    segments.push({
      x: progress.interpolate({ inputRange, outputRange: tailX }),
      y: progress.interpolate({ inputRange, outputRange: tailY }),
    });
  }

  return { progress, end: route.length - 1, segments, fade };
}
