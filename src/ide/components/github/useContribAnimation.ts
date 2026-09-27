import React from "react";
import { Animated, Easing } from "react-native";
import {
  ContribCell,
  ContribMode,
  ContribPlan,
  EXIT_MS,
  FADE_MS,
  HOLD_MS,
  REAPPEAR_MS,
  RESPAWN_SPREAD_MS,
  REST_MS,
  buildPlanePlan,
  buildSnakePlan,
  snakeEase,
} from "./contribPlan";
import { SnakeNodes, buildSnakeNodes } from "./contribSnakeAnim";
import { PlaneNodes, bulletFlight, buildPlaneNodes, planeClockSteps } from "./contribPlaneAnim";

/**
 * Runs the contribution-graph animation one cycle at a time: the mode (snake
 * or aircraft) is picked once at random when the graph opens and stays for
 * the whole open; every cycle schedules every square's hit, plays natively,
 * then holds the wiped grid, respawns the squares at random moments and
 * starts over.
 *
 * Everything visual is driven by Animated with the native driver, so the JS
 * thread only wakes up three times per cycle (start, refill, next pick) — the
 * frame rate never depends on React renders.
 */

/** How small a square shrinks while it is being eaten. */
const HIT_SCALE = 0.4;

export interface CellAnim {
  value: Animated.Value;
  scale: Animated.AnimatedInterpolation<number>;
}

export interface ContribAnimationState {
  mode: ContribMode;
  /** Square opacity + scale, keyed by the square's date key. */
  cells: Map<string, CellAnim>;
  snake: SnakeNodes | null;
  plane: PlaneNodes | null;
}

export function useContribAnimation(alive: ContribCell[], cols: number): ContribAnimationState {
  // One value per green square, kept across cycles so the grid never has to
  // rebuild while an animation is playing.
  const cells = React.useMemo(() => {
    const map = new Map<string, CellAnim>();
    alive.forEach((cell) => {
      const value = new Animated.Value(1);
      map.set(cell.key, {
        value,
        scale: value.interpolate({ inputRange: [0, 1], outputRange: [HIT_SCALE, 1] }),
      });
    });
    return map;
  }, [alive]);

  const [nodes, setNodes] = React.useState<Omit<ContribAnimationState, "cells">>({
    mode: "snake",
    snake: null,
    plane: null,
  });
  const [cycle, setCycle] = React.useState(0);
  // One mode per open: picked once at random, kept until the graph unmounts.
  const [mode] = React.useState<ContribMode>(() => (Math.random() < 0.5 ? "snake" : "plane"));
  const live = React.useRef<Animated.CompositeAnimation[]>([]);

  React.useEffect(() => {
    const run = (anim: Animated.CompositeAnimation) => {
      live.current.push(anim);
      anim.start();
    };
    const stopLive = () => {
      live.current.forEach((anim) => anim.stop());
      live.current = [];
    };
    const timers: ReturnType<typeof setTimeout>[] = [];
    stopLive();

    // Nothing to animate without a grid to travel across.
    if (!alive.length || cols < 2) {
      setNodes({ mode: "snake", snake: null, plane: null });
      return;
    }

    const plan: ContribPlan = mode === "snake" ? buildSnakePlan(alive, cols) : buildPlanePlan(alive, cols);
    const snake = plan.mode === "snake" ? buildSnakeNodes(plan) : null;
    const plane = plan.mode === "plane" ? buildPlaneNodes(plan, cols) : null;

    // Each square holds until its scheduled hit, then shrinks away...
    cells.forEach((cell, key) => {
      cell.value.setValue(1);
      run(
        Animated.timing(cell.value, {
          toValue: 0,
          delay: plan.vanishAt.get(key) ?? plan.cycleMs,
          duration: FADE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        })
      );
    });

    if (snake) {
      snake.progress.setValue(0);
      snake.fade.setValue(1);
      run(
        Animated.timing(snake.progress, {
          toValue: snake.end,
          duration: plan.cycleMs,
          // Steady cruise: one cell per tick, like the game.
          easing: snakeEase,
          useNativeDriver: true,
        })
      );
      // Route finished: the snake leaves as the grid refills.
      timers.push(
        setTimeout(
          () => run(Animated.timing(snake.fade, { toValue: 0, duration: EXIT_MS, useNativeDriver: true })),
          plan.cycleMs
        )
      );
    }

    if (plane && plan.mode === "plane") {
      plane.clock.setValue(0);
      run(Animated.sequence(planeClockSteps(plan, plane.clock)));
      plane.bullets.forEach((bullet) => {
        bullet.value.setValue(0);
        run(bulletFlight(bullet));
      });
    }

    // ...the wiped grid holds, then every square respawns at its own random
    // moment inside the respawn window.
    timers.push(
      setTimeout(() => {
        cells.forEach((cell) =>
          run(
            Animated.timing(cell.value, {
              toValue: 1,
              delay: Math.random() * RESPAWN_SPREAD_MS,
              duration: REAPPEAR_MS,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            })
          )
        );
      }, plan.cycleMs + HOLD_MS)
    );
    timers.push(
      setTimeout(
        () => setCycle((c) => c + 1),
        plan.cycleMs + HOLD_MS + RESPAWN_SPREAD_MS + REAPPEAR_MS + REST_MS
      )
    );

    setNodes({ mode, snake, plane });

    return () => {
      timers.forEach(clearTimeout);
      stopLive();
    };
  }, [cells, cols, alive, cycle, mode]);

  return React.useMemo(
    () => ({ mode: nodes.mode, cells, snake: nodes.snake, plane: nodes.plane }),
    [nodes, cells]
  );
}
