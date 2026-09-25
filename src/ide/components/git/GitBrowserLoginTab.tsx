import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { Clipboard } from "../../services/clipboardService";
import {
  startGitHubDeviceFlow,
  waitForDeviceFlowApproval,
  completeGitHubLogin,
  loadGitHubSession,
  ensureGitHubCredentials,
  logoutGitHub,
  GitHubSession,
  DeviceFlowSession,
} from "../../services/gitService";

type Phase = "loading" | "loggedOut" | "busy" | "awaitingApproval" | "loggedIn";

/**
 * GitHub sign-in via device flow (same as gh / VS Code). Astra's public
 * Client ID is built in — zero configuration. The code is shown FIRST with
 * a Copy button; the browser only opens when the user taps the link button,
 * so they always get a chance to read/copy the code before leaving the app.
 */
export function GitBrowserLoginTab({ onSessionChange }: { onSessionChange?: (s: GitHubSession | null) => void }) {
  const { theme } = useTheme();
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<GitHubSession | null>(null);
  const [flow, setFlow] = useState<DeviceFlowSession | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applySession = useCallback(
    (s: GitHubSession | null) => {
      setSession(s);
      onSessionChange?.(s);
    },
    [onSessionChange]
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const sess = await loadGitHubSession();
      if (!alive) return;
      if (sess) {
        applySession(sess);
        setPhase("loggedIn");
        ensureGitHubCredentials().catch(() => {});
      } else {
        setPhase("loggedOut");
      }
    })().catch(() => alive && setPhase("loggedOut"));
    return () => {
      alive = false;
      cancelledRef.current = true;
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, [applySession]);

  const handleSignIn = async () => {
    setError(null);
    setPhase("busy");
    cancelledRef.current = false;
    try {
      const started = await startGitHubDeviceFlow();
      if (cancelledRef.current) return;
      setFlow(started);
      setCopied(false);
      setPhase("awaitingApproval");
    } catch (e: any) {
      setError(e?.message || "Sign-in failed.");
      setPhase("loggedOut");
    }
  };

  /** Polling starts only once the user has sent themselves to the browser. */
  const handleOpenBrowser = async () => {
    if (!flow) return;
    try {
      await WebBrowser.openBrowserAsync(flow.verificationUri);
    } catch (_) {
      // Browser launch failed — still poll; they can open the URL manually.
    }
    const id = flow;
    (async () => {
      try {
        const token = await waitForDeviceFlowApproval(id, () => cancelledRef.current);
        if (token === null) return; // cancelled quietly
        const sess = await completeGitHubLogin(token);
        applySession(sess);
        setPhase("loggedIn");
        setFlow(null);
        Alert.alert("Signed in", `Welcome, ${sess.username}! Push, pull and clone now work with your account.`);
      } catch (e: any) {
        setError(e?.message || "Sign-in failed.");
        setFlow(null);
        setPhase("loggedOut");
      }
    })();
  };

  const handleCopyCode = async () => {
    if (!flow) return;
    await Clipboard.setStringAsync(flow.userCode);
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2500);
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    setFlow(null);
    setCopied(false);
    setPhase("loggedOut");
  };

  const handleLogout = () => {
    Alert.alert("Log out of GitHub?", "Your saved token is deleted and git will stop authenticating as you.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          await logoutGitHub();
          applySession(null);
          setPhase("loggedOut");
        },
      },
    ]);
  };

  if (phase === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color={theme.accent} />
      </View>
    );
  }

  if (phase === "loggedIn" && session) {
    return (
      <View style={styles.container}>
        <View style={[styles.accountCard, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}>
          <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
            <Text style={styles.avatarText}>{session.username.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.accountInfo}>
            <Text style={[styles.username, { color: theme.textPrimary }]}>{session.username}</Text>
            {!!session.email && (
              <Text style={[styles.email, { color: theme.textSecondary }]}>{session.email}</Text>
            )}
            <Text style={[styles.savedNote, { color: theme.textMuted }]}>Account saved on this device</Text>
          </View>
          <Octicons name="check-circle-fill" size={20} color={theme.accent} />
        </View>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: theme.bgTertiary, borderColor: theme.border, borderWidth: 1 }]}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Octicons name="sign-out" size={14} color={theme.textPrimary} />
          <Text style={[styles.actionBtnText, { color: theme.textPrimary }]}>Log out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === "busy") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color={theme.accent} />
      </View>
    );
  }

  if (phase === "awaitingApproval" && flow) {
    return (
      <View style={styles.container}>
        <View style={[styles.codeBox, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}>
          <Text style={[styles.codeHint, { color: theme.textSecondary }]}>
            Your one-time code from GitHub:
          </Text>
          <Text style={[styles.code, { color: theme.textPrimary }]} selectable>
            {flow.userCode}
          </Text>
          <TouchableOpacity
            style={[styles.copyBtn, { backgroundColor: `${theme.accent}22`, borderColor: theme.accent }]}
            onPress={handleCopyCode}
            activeOpacity={0.8}
          >
            <Octicons name={copied ? "check" : "copy"} size={14} color={copied ? theme.accent : theme.textPrimary} />
            <Text style={[styles.copyBtnText, { color: copied ? theme.accent : theme.textPrimary }]}>
              {copied ? "Copied!" : "Copy code"}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.stepText, { color: theme.textSecondary }]}>
          Copy the code, then open GitHub and enter it when asked. The app signs
          you in automatically once you approve.
        </Text>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: theme.accent }]}
          onPress={handleOpenBrowser}
          activeOpacity={0.8}
        >
          <Octicons name="link-external" size={15} color="#fff" />
          <Text style={styles.primaryBtnText}>Open github.com/login/device</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: theme.bgTertiary, borderColor: theme.border, borderWidth: 1 }]}
          onPress={handleCancel}
          activeOpacity={0.8}
        >
          <Octicons name="x" size={14} color={theme.textPrimary} />
          <Text style={[styles.actionBtnText, { color: theme.textPrimary }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!!error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: theme.accent }]}
        onPress={handleSignIn}
        activeOpacity={0.8}
      >
        <Octicons name="mark-github" size={15} color="#fff" />
        <Text style={styles.primaryBtnText}>Sign in with GitHub</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  center: { paddingVertical: 28, alignItems: "center" },
  codeBox: { borderRadius: 8, borderWidth: 1, padding: 14, gap: 10, alignItems: "center" },
  codeHint: { fontSize: 11.5, lineHeight: 16, textAlign: "center" },
  code: { fontSize: 30, fontWeight: "800", fontFamily: "monospace", letterSpacing: 4 },
  copyBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 14,
  },
  copyBtnText: { fontSize: 12, fontWeight: "700" },
  stepText: { fontSize: 11.5, lineHeight: 16, textAlign: "center" },
  error: { fontSize: 11.5, lineHeight: 16, color: "#f85149" },
  actionBtn: {
    height: 38, borderRadius: 6, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4, paddingHorizontal: 12,
  },
  primaryBtnText: { color: "#fff", fontSize: 12.5, fontWeight: "700" },
  actionBtnText: { fontSize: 12.5, fontWeight: "700" },
  accountCard: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderRadius: 8, padding: 10, gap: 10,
  },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  accountInfo: { flex: 1, gap: 1 },
  username: { fontSize: 13, fontWeight: "700" },
  email: { fontSize: 11 },
  savedNote: { fontSize: 10.5 },
});
