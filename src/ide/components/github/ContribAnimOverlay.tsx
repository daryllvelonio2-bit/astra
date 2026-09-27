import React from "react";
import { Animated, StyleSheet } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { BULLET_H, BULLET_W, CELL, PLANE_BOX, PLANE_SIZE, muzzleY } from "./contribPlan";
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
                { backgroundColor: theme.accentGreen, opacity: i === 0 ? 1 : 0.72 },
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
            <FontAwesome6
              name="fighter-jet"
              size={PLANE_SIZE}
              color={theme.accentCyan}
              style={styles.icon}
            />
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
  segment: { position: "absolute", left: 0, top: 0, width: CELL, height: CELL, borderRadius: 3 },
  plane: {
    position: "absolute",
    left: 0,
    top: 0,
    width: PLANE_BOX,
    height: PLANE_BOX,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { transform: [{ rotate: "-90deg" }] },
  bullet: { position: "absolute", top: muzzleY(), width: BULLET_W, height: BULLET_H, borderRadius: 1 },
});
