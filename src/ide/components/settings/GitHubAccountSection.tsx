import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { ThemeColors } from "../../../theme/themeContext";
import { SettingsSectionHeader } from "./SettingsSectionHeader";
import { SettingsOptionCard } from "./SettingsOptionCard";
import { GitHubAccountProfile } from "./GitHubAccountProfile";
import { withTimeout } from "./withTimeout";
import { Clipboard } from "../../services/clipboardService";
import {
  startGitHubDeviceFlow,
  waitForDeviceFlowApproval,
  completeGitHubLogin,
  loadGitHubSession,
  GitHubSession,
  DeviceFlowSession,
} from "../../services/gitService";

/**
 * GitHub account (Settings -> GitHub).
 *
 * Reuses the app's ONE GitHub sign-in — the device flow in gitHubAuthService,
 * surfaced through gitService exactly as the Git tab's login tab does: show the
 * 8-character code, open github.com/login/device, poll until approved, then
 * persist the session. No second auth path, no client secret, no new
 * dependency. Signed in, the body is GitHubAccountProfile (avatar, @login,
 * name, counts, repos, sign-out).
 *
 * Both spurts of network work — starting the flow and loading the session — are
 * bounded so a spinner can never stay up forever.
 */

type Phase = "loading" | "signedOut" | "starting" | "awaiting" | "signedIn";

/** A hung device-code request must not leave "Contacting GitHub…" forever. */
const FLOW_START_TIMEOUT_MS = 20000;
/** The saved session is a local config read; bound it all the same. */
const SESSION_TIMEOUT_MS = 8000;
const COPIED_RESET_MS = 2500;

export function GitHubAccountSection({ theme }: { theme: ThemeColors }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<GitHubSession | null>(null);
  const [flow, setFlow] = useState<DeviceFlowSession | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const aliveRef = useRef(true);
  const pollingRef = useRef(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the saved session once. A timeout (or a read failure) degrades to
  // signed-out rather than a stuck spinner.
  useEffect(() => {
    let alive = true;
    aliveRef.current = true;
    (async () => {
      let sess: GitHubSession | null = null;
      try {
        sess = await withTimeout(loadGitHubSession(), SESSION_TIMEOUT_MS);
      } catch (_) {
        sess = null;
      }
      if (!alive) return;
      if (sess) {
        setSession(sess);
        setPhase("signedIn");
      } else {
        setPhase("signedOut");
      }
    })();
    return () => {
      alive = false;
      aliveRef.current = false;
      cancelledRef.current = true;
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const handleSignIn = useCallback(async () => {
    setError(null);
    setPhase("starting");
    cancelledRef.current = false;
    try {
      const started = await withTimeout(startGitHubDeviceFlow(), FLOW_START_TIMEOUT_MS);
      if (cancelledRef.current || !aliveRef.current) return;
      setFlow(started);
      setCopied(false);
      setPhase("awaiting");
    } catch (_) {
      if (!aliveRef.current) return;
      setError("Couldn't reach GitHub. Check your connection and try again.");
      setPhase("signedOut");
    }
  }, []);

  /** Polling starts only once the user has been sent to the browser. */
  const handleOpenBrowser = useCallback(async () => {
    if (!flow) return;
    try {
      await WebBrowser.openBrowserAsync(flow.verificationUri);
    } catch (_) {
      // Browser launch failed — still poll; the URL can be opened by hand.
    }
    // A second tap just re-opens the browser: only one poll runs, so approval
    // cannot be consumed twice (two polls racing is how a sign-in both
    // succeeds and "fails" at once).
    if (pollingRef.current) return;
    pollingRef.current = true;
    const id = flow;
    try {
      const token = await waitForDeviceFlowApproval(id, () => cancelledRef.current);
      if (token === null) return; // cancelled quietly
      const sess = await completeGitHubLogin(token);
      if (!aliveRef.current) return;
      setSession(sess);
      setFlow(null);
      setPhase("signedIn");
    } catch (e: any) {
      if (!aliveRef.current) return;
      setError(e?.message || "Sign-in failed.");
      setFlow(null);
      setPhase("signedOut");
    } finally {
      pollingRef.current = false;
    }
  }, [flow]);

  const handleCopyCode = useCallback(async () => {
    if (!flow) return;
    try {
      await Clipboard.setStringAsync(flow.userCode);
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch (_) {
      // Clipboard unavailable: the code below is selectable, so it can be copied by hand.
    }
  }, [flow]);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    setFlow(null);
    setCopied(false);
    setPhase("signedOut");
  }, []);

  const handleSignedOut = useCallback(() => {
    setSession(null);
    setError(null);
    setFlow(null);
    setPhase("signedOut");
  }, []);

  if (phase === "loading") {
    return (
      <View style={styles.container}>
        <SettingsSectionHeader
          theme={theme}
          icon="logo-github"
          title="GitHub Account"
          subtitle="Your GitHub profile and repositories."
        />
        <View style={styles.stateRow}>
          <ActivityIndicator size="small" color={theme.accent} />
        </View>
      </View>
    );
  }

  if (phase === "signedIn" && session) {
    return (
      <View style={styles.container}>
        <SettingsSectionHeader
          theme={theme}
          icon="logo-github"
          title="GitHub Account"
          subtitle="Signed in with GitHub on this device."
        />
        <GitHubAccountProfile theme={theme} session={session} onSignedOut={handleSignedOut} />
      </View>
    );
  }

  if (phase === "starting" || phase === "awaiting") {
    return (
      <View style={styles.container}>
        <SettingsSectionHeader
          theme={theme}
          icon="logo-github"
          title="GitHub Account"
          subtitle="Signing in with GitHub."
        />
        {phase === "starting" ? (
          <View style={styles.stateRow}>
            <ActivityIndicator size="small" color={theme.accent} />
            <Text style={[styles.stateText, { color: theme.textMuted }]}>Contacting GitHub…</Text>
          </View>
        ) : flow ? (
          <>
            <View style={[styles.codeBox, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
              <Text style={[styles.codeHint, { color: theme.textSecondary }]}>Your one-time code from GitHub:</Text>
              <Text style={[styles.code, { color: theme.textPrimary }]} selectable>
                {flow.userCode}
              </Text>
              <TouchableOpacity
                style={[styles.copyBtn, { backgroundColor: `${theme.accent}22`, borderColor: theme.accent }]}
                onPress={handleCopyCode}
                activeOpacity={0.8}
              >
                <Ionicons name={copied ? "checkmark" : "copy-outline"} size={13} color={copied ? theme.accent : theme.textPrimary} />
                <Text style={[styles.copyBtnText, { color: copied ? theme.accent : theme.textPrimary }]}>
                  {copied ? "Copied" : "Copy code"}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.stepText, { color: theme.textSecondary }]}>
              Copy the code, then open GitHub and enter it when asked. This screen signs you in automatically once
              you approve.
            </Text>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
              onPress={handleOpenBrowser}
              activeOpacity={0.8}
            >
              <Ionicons name="open-outline" size={14} color={theme.sendButtonIcon} />
              <Text style={[styles.primaryBtnText, { color: theme.sendButtonIcon }]}>Open github.com/login/device</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}
              onPress={handleCancel}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={14} color={theme.textPrimary} />
              <Text style={[styles.secondaryBtnText, { color: theme.textPrimary }]}>Cancel</Text>
            </TouchableOpacity>

            {!!error && <Text style={[styles.errorText, { color: theme.accentRed }]}>{error}</Text>}
          </>
        ) : null}
      </View>
    );
  }

  // Signed out: one sign-in row plus what it is for.
  return (
    <View style={styles.container}>
      <SettingsSectionHeader
        theme={theme}
        icon="logo-github"
        title="GitHub Account"
        subtitle="Sign in to browse your repositories."
      />
      <SettingsOptionCard
        theme={theme}
        icon="logo-github"
        title="Sign in with GitHub"
        subtitle="A one-time code is shown; approve it on github.com."
        control="chevron"
        onPress={handleSignIn}
      />
      <Text style={[styles.noteText, { color: theme.textMuted }]}>
        Your GitHub account links git pushes, pulls and clones to you, and shows your profile and repositories here.
      </Text>
      {!!error && <Text style={[styles.errorText, { color: theme.accentRed }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, paddingBottom: 8 },
  stateRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 2 },
  stateText: { fontSize: 11.5 },
  codeBox: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10, alignItems: "center" },
  codeHint: { fontSize: 11.5, lineHeight: 16, textAlign: "center" },
  code: { fontSize: 30, fontWeight: "800", fontFamily: "monospace", letterSpacing: 4 },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  copyBtnText: { fontSize: 12, fontWeight: "700" },
  stepText: { fontSize: 11.5, lineHeight: 16, textAlign: "center" },
  primaryBtn: {
    height: 40,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  primaryBtnText: { fontSize: 12.5, fontWeight: "700" },
  secondaryBtn: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  secondaryBtnText: { fontSize: 12.5, fontWeight: "700" },
  noteText: { fontSize: 10.5, lineHeight: 14, paddingHorizontal: 2 },
  errorText: { fontSize: 11, lineHeight: 15, paddingHorizontal: 2 },
});
