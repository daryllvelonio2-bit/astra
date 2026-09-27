import { Animated } from "react-native";
import { SNAKE_BODY_PX, SnakePlan } from "./contribPlan";

/**
 * Animated nodes for the snake: one value carries the distance its head has
 * travelled, and every body node looks its own spot on the hunt curve up in a
 * table. So the whole snake is a single native animation that glides along a
 * smooth path — no stepping from square to square, and no per-frame JS.
 */

export interface SnakeSegment {
  /** Top-left of the body box, offset so the box straddles the curve. */
  x: Animated.AnimatedInterpolation<number>;
  y: Animated.AnimatedInterpolation<number>;
  /** Box size in px: fat head, thin tail. */
  size: number;
  /** Head stays solid, the tail fades so you can tell which way it goes. */
  opacity: number;
}

export interface SnakeNodes {
  /** px of hunt the head has covered, 0 -> end. */
  progress: Animated.Value;
  /** Total hunt distance in px, for the driving animation. */
  end: number;
  /** Index 0 is the head; the rest trail behind it along the curve. */
  segments: SnakeSegment[];
  /** Whole-snake opacity, used to fade it out once the hunt is done. */
  fade: Animated.Value;
}

/** px between two body nodes, and how thick the head and the tail are. */
const NODE_PX = 8;
const HEAD_PX = 11.5;
const TAIL_PX = 5.5;
/** Rows in a look-up table: smooth enough to glide, cheap to hand to native. */
const TABLE_ROWS = 240;

export function buildSnakeNodes(plan: SnakePlan): SnakeNodes | null {
  const { path, spacing, length } = plan;
  if (path.length < 3 || length <= 0) return null;

  // Where the curve is once the head has covered `distance`. Clamped at both
  // ends: the body unrolls out of the start of the hunt, and its tail is still
  // trailing in from there when the head has finished.
  const spot = (distance: number): { x: number; y: number } => {
    const at = Math.min(length, Math.max(0, distance)) / spacing;
    const i = Math.min(path.length - 2, Math.floor(at));
    const t = Math.min(1, at - i);
    return {
      x: path[i].x + (path[i + 1].x - path[i].x) * t,
      y: path[i].y + (path[i + 1].y - path[i].y) * t,
    };
  };

  // One shared input range for the whole snake: the nodes differ only in how
  // far back along the curve they sit.
  const stride = Math.max(1, Math.ceil((path.length - 1) / TABLE_ROWS));
  const inputRange: number[] = [];
  for (let i = 0; i < path.length; i += stride) inputRange.push(i * spacing);

  const nodes = Math.max(5, Math.round(SNAKE_BODY_PX / NODE_PX) + 1);
  const progress = new Animated.Value(0);
  const segments: SnakeSegment[] = [];
  for (let k = 0; k < nodes; k++) {
    const back = k * NODE_PX;
    const size = HEAD_PX - (HEAD_PX - TAIL_PX) * (k / (nodes - 1));
    segments.push({
      x: progress.interpolate({ inputRange, outputRange: inputRange.map((d) => spot(d - back).x - size / 2) }),
      y: progress.interpolate({ inputRange, outputRange: inputRange.map((d) => spot(d - back).y - size / 2) }),
      size,
      opacity: k === 0 ? 1 : Math.max(0.34, 0.9 - 0.55 * (k / nodes)),
    });
  }

  return { progress, end: length, segments, fade: new Animated.Value(1) };
}

