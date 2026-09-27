import React from "react";
import { Animated, Easing } from "react-native";
import {
  ContribCell,
  ContribMode,
  ContribPlan,
  ContribPoint,
  SNAKE_BODY_CELLS,
  SnakeStep,
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
  // Where the last snake hunt ended: the next hunt starts there, so the head
  // never teleports back to the top between batches.
  const lastEnd = React.useRef<ContribPoint | null>(null);
  // The last hunt's tail, laid ahead of the next walk so the body carries
  // over pixel-identical instead of collapsing and regrowing.
  const tailCarry = React.useRef<SnakeStep[]>([]);

  React.useEffect(() => {
    let unmounted = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Latest bite animations per square, stopped when a newer hunt takes over.
    const perCell = new Map<string, Animated.CompositeAnimation[]>();
    // Hunt generation per square: a respawn only fires for the hunt that
    // scheduled it, so handoffs never relight squares mid-hunt.
    const cellGen = new Map<string, number>();
    let huntGen = 0;
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
    // A new grid means a new journey: forget where the old one ended.
    lastEnd.current = null;
    tailCarry.current = [];
    const runHunt = () => {
      if (unmounted) return;
      stopCycle();
      huntGen++;
      const gen = huntGen;
      const plan: ContribPlan =
        mode === "snake"
          ? buildSnakePlan(alive, cols, lastEnd.current ?? undefined, tailCarry.current)
          : buildPlanePlan(alive, cols);
      const snake = plan.mode === "snake" ? buildSnakeNodes(plan) : null;
      const plane = plan.mode === "plane" ? buildPlaneNodes(plan, cols) : null;

      // Each square falls at every scheduled hit, then fades back on its own
      // after a random dark spell — even across hunt boundaries, so the grid
      // never wipes and never refills all at once. The snake bites on every
      // walk over a green, so respawned squares it re-crosses die again.
      cells.forEach((cell, key) => {
        perCell.get(key)?.forEach((anim) => anim.stop());
        cellGen.set(key, gen);
        const bites: Animated.CompositeAnimation[] = [];
        perCell.set(key, bites);
        // Snake visits a square every time the head walks over it; a strafing
        // pass kills it once.
        const hitAts =
          plan.mode === "snake"
            ? plan.visitAt.get(key) ?? [plan.cycleMs]
            : [plan.vanishAt.get(key) ?? plan.cycleMs];
        hitAts.forEach((hitAt, bi) => {
          const bite = Animated.timing(cell.value, {
            toValue: 0,
            delay: hitAt,
            duration: FADE_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          });
          bites.push(bite);
          bite.start();
          const darkFor = RESPAWN_MIN_MS + Math.random() * (RESPAWN_MAX_MS - RESPAWN_MIN_MS);
          // A re-bite landing before this respawn would fire takes over the
          // square, so this relight is skipped — the later bite brings its own.
          const nextAt = hitAts[bi + 1] ?? Infinity;
          if (nextAt <= hitAt + darkFor) return;
          timers.push(
            setTimeout(() => {
              if (unmounted || cellGen.get(key) !== gen) return;
              const back = Animated.timing(cell.value, {
                toValue: 1,
                duration: REAPPEAR_MS,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              });
              back.start();
            }, hitAt + darkFor)
          );
        });
      });

      // The walk covers headStart -> end, so it runs the matching slice of the
      // cycle: with linear easing the head then lands on each step exactly
      // when its bite fires — eating visibly happens under the head, never
      // seconds later under the tail.
      const walkMs =
        plan.mode === "snake"
          ? (plan.cycleMs * (plan.route.length - 1 - plan.headStart)) /
            Math.max(1, plan.route.length - 1)
          : plan.cycleMs;

      if (snake) {
        // The head resumes mid-walk on later hunts (headStart), so the body
        // never collapses — only the first hunt starts at zero.
        snake.progress.setValue(plan.mode === "snake" ? plan.headStart : 0);
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
            duration: walkMs,
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
      // Remember where the head stopped — and leave its tail laid out — so the
      // next hunt carries on invisibly instead of resetting. All seven
      // segments (head + six back) carry over, so every one resumes in place.
      if (plan.mode === "snake") {
        const end = plan.route[plan.route.length - 1];
        lastEnd.current = end ? { col: end.col, row: end.row } : null;
        tailCarry.current = plan.route.slice(-(SNAKE_BODY_CELLS + 1));
      }
      // No reset, no beat — the next hunt takes over the instant this walk ends.
      timers.push(setTimeout(runHunt, Math.max(1000, walkMs)));
    };
    runHunt();

    return () => {
      unmounted = true;
      timers.forEach(clearTimeout);
      stopCycle();
      perCell.forEach((anims) => anims.forEach((anim) => anim.stop()));
    };
  }, [cells, cols, alive, mode]);

  return React.useMemo(
    () => ({ mode: nodes.mode, cells, snake: nodes.snake, plane: nodes.plane }),
    [nodes, cells]
  );
}
