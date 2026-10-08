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
import { StartupWizardHeader } from "./StartupWizardHeader";
import { useTheme } from "../theme/themeContext";
import { useOrientation } from "../theme/useOrientation";
import { useAccurateKeyboard } from "../theme/useAccurateKeyboard";
import {
  AppTheme,
  loadConfig,
  saveBottomTabs,
  saveHasCompletedStartup,
  saveTheme,
} from "../ide/services/configService";
import { StartupStepId } from "./types";
import { ThemeSelectionStep } from "./steps/ThemeSelectionStep";
import { PermissionsStep } from "./steps/PermissionsStep";
import { GitHubSetupStep } from "./steps/GitHubSetupStep";
import { GuideStep } from "./steps/GuideStep";

interface StartupWizardProps {
  onComplete: () => void;
}

const STEPS: { id: StartupStepId; label: string }[] = [
  { id: "theme", label: "Theme" },
  { id: "permissions", label: "System" },
  { id: "github", label: "GitHub" },
  // Last step on purpose: it documents the tabs the user is about to land in,
  // and the final button already reads "Get Started".
  { id: "guide", label: "Guide" },
];

export function StartupWizard({ onComplete }: StartupWizardProps) {
  const insets = useSafeAreaInsets();
  const { theme, themeMode, setTheme } = useTheme();
  const { isLandscape } = useOrientation();
  const { isKeyboardVisible, keyboardOffset } = useAccurateKeyboard(8);

  const topInset = Math.max(insets.top, StatusBar.currentHeight || 0);
  const bottomInset = Math.max(insets.bottom, 12);
  // Edge-to-edge: the OS does NOT resize the window for the soft keyboard, so
  // KeyboardAvoidingView alone does nothing here. Retreat the whole container
  // by the measured IME height or the focused field and the Back/Next/Skip row
  // end up underneath the keyboard.
  const bottomPad = isKeyboardVisible ? Math.max(bottomInset, keyboardOffset) : bottomInset;

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

  const handleSelectTheme = useCallback((mode: AppTheme) => {
    setSelectedTheme(mode);
    setTheme(mode); // Live preview updates UI immediately
  }, [setTheme]);

  const handleFinish = useCallback(async () => {
    await saveTheme(selectedTheme);
    await saveHasCompletedStartup(true);
    if (!githubConfigured) {
      const cfg = await loadConfig();
      await saveBottomTabs({ ...cfg.bottomTabs, git: false });
    }
    onComplete();
  }, [selectedTheme, githubConfigured, onComplete]);

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
          paddingBottom: bottomPad,
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
      <View style={styles.container}>
        <StartupWizardHeader
          steps={STEPS}
          currentStepIndex={currentStepIndex}
          isLandscape={isLandscape}
        />

        {/* Step Body (the single scroller — each step is natural-height content
            inside it, so tall steps scroll instead of painting over the bar) */}
        <ScrollView
          style={[styles.bodyWrap, isLandscape && styles.bodyWrapLandscape]}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
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

          {currentStep.id === "guide" && (
            <GuideStep theme={theme} isLandscape={isLandscape} />
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
              <Text
                style={[styles.navBtnSecondaryText, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
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
                <Text
                  style={[styles.skipBtnText, { color: theme.textMuted }]}
                  numberOfLines={1}
                >
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
              <Text
                style={[styles.navBtnPrimaryText, { color: theme.sendButtonIcon }]}
                numberOfLines={1}
              >
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
  bodyWrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  bodyWrapLandscape: {
    paddingTop: 10,
  },
  bodyContent: {
    flexGrow: 1,
    paddingBottom: 8,
  },
  bodyAnimated: {
    // flexGrow (not flex:1): a flex:1 child of a ScrollView is pinned to the
    // viewport height, so tall steps overflowed and overlapped the nav bar
    // instead of extending the scrollable content. flexGrow fills short steps
    // but still lets tall ones grow the content and scroll.
    flexGrow: 1,
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
    flexShrink: 1,
  },
  spacer: {
    width: 60,
  },
  rightActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 1,
    gap: 10,
  },
  skipBtn: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  skipBtnText: {
    fontSize: 12.5,
    fontWeight: "600",
    flexShrink: 1,
  },
  navBtnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    flexShrink: 0,
  },
  navBtnPrimaryText: {
    fontSize: 13,
    fontWeight: "700",
    flexShrink: 1,
  },
});
