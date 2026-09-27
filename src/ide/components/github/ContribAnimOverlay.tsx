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
          {/* Turret placed on the right edge, tracking target rows vertically */}
          <Animated.View
            style={[
              styles.turret,
              { transform: [{ translateX: plane.turretX }, { translateY: plane.turretY }] },
            ]}
          >
            <View style={[styles.turretBase, { backgroundColor: theme.accentCyan }]} />
            <View style={[styles.turretBarrel, { backgroundColor: theme.accentCyan }]} />
            <View style={[styles.turretCore, { backgroundColor: theme.accentGold }]} />
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
  turret: { position: "absolute", left: 0, top: 0, width: 14, height: 16 },
  turretBase: { position: "absolute", right: 0, top: 1, width: 4, height: 14, borderRadius: 2 },
  turretBarrel: { position: "absolute", left: 0, top: 6.5, width: 10, height: 3, borderRadius: 1.5 },
  turretCore: { position: "absolute", right: 3, top: 6, width: 4, height: 4, borderRadius: 2 },
  laser: { position: "absolute", left: 0, width: 18, height: 3, borderRadius: 1.5 },
  explosion: { position: "absolute", width: CELL, height: CELL },
  fragment: { position: "absolute", width: 5, height: 5, borderRadius: 1 },
});
