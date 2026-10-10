import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";
import { SettingsSectionHeader } from "./SettingsSectionHeader";
import { SettingsOptionCard } from "./SettingsOptionCard";
import { withTimeout } from "./withTimeout";
import { showAppDialog } from "../../services/appDialog";
import { fetchUserProfile } from "../../services/gitHubAccountService";
import { GitHubUserDetail } from "../../services/gitHubTypes";
import { logoutGitHub, GitHubSession } from "../../services/gitService";

/**
 * The signed-in body of the GitHub account section (Settings -> GitHub):
 * identity, the public counts and sign-out - a profile card, not a repo browser.
 *
 * Everything here reuses the app's existing GitHub data paths — no second auth
 * path and no new dependency:
 *  - `fetchUserProfile` (gitHubAccountService -> gitHubApi) reads the saved
 *    token itself and returns the profile; the token never reaches this file.
 *  - `logoutGitHub` (gitHubAuthService) is the same sign-out the Git tab uses.
 * The avatar URL is the only credential-adjacent value shown and it is a public
 * image URL; no token or credential is rendered anywhere.
 */

/** A hung request must not leave the section spinning — fail it and offer Retry. */
const LOAD_TIMEOUT_MS = 15000;
/** The Settings ScrollView is not virtualized, so cap the rows rendered. */

/** Owner avatar with an initials fallback so a slow/absent image never blanks. */
function Avatar({ uri, login, size, theme }: { uri?: string; login: string; size: number; theme: ThemeColors }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[box, styles.avatarImg, { borderColor: theme.border, backgroundColor: theme.bgTertiary }]}
      />
    );
  }
  return (
    <View style={[box, styles.avatarFallback, { backgroundColor: `${theme.accent}22` }]}>
      <Text style={[styles.avatarLetter, { color: theme.accent }]}>{(login || "?").slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

/** One public counter; `k` shorthand past 1000 so the row never overflows. */
function Stat({ label, value, theme }: { label: string; value: number; theme: ThemeColors }) {
  const shown = value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: theme.textPrimary }]}>{shown}</Text>
      <Text style={[styles.statLabel, { color: theme.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Explicit public/private badge — private is gold (lock), public is muted. */

function InlineError({ text, theme, onRetry }: { text: string; theme: ThemeColors; onRetry: () => void }) {
  return (
    <View style={styles.errorRow}>
      <Ionicons name="alert-circle-outline" size={14} color={theme.accentRed} />
      <Text style={[styles.errorText, { color: theme.accentRed }]}>{text}</Text>
      <TouchableOpacity onPress={onRetry} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={[styles.retryText, { color: theme.accent }]}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

export function GitHubAccountProfile({
  theme,
  session,
  onSignedOut,
}: {
  theme: ThemeColors;
  session: GitHubSession;
  /** Called after the token is cleared, so the container returns to signed-out. */
  onSignedOut: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<GitHubUserDetail | null>(null);
  const [profileError, setProfileError] = useState("");
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setProfileError("");
    try {
      // Read the results defensively: this project's tsconfig does not narrow
      // boolean-literal unions, so `res.error` on an `ok: true` branch is a
      // type error — the same treatment MyReposList uses.
      const profileRes = await withTimeout(fetchUserProfile(), LOAD_TIMEOUT_MS);
      if (!alive.current) return;
      const p: any = profileRes;
      if (p && p.ok) {
        setProfile(p.data);
      } else {
        setProfile(null);
        setProfileError((p && p.error && p.error.message) || "Could not load your GitHub profile.");
      }
    } catch (_) {
      if (!alive.current) return;
      setProfile(null);
      setProfileError("Loading your GitHub profile timed out.");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);


  const confirmSignOut = useCallback(() => {
    showAppDialog({
      title: "Sign out of GitHub?",
      message: "The saved token is removed from this device and git stops authenticating as you.",
      buttons: [
        { text: "Stay signed in", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            // Clears the stored token, removes ~/.git-credentials, drops the
            // memoized token cache — the existing sign-out path, verbatim.
            try {
              await logoutGitHub();
            } catch (_) {
              // Even if the guest cleanup fails, the local session is cleared
              // below, so the section always returns to signed-out.
            }
            onSignedOut();
          },
        },
      ],
    });
  }, [onSignedOut]);

  const name = profile?.name || "";
  const avatarUri = profile?.avatarUrl || session.avatarUrl;

  return (
    <View style={styles.container}>
      {/* Identity — available from the saved session before the API answers. */}
      <View style={[styles.profileCard, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
        <Avatar uri={avatarUri} login={session.username} size={44} theme={theme} />
        <View style={styles.profileText}>
          {!!name && (
            <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
              {name}
            </Text>
          )}
          <Text style={[styles.handle, { color: theme.textSecondary }]} numberOfLines={1}>
            @{session.username}
          </Text>
        </View>
        {loading && <ActivityIndicator size="small" color={theme.accent} />}
      </View>

      {/* Public counts */}
      {profile ? (
        <View style={[styles.statsRow, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
          <Stat label="Repositories" value={profile.publicRepos} theme={theme} />
          <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
          <Stat label="Followers" value={profile.followers} theme={theme} />
          <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
          <Stat label="Following" value={profile.following} theme={theme} />
        </View>
      ) : profileError ? (
        <InlineError text={profileError} theme={theme} onRetry={() => void load()} />
      ) : null}

      {/* Sign out */}
      <SettingsSectionHeader
        theme={theme}
        icon="log-out-outline"
        title="Session"
        subtitle="Sign out on this device."
      />
      <SettingsOptionCard
        theme={theme}
        icon="log-out-outline"
        title="Sign out of GitHub"
        subtitle="Removes the saved token from this device."
        control="chevron"
        onPress={confirmSignOut}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, paddingBottom: 8 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  avatarImg: { borderWidth: 1 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarLetter: { fontSize: 16, fontWeight: "800" },
  profileText: { flex: 1, gap: 2 },
  name: { fontSize: 13.5, fontWeight: "800" },
  handle: { fontSize: 11.5 },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
  },
  stat: { flex: 1, alignItems: "center", gap: 1 },
  statValue: { fontSize: 14, fontWeight: "800" },
  statLabel: { fontSize: 9.5 },
  statDivider: { width: 1, alignSelf: "stretch" },
  repoList: { gap: 8 },
  repoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  repoBody: { flex: 1, gap: 4 },
  repoName: { fontSize: 12.5, fontWeight: "700" },
  repoMeta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  repoMetaText: { fontSize: 10.5 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  pillText: { fontSize: 9.5, fontWeight: "700" },
  stateRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 2 },
  stateText: { fontSize: 11, lineHeight: 15 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 2 },
  errorText: { flex: 1, fontSize: 11, lineHeight: 15 },
  retryText: { fontSize: 11.5, fontWeight: "700" },
});
