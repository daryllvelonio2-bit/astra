import React from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useTheme } from "../../../theme/themeContext";
import { CELL, BULLET_H, BULLET_W, JET_H, JET_W } from "./contribPlan";
import { ContribAnimationState } from "./useContribAnimation";

/** Head bead is a touch larger than a grid cell; the tail tapers from there. */
const SNAKE_HEAD_SIZE = CELL + 2;

function snakeSegmentSize(index: number): number {
  return Math.max(CELL * 0.45, SNAKE_HEAD_SIZE - index * 1.1);
}

function snakeSegmentOpacity(index: number): number {
  if (index === 0) return 1;
  return Math.max(0.42, 0.92 - index * 0.07);
}

/**
 * Draws the running graph animation over the squares: either the snake eating
 * its way along the weeks, or the right-side blaster shooting at the colors.
 * When a block is hit, it explodes into fragments of that color.
 * Non-interactive, so scrolling is untouched.
 */
export function ContribAnimOverlay({ anim }: { anim: ContribAnimationState }) {
  const { theme } = useTheme();
  const { snake, plane } = anim;
  if (!snake && !plane) return null;

  return (
    <Animated.View style={styles.layer} pointerEvents="none">
      {snake && (
        <Animated.View style={[styles.layer, { opacity: snake.fade }]}>
          {snake.segments.map((segment, i) => {
            const size = snakeSegmentSize(i);
            return (
              <Animated.View
                key={`seg${i}`}
                style={[
                  styles.segment,
                  {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    left: -size / 2,
                    top: -size / 2,
                    backgroundColor: theme.accent,
                    borderColor: theme.border,
                    borderWidth: size > 8 ? 1 : 0.5,
                    opacity: snakeSegmentOpacity(i),
                  },
                  { transform: [{ translateX: segment.x }, { translateY: segment.y }] },
                ]}
              >
                {i === 0 && (
                  <>
                    <View
                      style={[
                        styles.eye,
                        {
                          left: size * 0.23,
                          top: size * 0.21,
                          width: size * 0.24,
                          height: size * 0.24,
                          borderRadius: size * 0.12,
                          backgroundColor: theme.bgPrimary,
                        },
                      ]}
                    >
                      <View
                        style={{
                          position: "absolute",
                          left: size * 0.07,
                          top: size * 0.07,
                          width: size * 0.10,
                          height: size * 0.10,
                          borderRadius: size * 0.05,
                          backgroundColor: theme.textPrimary,
                        }}
                      />
                    </View>
                    <View
                      style={[
                        styles.eye,
                        {
                          left: size * 0.53,
                          top: size * 0.21,
                          width: size * 0.24,
                          height: size * 0.24,
                          borderRadius: size * 0.12,
                          backgroundColor: theme.bgPrimary,
                        },
                      ]}
                    >
                      <View
                        style={{
                          position: "absolute",
                          left: size * 0.07,
                          top: size * 0.07,
                          width: size * 0.10,
                          height: size * 0.10,
                          borderRadius: size * 0.05,
                          backgroundColor: theme.textPrimary,
                        }}
                      />
                    </View>
                  </>
                )}
              </Animated.View>
            );
          })}
        </Animated.View>
      )}

      {plane && (
        <>
          {/* Jet up in the sky lane, sliding across above its target column */}
          <Animated.View
            style={[
              styles.jet,
              { transform: [{ translateX: plane.turretX }, { translateY: plane.turretY }] },
            ]}
          >
            {/* Top swept wing */}
            <View style={[styles.jetWingTop, { backgroundColor: theme.accent }]} />
            {/* Bottom swept wing */}
            <View style={[styles.jetWingBottom, { backgroundColor: theme.accent }]} />

            {/* Wingtip cannon pods */}
            <View style={[styles.jetPodTop, { backgroundColor: theme.accentGold }]} />
            <View style={[styles.jetPodBottom, { backgroundColor: theme.accentGold }]} />

            {/* Rear vertical stabilizers */}
            <View style={[styles.jetFin, { backgroundColor: theme.accentCyan }]} />

            {/* Main fuselage body */}
            <View style={[styles.jetFuselage, { backgroundColor: theme.accentCyan }]} />

            {/* Nose cone / laser emitter */}
            <View style={[styles.jetNose, { backgroundColor: theme.textPrimary }]} />

            {/* Cockpit canopy with glass glint */}
            <View style={[styles.jetCanopy, { backgroundColor: theme.accentGold }]} />
            <View style={styles.jetCanopyGlass} />

            {/* Afterburner engine nozzle & thruster flame */}
            <View style={[styles.jetEngine, { backgroundColor: theme.borderLight }]} />
            <View style={[styles.jetThruster, { backgroundColor: theme.accentRed }]} />
          </Animated.View>

          {/* Bolts dropping from the belly onto the blocks, then explosions */}
          {plane.shots.map((shot) => (
            <React.Fragment key={shot.id}>
              {/* Vertical bolt falling from the jet's belly onto the target */}
              <Animated.View
                style={[
                  styles.bolt,
                  {
                    backgroundColor: theme.accentGold,
                    opacity: shot.boltOpacity,
                    transform: [{ translateX: shot.boltX }, { translateY: shot.boltY }],
                  },
                ]}
              />

              {/* Block explosion: 4 fragments of the block's color bursting outward */}
              <Animated.View
                style={[
                  styles.explosion,
                  {
                    left: shot.targetX - CELL / 2,
                    top: shot.targetY - CELL / 2,
                    opacity: shot.explosionOpacity,
                  },
                ]}
              >
                <Animated.View
                  style={[
                    styles.fragment,
                    {
                      backgroundColor: shot.color,
                      transform: [
                        { translateX: shot.frag1X },
                        { translateY: shot.frag1Y },
                        { scale: shot.fragScale },
                      ],
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.fragment,
                    {
                      left: 6,
                      backgroundColor: shot.color,
                      transform: [
                        { translateX: shot.frag2X },
                        { translateY: shot.frag2Y },
                        { scale: shot.fragScale },
                      ],
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.fragment,
                    {
                      top: 6,
                      backgroundColor: shot.color,
                      transform: [
                        { translateX: shot.frag3X },
                        { translateY: shot.frag3Y },
                        { scale: shot.fragScale },
                      ],
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.fragment,
                    {
                      left: 6,
                      top: 6,
                      backgroundColor: shot.color,
                      transform: [
                        { translateX: shot.frag4X },
                        { translateY: shot.frag4Y },
                        { scale: shot.fragScale },
                      ],
                    },
                  ]}
                />
              </Animated.View>
            </React.Fragment>
          ))}
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  segment: { position: "absolute", overflow: "hidden" },
  eye: { position: "absolute" },
  jet: { position: "absolute", left: 0, top: 0, width: JET_W, height: JET_H },
  jetFuselage: { position: "absolute", left: 3, top: 7, width: 14, height: 4, borderRadius: 2 },
  jetNose: { position: "absolute", left: 0, top: 7.5, width: 5, height: 3, borderRadius: 1.5 },
  jetWingTop: {
    position: "absolute",
    left: 6,
    top: 2,
    width: 9,
    height: 2.5,
    borderRadius: 1,
    transform: [{ rotate: "-28deg" }],
  },
  jetWingBottom: {
    position: "absolute",
    left: 6,
    bottom: 2,
    width: 9,
    height: 2.5,
    borderRadius: 1,
    transform: [{ rotate: "28deg" }],
  },
  jetPodTop: { position: "absolute", left: 4.5, top: 0.5, width: 5, height: 1.5, borderRadius: 0.75 },
  jetPodBottom: { position: "absolute", left: 4.5, bottom: 0.5, width: 5, height: 1.5, borderRadius: 0.75 },
  jetFin: { position: "absolute", right: 3, top: 4.5, width: 2, height: 9, borderRadius: 1 },
  jetCanopy: { position: "absolute", left: 5, top: 7.5, width: 5, height: 3, borderRadius: 1.5 },
  jetCanopyGlass: {
    position: "absolute",
    left: 6,
    top: 8,
    width: 2.5,
    height: 1,
    borderRadius: 0.5,
    backgroundColor: "#ffffff",
    opacity: 0.7,
  },
  jetEngine: { position: "absolute", right: 1, top: 7.5, width: 3, height: 3, borderRadius: 1 },
  jetThruster: { position: "absolute", right: -3, top: 8, width: 4, height: 2, borderRadius: 1 },
  bolt: { position: "absolute", left: 0, top: 0, width: BULLET_W, height: BULLET_H, borderRadius: BULLET_W / 2 },
  explosion: { position: "absolute", width: CELL, height: CELL },
  fragment: { position: "absolute", width: 5, height: 5, borderRadius: 1 },
});
