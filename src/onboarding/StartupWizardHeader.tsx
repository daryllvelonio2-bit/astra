import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AstraLogo } from "../ide/components/AstraLogo";
import { useTheme } from "../theme/themeContext";

interface WizardHeaderProps {
  steps: { id: string; label: string }[];
  currentStepIndex: number;
  isLandscape: boolean;
}

/**
 * Wizard chrome: brand block plus the step-indicator dots. Owns its own
 * pulse animation so the wizard body does not re-render on every frame.
 * Brand text and the dot row shrink rather than overflow the bar on a phone.
 */
export function StartupWizardHeader({
  steps,
  currentStepIndex,
  isLandscape,
}: WizardHeaderProps) {
  const { theme } = useTheme();

  const dotPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, {
          toValue: 1.25,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(dotPulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [dotPulse]);

  return (
    <View
      style={[
        styles.headerBar,
        isLandscape && styles.headerBarLandscape,
        { backgroundColor: theme.bgSecondary, borderBottomColor: theme.border },
      ]}
    >
      <View style={styles.brandRow}>
        <AstraLogo width={32} height={32} />
        <View style={styles.brandTextCol}>
          <Text
            style={[styles.brandTitle, { color: theme.textPrimary }]}
            numberOfLines={1}
          >
            Astra Setup
          </Text>
          <Text
            style={[styles.brandSubtitle, { color: theme.textMuted }]}
            numberOfLines={1}
          >
            Personalize your workspace
          </Text>
        </View>
      </View>

      <View style={styles.stepIndicatorRow}>
        {steps.map((step, idx) => {
          const isActive = idx === currentStepIndex;
          const isPast = idx < currentStepIndex;
          return (
            <View key={step.id} style={styles.stepDotWrap}>
              <Animated.View
                style={[
                  styles.stepDot,
                  {
                    backgroundColor: isActive
                      ? theme.accent
                      : isPast
                      ? theme.accentGreen
                      : theme.borderLight,
                    transform: [{ scale: isActive ? dotPulse : 1 }],
                  },
                ]}
              >
                {isPast ? (
                  <Ionicons name="checkmark" size={10} color={theme.sendButtonIcon} />
                ) : (
                  <Text
                    style={[
                      styles.stepNumber,
                      { color: isActive ? theme.sendButtonIcon : theme.textMuted },
                    ]}
                  >
                    {idx + 1}
                  </Text>
                )}
              </Animated.View>
              {isActive && !isLandscape && (
                <Text
                  style={[
                    styles.stepDotLabel,
                    { color: theme.textPrimary, fontWeight: "700" },
                  ]}
                  numberOfLines={1}
                >
                  {step.label}
                </Text>
              )}
              {idx < steps.length - 1 && (
                <View
                  style={[
                    styles.stepConnector,
                    { backgroundColor: isPast ? theme.accentGreen : theme.border },
                  ]}
                />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerBarLandscape: {
    paddingVertical: 8,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 1,
  },
  brandTextCol: {
    flexShrink: 1,
  },
  brandTitle: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  brandSubtitle: {
    fontSize: 10.5,
  },
  stepIndicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  stepDotWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stepDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumber: {
    fontSize: 9,
    fontWeight: "700",
  },
  stepDotLabel: {
    fontSize: 11,
    marginRight: 4,
  },
  stepConnector: {
    width: 14,
    height: 2,
    marginHorizontal: 4,
    borderRadius: 1,
  },
});
