import React, { useEffect, useId, useRef } from "react";
import { Animated, Easing, StyleProp, View, ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

interface AstraMarkAnimatedProps {
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
  /** When false, renders the same mark frozen (no loops running). Defaults to true. */
  animated?: boolean;
  /** Optional solid color to override gradients. */
  color?: string;
}

// Acode loading-logo timing: 1500ms infinite cycle, scale 1 -> ~1.13 -> 1
// with ease-out, staggered so the pulse travels across the parts.
const CYCLE_MS = 1500;
const PULSE_MS = 260;
const PEAK_SCALE = 1.13;
const STAR_PEAK_SCALE = 1.2;
const EASE_OUT = Easing.bezier(0, 0, 0.58, 1);

// Wave order mirrors Acode (left -> right): chevL, legL, legR, chevR, then star.
const PHASE_CHEV_L = 0;
const PHASE_LEG_L = 300;
const PHASE_LEG_R = 600;
const PHASE_CHEV_R = 900;
const PHASE_STAR = 1200;

function useWaveScale(phase: number, peak: number, active: boolean): Animated.Value {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) return;
    const tail = Math.max(0, CYCLE_MS - PULSE_MS * 2 - phase);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(phase),
        Animated.timing(v, {
          toValue: peak,
          duration: PULSE_MS,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 1,
          duration: PULSE_MS,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.delay(tail),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, phase, peak]);
  return v;
}

export function AstraMarkAnimated({
  width = 36,
  height = 36,
  style,
  animated = true,
  color,
}: AstraMarkAnimatedProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const legGradId = `astraLeg${uid}`;
  const chevGradId = `astraChev${uid}`;
  const starGradId = `astraStar${uid}`;

  const chevLScale = useWaveScale(PHASE_CHEV_L, PEAK_SCALE, animated);
  const legLScale = useWaveScale(PHASE_LEG_L, PEAK_SCALE, animated);
  const legRScale = useWaveScale(PHASE_LEG_R, PEAK_SCALE, animated);
  const chevRScale = useWaveScale(PHASE_CHEV_R, PEAK_SCALE, animated);
  const starScale = useWaveScale(PHASE_STAR, STAR_PEAK_SCALE, animated);

  return (
    <View style={[{ width, height, position: "relative" }, style]}>
      {/* Left chevron */}
      <Animated.View
        style={{
          position: "absolute",
          left: "10.5%",
          top: "47.5%",
          width: "21%",
          aspectRatio: 42 / 70,
          transform: [{ scale: chevLScale }],
        }}
      >
        <Svg width="100%" height="100%" viewBox="21 95 42 70">
          <Defs>
            <LinearGradient id={chevGradId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#67E8F9" />
              <Stop offset="1" stopColor="#0EA5E9" />
            </LinearGradient>
          </Defs>
          <Path
            d="M54 104 L30 130 L54 156"
            fill="none"
            stroke={color || `url(#${chevGradId})`}
            strokeWidth="17"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Animated.View>

      {/* Right chevron */}
      <Animated.View
        style={{
          position: "absolute",
          left: "68.5%",
          top: "47.5%",
          width: "21%",
          aspectRatio: 42 / 70,
          transform: [{ scale: chevRScale }],
        }}
      >
        <Svg width="100%" height="100%" viewBox="137 95 42 70">
          <Defs>
            <LinearGradient id={chevGradId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#67E8F9" />
              <Stop offset="1" stopColor="#0EA5E9" />
            </LinearGradient>
          </Defs>
          <Path
            d="M146 104 L170 130 L146 156"
            fill="none"
            stroke={color || `url(#${chevGradId})`}
            strokeWidth="17"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Animated.View>

      {/* A left leg + crossbar */}
      <Animated.View
        style={{
          position: "absolute",
          left: "24%",
          top: "26%",
          width: "31%",
          aspectRatio: 62 / 116,
          transform: [{ scale: legLScale }],
        }}
      >
        <Svg width="100%" height="100%" viewBox="48 52 62 116">
          <Defs>
            <LinearGradient id={legGradId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#A5F3FC" />
              <Stop offset="0.55" stopColor="#38BDF8" />
              <Stop offset="1" stopColor="#7C3AED" />
            </LinearGradient>
          </Defs>
          <Path
            d="M100 62 L58 158 M72 126 L128 126"
            fill="none"
            stroke={color || `url(#${legGradId})`}
            strokeWidth="20"
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>

      {/* A right leg */}
      <Animated.View
        style={{
          position: "absolute",
          left: "45%",
          top: "26%",
          width: "31%",
          aspectRatio: 62 / 116,
          transform: [{ scale: legRScale }],
        }}
      >
        <Svg width="100%" height="100%" viewBox="90 52 62 116">
          <Defs>
            <LinearGradient id={legGradId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#A5F3FC" />
              <Stop offset="0.55" stopColor="#38BDF8" />
              <Stop offset="1" stopColor="#7C3AED" />
            </LinearGradient>
          </Defs>
          <Path
            d="M100 62 L142 158"
            fill="none"
            stroke={color || `url(#${legGradId})`}
            strokeWidth="20"
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>

      {/* Top star */}
      <Animated.View
        style={{
          position: "absolute",
          left: "36%",
          top: "4%",
          width: "28%",
          aspectRatio: 1,
          transform: [{ scale: starScale }],
        }}
      >
        <Svg width="100%" height="100%" viewBox="72 8 56 56">
          <Defs>
            <LinearGradient id={starGradId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" />
              <Stop offset="0.55" stopColor="#C4B5FD" />
              <Stop offset="1" stopColor="#8B5CF6" />
            </LinearGradient>
          </Defs>
          <Path
            d="M100 8 C103 26 110 33 128 36 C110 39 103 46 100 64 C97 46 90 39 72 36 C90 33 97 26 100 8 Z"
            fill={color || `url(#${starGradId})`}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}
