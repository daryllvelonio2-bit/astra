import React from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useTheme } from "../../../theme/themeContext";
import { BULLET_H, BULLET_W, PLANE_BOX, muzzleY } from "./contribPlan";
import { ContribAnimationState } from "./useContribAnimation";

/**
 * Draws the running graph animation over the squares: either the snake eating
 * its way along the weeks, or the aircraft strafing them. Purely decorative —
 * every node is animated natively, so this renders once per cycle and never
 * while an animation plays. Non-interactive, so scrolling is untouched.
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
                {
                  width: segment.size,
                  height: segment.size,
                  borderRadius: segment.size / 2,
                  backgroundColor: theme.accentGreen,
                  opacity: segment.opacity,
                },
                { transform: [{ translateX: segment.x }, { translateY: segment.y }] },
              ]}
            />
          ))}
        </Animated.View>
      )}

      {plane && (
        <>
          <Animated.View
            style={[styles.plane, { transform: [{ translateX: plane.x }, { translateY: plane.y }] }]}
          >
            {/* Top-view jet drawn from theme tokens: nose left, wings amidships,
                tailplane aft — so it always points the way it flies. */}
            <View style={[styles.fuselage, { backgroundColor: theme.accentCyan }]} />
            <View style={[styles.wing, { backgroundColor: theme.accentCyan }]} />
            <View style={[styles.tailplane, { backgroundColor: theme.accentCyan }]} />
          </Animated.View>
          {plane.bullets.map((bullet) => (
            <Animated.View
              key={bullet.id}
              style={[
                styles.bullet,
                { backgroundColor: theme.accentGold, left: bullet.x },
                { opacity: bullet.opacity },
                { transform: [{ translateY: bullet.travel }] },
              ]}
            />
          ))}
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  segment: { position: "absolute", left: 0, top: 0 },
  plane: { position: "absolute", left: 0, top: 0, width: PLANE_BOX, height: PLANE_BOX },
  fuselage: { position: "absolute", left: 1, top: 6.5, width: 13, height: 3, borderRadius: 1.5 },
  wing: { position: "absolute", left: 6, top: 2.5, width: 3, height: 11, borderRadius: 1.5 },
  tailplane: { position: "absolute", left: 11, top: 5, width: 2, height: 6, borderRadius: 1 },
  bullet: { position: "absolute", top: muzzleY(), width: BULLET_W, height: BULLET_H, borderRadius: 1 },
});
