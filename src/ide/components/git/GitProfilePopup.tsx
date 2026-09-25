import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Octicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useTheme } from "../../../theme/themeContext";
import {
  fetchMyProfile,
  fetchMyRepos,
  formatStale,
  formatJoined,
  GitHubProfile,
  GitHubRepo,
} from "../../services/gitHubProfileService";
import { logoutGitHub } from "../../services/gitService";

interface GitProfilePopupProps {
  visible: boolean;
  anchor: { x: number; y: number };
  onClose: () => void;
  onSignedOut?: () => void;
  onOpenRemote?: () => void;
}

const SHEET_WIDTH = 320;

type Tab = "profile" | "repos";

/**
 * GitHub account popup anchored to the header avatar (floating, per the
 * standing popup rule). Two views: profile facts, and the user's repos.
 * Read-only data from the device-flow token via gitHubProfileService.
 */
export function GitProfilePopup({ visible, anchor, onClose, onSignedOut, onOpenRemote }: GitProfilePopupProps) {
  const { theme } = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>("profile");
  const [profile, setProfile] = useState<GitHubProfile | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [size, setSize] = useState({ w: SHEET_WIDTH, h: 420 });

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const [p, r] = await Promise.all([fetchMyProfile(), fetchMyRepos()]);
    setProfile(p);
    setRepos(r);
    setLoading(false);
    if (!p) setFailed(true);
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const placeSheet = () => {
    const GAP = 6;
    const EDGE = 8;
    let left = anchor.x - SHEET_WIDTH + 8; // header avatar sits at the right edge
    if (left < EDGE) left = anchor.x + GAP;
    left = Math.max(EDGE, Math.min(left, Math.max(EDGE, winW - size.w - EDGE)));
    let top = anchor.y + GAP;
    if (top + size.h > winH - EDGE) top = anchor.y - size.h - GAP;
    top = Math.max(EDGE, Math.min(top, Math.max(EDGE, winH - size.h - EDGE)));
    return { left, top };
  };

  const openUrl = (url: string) => {
    if (url) WebBrowser.openBrowserAsync(url).catch(() => {});
  };

  const handleSignOut = async () => {
    await logoutGitHub();
    onClose();
    onSignedOut?.();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            placeSheet(),
            { backgroundColor: theme.bgSecondary, borderColor: theme.border },
          ]}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
          }}
        >
          {/* Tabs */}
          <View style={[styles.tabs, { borderBottomColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === "profile" && { borderBottomColor: theme.accent }]}
              onPress={() => setTab("profile")}
            >
              <Text style={[styles.tabText, { color: tab === "profile" ? theme.accent : theme.textSecondary }]}>
                Profile
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === "repos" && { borderBottomColor: theme.accent }]}
              onPress={() => setTab("repos")}
            >
              <Text style={[styles.tabText, { color: tab === "repos" ? theme.accent : theme.textSecondary }]}>
                Repositories{repos ? ` (${repos.length})` : ""}
              </Text>
            </TouchableOpacity>
            <View style={styles.tabsSpacer} />
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Octicons name="x" size={15} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="small" color={theme.accent} />
            </View>
          ) : failed || !profile ? (
            <View style={styles.center}>
              <Text style={[styles.errorText, { color: theme.textSecondary }]}>
                Could not load your GitHub account.
              </Text>
              <TouchableOpacity style={[styles.retryBtn, { borderColor: theme.border }]} onPress={load}>
                <Text style={[styles.retryText, { color: theme.textPrimary }]}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : tab === "profile" ? (
            <View>
              {/* Identity */}
              <View style={styles.identity}>
                {profile.avatarUrl ? (
                  <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
                    <Text style={styles.avatarFallback}>{profile.login.slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.identityText}>
                  {!!profile.name && (
                    <Text style={[styles.displayName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {profile.name}
                    </Text>
                  )}
                  <Text style={[styles.login, { color: theme.textSecondary }]} numberOfLines={1}>
                    @{profile.login}
                  </Text>
                </View>
              </View>

              {/* Stats */}
              <View style={[styles.statsRow, { borderTopColor: theme.border, borderBottomColor: theme.border }]}>
                <Stat label="Repos" value={profile.publicRepos} color={theme.textPrimary} />
                <Stat label="Followers" value={profile.followers} color={theme.textPrimary} />
                <Stat label="Following" value={profile.following} color={theme.textPrimary} />
                <Stat label="Gists" value={profile.publicGists} color={theme.textPrimary} />
              </View>

              <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
                {!!profile.bio && <Text style={[styles.bio, { color: theme.textSecondary }]}>{profile.bio}</Text>}
                <DetailRow icon="briefcase" value={profile.company} color={theme.textSecondary} />
                <DetailRow icon="location" value={profile.location} color={theme.textSecondary} />
                {!!profile.blog && (
                  <TouchableOpacity onPress={() => openUrl(/^https?:\/\//.test(profile.blog) ? profile.blog : `https://${profile.blog}`)}>
                    <DetailRow icon="link" value={profile.blog} color={theme.accent} />
                  </TouchableOpacity>
                )}
                {!!profile.twitterUsername && <DetailRow icon="mention" value={`@${profile.twitterUsername}`} color={theme.textSecondary} />}
                <DetailRow icon="calendar" value={formatJoined(profile.createdAt)} color={theme.textSecondary} />

                <TouchableOpacity
                  style={[styles.linkBtn, { backgroundColor: `${theme.accent}18`, borderColor: `${theme.accent}44` }]}
                  onPress={() => openUrl(profile.htmlUrl)}
                  activeOpacity={0.8}
                >
                  <Octicons name="mark-github" size={14} color={theme.accent} />
                  <Text style={[styles.linkBtnText, { color: theme.accent }]}>View profile on GitHub</Text>
                </TouchableOpacity>
              </ScrollView>

              {onOpenRemote && (
                <TouchableOpacity
                  style={[styles.footerRow, { borderTopColor: theme.border }]}
                  onPress={() => {
                    onClose();
                    onOpenRemote();
                  }}
                  activeOpacity={0.8}
                >
                  <Octicons name="globe" size={13} color={theme.textSecondary} />
                  <Text style={[styles.footerText, { color: theme.textPrimary }]}>Repository remote</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.footerRow, { borderTopColor: theme.border }]}
                onPress={handleSignOut}
                activeOpacity={0.8}
              >
                <Octicons name="sign-out" size={13} color="#f85149" />
                <Text style={styles.signOutText}>Sign out of GitHub</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={styles.repoList} showsVerticalScrollIndicator={false}>
              {repos === null ? (
                <View style={styles.center}>
                  <Text style={[styles.errorText, { color: theme.textSecondary }]}>Could not load repositories.</Text>
                </View>
              ) : repos.length === 0 ? (
                <View style={styles.center}>
                  <Text style={[styles.errorText, { color: theme.textSecondary }]}>No repositories yet.</Text>
                </View>
              ) : (
                repos.map((repo) => (
                  <TouchableOpacity
                    key={repo.id}
                    style={[styles.repoRow, { borderBottomColor: theme.border }]}
                    onPress={() => openUrl(repo.htmlUrl)}
                    activeOpacity={0.7}
                  >
                    <Octicons
                      name={repo.isPrivate ? "lock" : "repo"}
                      size={13}
                      color={theme.textSecondary}
                      style={styles.repoIcon}
                    />
                    <View style={styles.repoBody}>
                      <Text style={[styles.repoName, { color: theme.textPrimary }]} numberOfLines={1}>
                        {repo.name}
                      </Text>
                      {!!repo.description && (
                        <Text style={[styles.repoDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                          {repo.description}
                        </Text>
                      )}
                      <View style={styles.repoMeta}>
                        {!!repo.language && (
                          <Text style={[styles.repoMetaText, { color: theme.accent }]}>{repo.language}</Text>
                        )}
                        {repo.stars > 0 && (
                          <Text style={[styles.repoMetaText, { color: theme.textMuted }]}>★ {repo.stars}</Text>
                        )}
                        {repo.isFork && <Text style={[styles.repoMetaText, { color: theme.textMuted }]}>fork</Text>}
                        <Text style={[styles.repoMetaText, { color: theme.textMuted }]}>{formatStale(repo.updatedAt)}</Text>
                      </View>
                    </View>
                    <Octicons name="chevron-right" size={12} color={theme.textMuted} />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function DetailRow({ icon, value, color }: { icon: string; value: string; color: string }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Octicons name={icon as any} size={13} color={color} />
      <Text style={[styles.detailText, { color }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    position: "absolute",
    width: SHEET_WIDTH,
    maxHeight: "86%",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  tabs: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, gap: 2 },
  tabBtn: { paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText: { fontSize: 12, fontWeight: "700" },
  tabsSpacer: { flex: 1 },
  center: { paddingVertical: 30, alignItems: "center", gap: 10 },
  errorText: { fontSize: 12, textAlign: "center", paddingHorizontal: 20 },
  retryBtn: { borderWidth: 1, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 14 },
  retryText: { fontSize: 12, fontWeight: "700" },
  identity: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#333" },
  avatarFallback: { color: "#fff", fontSize: 22, fontWeight: "800" },
  identityText: { flex: 1, gap: 2 },
  displayName: { fontSize: 15, fontWeight: "800" },
  login: { fontSize: 12.5 },
  statsRow: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  stat: { flex: 1, alignItems: "center", gap: 1 },
  statValue: { fontSize: 14, fontWeight: "800" },
  statLabel: { fontSize: 10, color: "#8a8f98" },
  body: { paddingHorizontal: 14, paddingVertical: 10, maxHeight: 260 },
  bio: { fontSize: 12.5, lineHeight: 18, marginBottom: 8 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  detailText: { fontSize: 12.5, flex: 1 },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    marginBottom: 4,
  },
  linkBtnText: { fontSize: 12.5, fontWeight: "700" },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerText: { fontSize: 12, fontWeight: "600" },
  signOutText: { fontSize: 12, fontWeight: "700", color: "#f85149" },
  repoList: { maxHeight: 400 },
  repoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  repoIcon: { marginTop: 2 },
  repoBody: { flex: 1, gap: 2 },
  repoName: { fontSize: 13, fontWeight: "700" },
  repoDesc: { fontSize: 11.5, lineHeight: 15 },
  repoMeta: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 1 },
  repoMetaText: { fontSize: 10.5 },
});
