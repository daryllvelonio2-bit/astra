import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useKeyboardMouseMode } from "../../context/KeyboardMouseContext";
import { Clipboard } from "../../services/clipboardService";
import {
  GITHUB_REDIRECT_URI,
  signInWithBrowser,
  completeGitHubLogin,
  loadGitHubSession,
  loadGitHubAppCredentials,
  saveGitHubAppCredentials,
  resolveClientSecret,
  ensureGitHubCredentials,
  logoutGitHub,
  GitHubSession,
} from "../../services/gitService";

type Phase = "loading" | "loggedOut" | "busy" | "loggedIn";

export function GitBrowserLoginTab({ onSessionChange }: { onSessionChange?: (s: GitHubSession | null) => void }) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const [phase, setPhase] = useState<Phase>("loading");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [secretSaved, setSecretSaved] = useState(false);
  const [session, setSession] = useState<GitHubSession | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const [creds, sess] = await Promise.all([loadGitHubAppCredentials(), loadGitHubSession()]);
      if (!alive) return;
      setClientId(creds.clientId);
      setSecretSaved(creds.hasSecret);
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
    };
  }, [applySession]);

  const handleSignIn = async () => {
    setError(null);
    if (!clientId.trim()) {
      setError("Paste your OAuth App Client ID first (one-time setup, see below).");
      return;
    }
    const secret = await resolveClientSecret(clientSecret);
    if (!secret) {
      setError("Paste your OAuth App Client Secret first (one-time setup, see below).");
      return;
    }
    setPhase("busy");
    try {
      const token = await signInWithBrowser(clientId, secret);
      await saveGitHubAppCredentials(clientId, clientSecret);
      setSecretSaved(true);
      setClientSecret("");
      const sess = await completeGitHubLogin(token);
      applySession(sess);
      setPhase("loggedIn");
      Alert.alert("Signed in", `Welcome, ${sess.username}! Push, pull and clone now work with your account.`);
    } catch (e: any) {
      setError(e?.message || "Sign-in failed.");
      setPhase("loggedOut");
    }
  };

  const handleCopyCallback = async () => {
    await Clipboard.setStringAsync(GITHUB_REDIRECT_URI);
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

  const inputProps = {
    autoCapitalize: "none" as const,
    autoCorrect: false,
    showSoftInputOnFocus: !keyboardMouseMode,
  };

  return (
    <View style={styles.container}>
      <View style={[styles.infoBox, { backgroundColor: `${theme.accent}12`, borderColor: `${theme.accent}33` }]}>
        <Text style={[styles.infoTitle, { color: theme.accent }]}>One-tap browser login</Text>
        <Text style={[styles.infoBody, { color: theme.textSecondary }]}>
          One-time setup: github.com → Settings → Developer settings → OAuth Apps → New OAuth App.
          Name it Astra, homepage URL can be anything, Authorization callback URL must be exactly:
        </Text>
        <TouchableOpacity
          style={[styles.callbackBox, { backgroundColor: theme.bgTertiary }]}
          onPress={handleCopyCallback}
          activeOpacity={0.8}
        >
          <Text style={[styles.callback, { color: theme.textPrimary }]}>{GITHUB_REDIRECT_URI}</Text>
          <Text style={[styles.copyHint, { color: theme.textMuted }]}>Tap to copy</Text>
        </TouchableOpacity>
        <Text style={[styles.infoBody, { color: theme.textSecondary }]}>
          Paste the Client ID + Client Secret below once. After that, Sign in is a single tap:
          browser opens, you approve, and you're back in the app logged in.
        </Text>
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Client ID (saved)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.bgTertiary, borderColor: theme.border, color: theme.textPrimary }]}
          placeholder="e.g. Ov23liXXXXXXXXXXXX"
          placeholderTextColor={theme.textMuted}
          value={clientId}
          onChangeText={setClientId}
          {...inputProps}
        />
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          Client Secret {secretSaved && !clientSecret ? "(saved)" : "(saved on first sign-in)"}
        </Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.bgTertiary, borderColor: theme.border, color: theme.textPrimary }]}
          placeholder={secretSaved ? "Saved — leave empty to reuse" : "Paste secret once"}
          placeholderTextColor={theme.textMuted}
          value={clientSecret}
          onChangeText={setClientSecret}
          secureTextEntry
          {...inputProps}
        />
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: theme.accent }]}
        onPress={handleSignIn}
        disabled={phase === "busy"}
        activeOpacity={0.8}
      >
        {phase === "busy" ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Octicons name="mark-github" size={15} color="#fff" />
            <Text style={styles.primaryBtnText}>Sign in with GitHub</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  center: { paddingVertical: 28, alignItems: "center" },
  infoBox: { padding: 10, borderRadius: 8, borderWidth: 1, gap: 6 },
  infoTitle: { fontSize: 12, fontWeight: "700" },
  infoBody: { fontSize: 11, lineHeight: 15 },
  callbackBox: { borderRadius: 6, paddingVertical: 7, paddingHorizontal: 10, gap: 1 },
  callback: { fontSize: 11.5, fontFamily: "monospace", fontWeight: "700" },
  copyHint: { fontSize: 10 },
  field: { gap: 4 },
  label: { fontSize: 11.5, fontWeight: "600" },
  input: { height: 36, borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, fontSize: 12 },
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
