import React, { useState, useEffect, useRef } from "react";
import { LogBox, View, StyleSheet, Text, AppState } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ProjectPicker } from "./src/ide/components/ProjectPicker";
import { RepoCloneIndicator } from "./src/ide/components/RepoCloneIndicator";
import { IDELayout } from "./src/ide/components/IDELayout";
import { PRootService } from "./src/ide/services/prootService";
import { ThemeProvider } from "./src/theme/themeContext";
import { KeyboardMouseProvider } from "./src/ide/context/KeyboardMouseContext";
import { ideActionService } from "./src/ide/services/ideActionService";
import { StartupWizard } from "./src/onboarding/StartupWizard";
import { AppBootScreen } from "./src/onboarding/AppBootScreen";
import { TrialExpiredScreen } from "./src/onboarding/TrialExpiredScreen";
import { loadHasCompletedStartup, subscribeConfigChanges } from "./src/ide/services/configService";
import { getLicenseState, type LicenseState } from "./src/ide/services/licenseService";
import { AppDialogHost } from "./src/ide/services/appDialog";
import { GlobalNotificationBanner } from "./src/ide/components/GlobalNotificationBanner";
import {
  startGithubNotificationPoller,
  stopGithubNotificationPoller,
} from "./src/ide/services/githubNotificationPoller";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("App ErrorBoundary:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#1a1a2e" }}>
          <Text style={{ color: "#ff6b6b", fontSize: 16, textAlign: "center", padding: 20 }}>
            Something went wrong. Please restart the app.
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<"picker" | "editor">("picker");
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [hasCompletedStartup, setHasCompletedStartup] = useState<boolean | null>(null);
  // Trial gate: null until the first-launch stamp has been read/created.
  const [licenseState, setLicenseState] = useState<LicenseState | null>(null);
  const [bootVisible, setBootVisible] = useState(true);
  const [bootPhase, setBootPhase] = useState("Loading settings…");
  // True only when settings AND sandbox are actually ready — the splash
  // waits for this (not just its timer) so the phase text stays truthful.
  const [bootDone, setBootDone] = useState(false);
  // Keep-alive: editor stays mounted once opened and is only hidden.
  const [visited, setVisited] = useState<Set<"editor">>(new Set());
  const bootDoneRef = useRef(false);

  const showScreen = (screen: "picker" | "editor") => {
    if (screen === "editor") {
      setVisited((prev) => {
        if (prev.has(screen)) return prev;
        const next = new Set(prev);
        next.add(screen);
        return next;
      });
    }
    setCurrentScreen(screen);
  };

  useEffect(() => {
    // Speed: settings, config, and sandbox warm concurrently (were serial:
    // startup → sandbox → done). Splash still waits for real readiness.
    // Phase labels pace the wave so every stage gets screen time.
    let cancelled = false;
    setBootPhase("Loading settings…");
    const settingsReady = loadHasCompletedStartup()
      .then((completed) => {
        if (cancelled) return;
        setHasCompletedStartup(completed);
        setBootPhase("Preparing sandbox…");
      })
      .catch(() => {});
    // Trial gate: read (or create) the first-launch stamp up front, so an
    // expired install never reaches the picker or the IDE.
    const licenseReady = getLicenseState()
      .then((state) => {
        if (!cancelled) setLicenseState(state);
      })
      .catch(() => {});
    // Sandbox warms detached: every consumer (terminal, agent, git, VS Code)
    // awaits ensureReady internally, so the picker is usable instantly while
    // first-install provisioning finishes in the background. Splash waits
    // only for local settings + config (both fast file reads).
    const sandboxReady = PRootService.ensureReady()
      .catch(() => {})
      .then(() => {
        if (!cancelled && !bootDoneRef.current) setBootPhase("Readying workspace…");
      });
    void sandboxReady;
    Promise.allSettled([settingsReady, licenseReady]).then(() => {
      if (!cancelled) {
        bootDoneRef.current = true;
        setBootDone(true);
      }
    });
    // Safety: never trap the user on the splash if init hangs
    const bootFallback = setTimeout(() => setBootDone(true), 10000);

    const unsubSwitchWs = ideActionService.subscribe("SWITCH_WORKSPACE", ({ workspaceId }) => {
      if (workspaceId) {
        handleOpenWorkspace(workspaceId);
      }
    });
    const unsubConfig = subscribeConfigChanges(() => {});

    return () => {
      cancelled = true;
      clearTimeout(bootFallback);
      unsubSwitchWs();
      unsubConfig();
    };
  }, []);

  // GitHub polling runs only while the app is actually usable — an expired
  // trial must not keep making background calls. The same effect re-checks the
  // trial whenever the app returns to the foreground, so a clock wound back
  // mid-session cannot extend it.
  const trialStatus = licenseState?.status ?? null;
  useEffect(() => {
    if (trialStatus !== "active") {
      stopGithubNotificationPoller();
      return;
    }
    startGithubNotificationPoller();
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      getLicenseState(true)
        .then(setLicenseState)
        .catch(() => {});
    });
    return () => sub.remove();
  }, [trialStatus]);

  // Flip exactly at the deadline even if the app is never backgrounded: the
  // service's memo self-expires, but an idle foreground screen never calls it.
  const licenseExpiresAt = licenseState?.expiresAt ?? 0;
  useEffect(() => {
    if (trialStatus !== "active" || !licenseExpiresAt) return;
    const msUntilDeadline = licenseExpiresAt - Date.now();
    if (msUntilDeadline <= 0) return;
    const timer = setTimeout(() => {
      getLicenseState(true)
        .then(setLicenseState)
        .catch(() => {});
    }, msUntilDeadline + 1000);
    return () => clearTimeout(timer);
  }, [trialStatus, licenseExpiresAt]);

  const handleOpenWorkspace = (workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
    showScreen("editor");
  };

  const trialExpired =
    !!licenseState && licenseState.status === "expired" && !licenseState.unlocked;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ThemeProvider>
          {bootVisible && (
            <AppBootScreen
              isReady={bootDone}
              phase={bootPhase}
              onAnimationEnd={() => setBootVisible(false)}
            />
          )}
          <KeyboardMouseProvider>
            {trialExpired && licenseState ? (
              <TrialExpiredScreen state={licenseState} />
            ) : hasCompletedStartup === false ? (
              <StartupWizard onComplete={() => setHasCompletedStartup(true)} />
            ) : (
              <>
                {currentScreen === "picker" && (
                  <ProjectPicker
                    onOpenWorkspace={handleOpenWorkspace}
                    onRerunStartup={() => setHasCompletedStartup(false)}
                  />
                )}
                {visited.has("editor") && (
                  <View style={[styles.screen, currentScreen !== "editor" && styles.hidden]}>
                    <IDELayout
                      workspaceId={activeWorkspaceId || undefined}
                      onBackToPicker={() => showScreen("picker")}
                      isActive={currentScreen === "editor"}
                    />
                  </View>
                )}
              </>
            )}
          </KeyboardMouseProvider>
          <RepoCloneIndicator />
          <GlobalNotificationBanner />
          <AppDialogHost />
        </ThemeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  hidden: {
    display: "none",
  },
});
