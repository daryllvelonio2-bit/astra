import React from "react";
import { Animated, Easing } from "react-native";
import {
  ContribCell,
  ContribMode,
  ContribPlan,
  EXIT_MS,
  FADE_MS,
  REAPPEAR_MS,
  RESPAWN_MAX_MS,
  RESPAWN_MIN_MS,
  buildPlanePlan,
  buildSnakePlan,
  snakeEase,
} from "./contribPlan";
import { SnakeNodes, buildSnakeNodes } from "./contribSnakeAnim";
import { PlaneNodes, bulletFlight, buildPlaneNodes, planeClockSteps } from "./contribPlaneAnim";

/**
 * Runs the contribution-graph animation as one endless loop: the mode (snake
 * or aircraft) is picked once at random when the graph opens and stays for
 * the whole open. Every hunt schedules every square's hit, then each eaten
 * square fades back on its own after a random dark spell — the grid breathes
 * continuously, never wipes, and hunts chain with no reset between them. A
 * newer animation for a square always stops its older one, so nothing ever
 * fights over a value.
 *
 * Everything visual is driven by Animated with the native driver, so the JS
 * thread only wakes to schedule hunts and respawns — the frame rate never
 * depends on React renders.
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
  // One mode per open: picked once at random, kept until the graph unmounts.
  const [mode] = React.useState<ContribMode>(() => (Math.random() < 0.5 ? "snake" : "plane"));

  React.useEffect(() => {
    let unmounted = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Latest animation per square: a newer hunt stops the older one, and a
    // respawn only fires when nothing newer took the square meanwhile.
    const perCell = new Map<string, Animated.CompositeAnimation>();
    // Route/sprite animations of the running hunt: replaced every hunt.
    let cycleAnims: Animated.CompositeAnimation[] = [];
    const stopCycle = () => {
      cycleAnims.forEach((anim) => anim.stop());
      cycleAnims = [];
    };
    const track = (anim: Animated.CompositeAnimation): void => {
      cycleAnims.push(anim);
      anim.start();
    };

    // Nothing to animate without a grid to travel across.
    if (!alive.length || cols < 2) {
      setNodes({ mode: "snake", snake: null, plane: null });
      return;
    }

    let firstHunt = true;
    const runHunt = () => {
      if (unmounted) return;
      stopCycle();
      const plan: ContribPlan =
        mode === "snake" ? buildSnakePlan(alive, cols) : buildPlanePlan(alive, cols);
      const snake = plan.mode === "snake" ? buildSnakeNodes(plan) : null;
      const plane = plan.mode === "plane" ? buildPlaneNodes(plan, cols) : null;

      // Each square falls at its scheduled hit, then fades back on its own
      // after a random dark spell — even across hunt boundaries, so the grid
      // never wipes and never refills all at once.
      cells.forEach((cell, key) => {
        perCell.get(key)?.stop();
        const hitAt = plan.vanishAt.get(key) ?? plan.cycleMs;
        const bite = Animated.timing(cell.value, {
          toValue: 0,
          delay: hitAt,
          duration: FADE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        });
        perCell.set(key, bite);
        bite.start();
        const darkFor = RESPAWN_MIN_MS + Math.random() * (RESPAWN_MAX_MS - RESPAWN_MIN_MS);
        timers.push(
          setTimeout(() => {
            if (unmounted || perCell.get(key) !== bite) return;
            const back = Animated.timing(cell.value, {
              toValue: 1,
              duration: REAPPEAR_MS,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            });
            perCell.set(key, back);
            back.start();
          }, hitAt + darkFor)
        );
      });

      if (snake) {
        snake.progress.setValue(0);
        // No reset between hunts: only the very first appearance fades in;
        // later hunts take over instantly while the grid keeps breathing.
        if (firstHunt) {
          snake.fade.setValue(0);
          track(Animated.timing(snake.fade, { toValue: 1, duration: EXIT_MS, useNativeDriver: true }));
        } else {
          snake.fade.setValue(1);
        }
        track(
          Animated.timing(snake.progress, {
            toValue: snake.end,
            duration: plan.cycleMs,
            // Steady cruise: one cell per tick, like the game.
            easing: snakeEase,
            useNativeDriver: true,
          })
        );
      }

      if (plane && plan.mode === "plane") {
        plane.clock.setValue(0);
        track(Animated.sequence(planeClockSteps(plan, plane.clock)));
        plane.bullets.forEach((bullet) => {
          bullet.value.setValue(0);
          track(bulletFlight(bullet));
        });
      }

      setNodes({ mode, snake, plane });
      firstHunt = false;
      // No reset, no beat — the next hunt takes over the instant this one ends.
      timers.push(setTimeout(runHunt, plan.cycleMs));
    };
    runHunt();

    return () => {
      unmounted = true;
      timers.forEach(clearTimeout);
      stopCycle();
      perCell.forEach((anim) => anim.stop());
    };
  }, [cells, cols, alive, mode]);

  return React.useMemo(
    () => ({ mode: nodes.mode, cells, snake: nodes.snake, plane: nodes.plane }),
    [nodes, cells]
  );
}
