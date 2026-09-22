import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Animated,
  Easing,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AstraLogo } from "../ide/components/AstraLogo";
import { useTheme } from "../theme/themeContext";
import { useOrientation } from "../theme/useOrientation";
import {
  AppTheme,
  loadConfig,
  saveHasCompletedStartup,
  saveTheme,
} from "../ide/services/configService";
import { StartupStepId } from "./types";
import { ThemeSelectionStep } from "./steps/ThemeSelectionStep";
import { PermissionsStep } from "./steps/PermissionsStep";
import { GitHubSetupStep } from "./steps/GitHubSetupStep";

interface StartupWizardProps {
  onComplete: () => void;
}

const STEPS: { id: StartupStepId; label: string }[] = [
  { id: "theme", label: "Theme" },
  { id: "permissions", label: "System" },
  { id: "github", label: "GitHub" },
];

export function StartupWizard({ onComplete }: StartupWizardProps) {
  const insets = useSafeAreaInsets();
  const { theme, themeMode, setTheme } = useTheme();
  const { isLandscape } = useOrientation();

  const topInset = Math.max(insets.top, StatusBar.currentHeight || 0);
  const bottomInset = Math.max(insets.bottom, 12);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [selectedTheme, setSelectedTheme] = useState<AppTheme>(themeMode);
  const [githubConfigured, setGithubConfigured] = useState(false);

  // Remember and pre-fill existing choices if the setup was completed or run previously
  useEffect(() => {
    loadConfig().then((cfg) => {
      if (cfg.selectedTheme) {
        setSelectedTheme(cfg.selectedTheme);
        setTheme(cfg.selectedTheme);
      }
    }).catch(console.error);
  }, [setTheme]);

  const currentStep = STEPS[currentStepIndex];

  // Slide + fade the step body on every step change (forward slides in from
  // the right, back from the left).
  const slideAnim = useRef(new Animated.Value(0)).current;
  const bodyOpacity = useRef(new Animated.Value(1)).current;
  const prevStepIndex = useRef(0);
  useEffect(() => {
    const dir = currentStepIndex >= prevStepIndex.current ? 1 : -1;
    prevStepIndex.current = currentStepIndex;
    slideAnim.setValue(40 * dir);
    bodyOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(bodyOpacity, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [currentStepIndex]);

  // Gentle pulse on the active step dot
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
  }, []);

  const handleSelectTheme = useCallback((mode: AppTheme) => {
    setSelectedTheme(mode);
    setTheme(mode); // Live preview updates UI immediately
  }, [setTheme]);

  const handleFinish = useCallback(async () => {
    await saveTheme(selectedTheme);
    await saveHasCompletedStartup(true);
    onComplete();
  }, [selectedTheme, onComplete]);

  const handleNext = useCallback(() => {
    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      handleFinish();
    }
  }, [currentStepIndex, handleFinish]);

  const handleBack = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  }, [currentStepIndex]);

  return (
    <View
      style={[
        styles.safeArea,
        {
          backgroundColor: theme.bgPrimary,
          paddingTop: topInset,
          paddingBottom: bottomInset,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <StatusBar
        barStyle={theme.isDark ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />
      <View style={[styles.container, isLandscape && styles.containerLandscape]}>
        {/* Header Bar */}
        <View style={[styles.headerBar, { borderBottomColor: theme.border }]}>
          <View style={styles.brandRow}>
            <AstraLogo width={32} height={32} />
            <View>
              <Text style={[styles.brandTitle, { color: theme.textPrimary }]}>
                Astra Setup
              </Text>
              <Text style={[styles.brandSubtitle, { color: theme.textMuted }]}>
                Personalize your workspace
              </Text>
            </View>
          </View>

          {/* Step Indicator Dots */}
          <View style={styles.stepIndicatorRow}>
            {STEPS.map((step, idx) => {
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
                      <Ionicons name="checkmark" size={10} color="#ffffff" />
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
                        {
                          color: theme.textPrimary,
                          fontWeight: "700",
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {step.label}
                    </Text>
                  )}
                  {idx < STEPS.length - 1 && (
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

        {/* Step Body (scrollable so the bottom actions are always reachable) */}
        <ScrollView
          style={styles.bodyWrap}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Animated.View
            style={[
              styles.bodyAnimated,
              {
                opacity: bodyOpacity,
                transform: [{ translateX: slideAnim }],
              },
            ]}
          >
          {currentStep.id === "theme" && (
            <ThemeSelectionStep
              selectedTheme={selectedTheme}
              onSelectTheme={handleSelectTheme}
              theme={theme}
              isLandscape={isLandscape}
            />
          )}

          {currentStep.id === "permissions" && (
            <PermissionsStep
              theme={theme}
              isLandscape={isLandscape}
            />
          )}

          {currentStep.id === "github" && (
            <GitHubSetupStep
              theme={theme}
              isLandscape={isLandscape}
              onConfigured={() => setGithubConfigured(true)}
              onSkip={handleFinish}
            />
          )}
          </Animated.View>
        </ScrollView>

        {/* Bottom Navigation Actions */}
        <View
          style={[
            styles.bottomBar,
            isLandscape && styles.bottomBarLandscape,
            { backgroundColor: theme.bgSecondary, borderTopColor: theme.border },
          ]}
        >
          {currentStepIndex > 0 ? (
            <TouchableOpacity
              style={[
                styles.navBtnSecondary,
                { backgroundColor: theme.bgTertiary, borderColor: theme.border },
              ]}
              onPress={handleBack}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={15} color={theme.textSecondary} />
              <Text style={[styles.navBtnSecondaryText, { color: theme.textSecondary }]}>
                Back
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.spacer} />
          )}

          <View style={styles.rightActionsRow}>
            {currentStep.id === "github" && (
              <TouchableOpacity
                style={[styles.skipBtn]}
                onPress={handleFinish}
                activeOpacity={0.7}
              >
                <Text style={[styles.skipBtnText, { color: theme.textMuted }]}>
                  Skip for now
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.navBtnPrimary,
                { backgroundColor: theme.accent },
              ]}
              onPress={handleNext}
              activeOpacity={0.8}
            >
              <Text style={[styles.navBtnPrimaryText, { color: theme.sendButtonIcon }]}>
                {currentStepIndex === STEPS.length - 1 ? "Get Started" : "Continue"}
              </Text>
              <Ionicons
                name={currentStepIndex === STEPS.length - 1 ? "rocket" : "arrow-forward"}
                size={15}
                color={theme.sendButtonIcon}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  containerLandscape: {
    flexDirection: "column",
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
  bodyWrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  bodyContent: {
    flexGrow: 1,
    paddingBottom: 8,
  },
  bodyAnimated: {
    flex: 1,
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  bottomBarLandscape: {
    paddingVertical: 8,
  },
  navBtnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  navBtnSecondaryText: {
    fontSize: 13,
    fontWeight: "600",
  },
  spacer: {
    width: 60,
  },
  rightActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  skipBtn: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  skipBtnText: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  navBtnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  navBtnPrimaryText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
