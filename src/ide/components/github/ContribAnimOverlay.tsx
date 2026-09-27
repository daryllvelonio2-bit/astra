import React from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useTheme } from "../../../theme/themeContext";
import { CELL } from "./contribPlan";
import { ContribAnimationState } from "./useContribAnimation";

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
          {snake.segments.map((segment, i) => (
            <Animated.View
              key={`seg${i}`}
              style={[
                styles.segment,
                { backgroundColor: theme.accentGreen, opacity: i === 0 ? 1 : 0.72 },
                { transform: [{ translateX: segment.x }, { translateY: segment.y }] },
              ]}
            />
          ))}
        </Animated.View>
      )}

      {plane && (
        <>
          {/* Fighter jet on the right edge tracking target rows vertically */}
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

          {/* Laser projectiles and block explosions */}
          {plane.shots.map((shot) => (
            <React.Fragment key={shot.id}>
              {/* Laser bolt traveling right to left */}
              <Animated.View
                style={[
                  styles.laser,
                  {
                    backgroundColor: theme.accentGold,
                    top: shot.laserY,
                    opacity: shot.laserOpacity,
                    transform: [{ translateX: shot.laserX }],
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
  segment: { position: "absolute", left: -1, top: -1, width: CELL + 2, height: CELL + 2, borderRadius: 4 },
  jet: { position: "absolute", left: 0, top: 0, width: 20, height: 18 },
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
  laser: { position: "absolute", left: 0, width: 18, height: 3, borderRadius: 1.5 },
  explosion: { position: "absolute", width: CELL, height: CELL },
  fragment: { position: "absolute", width: 5, height: 5, borderRadius: 1 },
});
