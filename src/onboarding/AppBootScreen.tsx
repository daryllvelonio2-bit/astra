import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Animated,
  StyleSheet,
  StatusBar,
  Dimensions,
} from "react-native";
import { AstraLogo } from "../ide/components/AstraLogo";

interface AppBootScreenProps {
  isReady: boolean;
  onAnimationEnd: () => void;
  /** Live setup-phase label, e.g. "Loading settings…" */
  phase: string;
}

export function AppBootScreen({ isReady, onAnimationEnd, phase }: AppBootScreenProps) {
  const glowAnim = useRef(new Animated.Value(0.4)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const phaseOpacity = useRef(new Animated.Value(1)).current;
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  // Cross-fade the phase label each time the setup stage changes
  useEffect(() => {
    phaseOpacity.setValue(0);
    const anim = Animated.timing(phaseOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [phase]);

  // Soft shimmer for the loading bar only — no aura around the logo
  useEffect(() => {
    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.85,
          duration: 1100,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.4,
          duration: 1100,
          useNativeDriver: true,
        }),
      ])
    );
    shimmer.start();

    // Hold the splash briefly so the logo renders smoothly before landing
    const timer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, 350);

    return () => {
      shimmer.stop();
      clearTimeout(timer);
    };
  }, []);

  // When both minimum display time has passed and real app init is ready, fade out smoothly
  useEffect(() => {
    if (isReady && minTimeElapsed) {
      const anim = Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      });
      anim.start(({ finished }) => {
        if (finished) {
          onAnimationEnd();
        }
      });
      return () => anim.stop();
    }
  }, [isReady, minTimeElapsed]);


  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          opacity: fadeAnim,
        },
      ]}
      pointerEvents="none"
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor="#020919"
        translucent
      />

      {/* Central Logo & Brand Block */}
      <View style={styles.centerContent}>
        <View style={styles.logoContainer}>
          <AstraLogo width={172} height={172} />
        </View>

        <Text style={styles.title}>ASTRA</Text>
        <Text style={styles.subtitle}>AI IDE &amp; LINUX SANDBOX</Text>

        {/* Shimmer loading bar + live setup-phase label */}
        <View style={styles.loaderTrack}>
          <Animated.View
            style={[
              styles.loaderThumb,
              {
                opacity: glowAnim,
              },
            ]}
          />
        </View>
        <Animated.Text style={[styles.phaseText, { opacity: phaseOpacity }]}>
          {phase}
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const { width } = Dimensions.get("window");

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#020919",
    zIndex: 99999,
    justifyContent: "center",
    alignItems: "center",
  },
  centerContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  logoContainer: {
    width: 172,
    height: 172,
    marginBottom: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 8,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: "700",
    color: "#00E5FF",
    letterSpacing: 3,
    opacity: 0.9,
    marginBottom: 24,
  },
  loaderTrack: {
    width: Math.min(width * 0.42, 160),
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
  },
  loaderThumb: {
    width: "100%",
    height: "100%",
    backgroundColor: "#00E5FF",
    borderRadius: 2,
  },
  phaseText: {
    marginTop: 12,
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.6)",
    letterSpacing: 2,
  },
});
