import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons, Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { showAppDialog } from "../../services/appDialog";
import {
  RepoVisibilityInfo,
  getRepoVisibility,
  setRepoVisibility,
} from "../../services/gitCollaboratorsApi";
import {
  visibilityDescription,
  visibilityLabel,
  visibilityPermissionNote,
} from "../../services/gitRepoVisibilityModel";

/**
 * Repository visibility (public / private) for the current workspace's repo.
 *
 * Lives inside GitCollaboratorsModal so "who can reach this repo" is one place:
 * it shows the current state at all times, offers the switch only to
 * admin/owner accounts (per the API's own `permissions` block), and gates the
 * change behind a confirmation that states the real consequence. After a
 * successful change it re-reads the state from the server — it never assumes
 * the change took effect.
 *
 * Pure logic (labels, permission verdict, status-to-sentence) lives in
 * gitRepoVisibilityModel; the network calls live in gitCollaboratorsApi.
 */

interface RepoVisibilitySectionProps {
  visible: boolean;
  owner: string;
  repo: string;
  fullName: string;
}

export function RepoVisibilitySection({ visible, owner, repo, fullName }: RepoVisibilitySectionProps) {
  const { theme } = useTheme();

  const [info, setInfo] = useState<RepoVisibilityInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async (): Promise<RepoVisibilityInfo | null> => {
    setLoading(true);
    setError("");
    const res = await getRepoVisibility(owner, repo);
    const data = res.ok && res.data ? res.data : null;
    if (!data) {
      setInfo(null);
      setError(res.error || "Could not read this repository's visibility.");
    } else {
      setInfo(data);
    }
    setLoading(false);
    return data;
  }, [owner, repo]);

  useEffect(() => {
    if (visible) {
      setNotice("");
      void load();
    }
  }, [visible, load]);

  const applyChange = async (makePrivate: boolean) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const res = await setRepoVisibility(owner, repo, makePrivate);
    if (!res.ok) {
      setBusy(false);
      setError(res.error || "Could not change this repository's visibility.");
      return;
    }
    // Re-read from the server; report success only from what it now says.
    const fresh = await load();
    setBusy(false);
    if (fresh) setNotice(fresh.isPrivate ? "Repository is now private." : "Repository is now public.");
  };

  const confirmChange = (makePrivate: boolean) => {
    showAppDialog({
      title: makePrivate ? "Make this repository private?" : "Make this repository public?",
      message: makePrivate
        ? `Anyone on the internet will lose access to ${fullName}. Going private is not a security boundary for what already left the repo: forks, links others saved, and copies anyone already cloned keep working.`
        : `Everything in ${fullName} becomes visible to everyone on the internet. Anyone will be able to find, read, fork and clone it.`,
      buttons: [
        { text: "Cancel", style: "cancel" },
        {
          text: makePrivate ? "Make private" : "Make public",
          style: "destructive",
          onPress: () => void applyChange(makePrivate),
        },
      ],
    });
  };

  const accentFor = info?.isPrivate ? theme.accentGreen : theme.accentGold;

  return (
    <View style={[styles.section, { borderColor: theme.border, backgroundColor: theme.bgPrimary }]}>
      <View style={styles.sectionHeader}>
        <Octicons name="shield-lock" size={14} color={theme.accent} />
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Repository visibility</Text>
      </View>

      {loading && !info ? (
        <View style={styles.stateBox}>
          <ActivityIndicator size="small" color={theme.accent} />
          <Text style={[styles.stateText, { color: theme.textMuted }]}>Checking visibility…</Text>
        </View>
      ) : !info ? (
        <View style={styles.stateBox}>
          <Ionicons name="alert-circle-outline" size={16} color={theme.accentRed} />
          <Text style={[styles.stateText, { color: theme.accentRed }]}>
            {error || "Could not read this repository's visibility."}
          </Text>
          <TouchableOpacity style={styles.refreshRow} onPress={() => void load()} activeOpacity={0.7}>
            <Ionicons name="refresh" size={13} color={theme.accent} />
            <Text style={[styles.refreshText, { color: theme.accent }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {!!error && (
            <View style={[styles.errorBox, { backgroundColor: `${theme.accentRed}14`, borderColor: `${theme.accentRed}44` }]}>
              <Ionicons name="alert-circle-outline" size={14} color={theme.accentRed} />
              <Text style={[styles.errorText, { color: theme.accentRed }]}>{error}</Text>
            </View>
          )}
          {!!notice && !error && <Text style={[styles.notice, { color: theme.accentGreen }]}>{notice}</Text>}

          {/* Current state — always shown, framed for a person */}
          <View style={[styles.stateRow, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}>
            <Ionicons name={info.isPrivate ? "lock-closed" : "globe-outline"} size={18} color={accentFor} />
            <View style={styles.stateBody}>
              <View style={[styles.badge, { backgroundColor: `${accentFor}22`, borderColor: `${accentFor}55` }]}>
                <Text style={[styles.badgeText, { color: accentFor }]}>{visibilityLabel(info.isPrivate)}</Text>
              </View>
              <Text style={[styles.stateDesc, { color: theme.textSecondary }]}>
                {visibilityDescription(info.isPrivate)}
              </Text>
            </View>
          </View>

          {info.canManage ? (
            <TouchableOpacity
              style={[
                styles.actionBtn,
                { borderColor: accentFor, backgroundColor: `${accentFor}18` },
                busy && { opacity: 0.6 },
              ]}
              onPress={() => confirmChange(!info.isPrivate)}
              disabled={busy}
              activeOpacity={0.8}
            >
              {busy ? (
                <ActivityIndicator size="small" color={accentFor} />
              ) : (
                <Ionicons name={info.isPrivate ? "globe-outline" : "lock-closed"} size={14} color={accentFor} />
              )}
              <Text style={[styles.actionText, { color: accentFor }]}>
                {info.isPrivate ? "Make public" : "Make private"}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.permissionBox, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}>
              <Ionicons name="lock-closed-outline" size={14} color={theme.textMuted} />
              <Text style={[styles.permissionText, { color: theme.textMuted }]}>
                {visibilityPermissionNote(info.canManage)}
              </Text>
            </View>
          )}

          {!busy && (
            <TouchableOpacity style={styles.refreshRow} onPress={() => void load()} activeOpacity={0.7}>
              <Ionicons name="refresh" size={13} color={theme.accent} />
              <Text style={[styles.refreshText, { color: theme.accent }]}>Refresh</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderWidth: 1,
    borderRadius: 9,
    padding: 10,
    gap: 8,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontSize: 12.5, fontWeight: "700" },
  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  stateBody: { flex: 1, gap: 4 },
  badge: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  stateDesc: { fontSize: 11.5, lineHeight: 15 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 38,
    borderWidth: 1,
    borderRadius: 7,
  },
  actionText: { fontSize: 12.5, fontWeight: "700" },
  permissionBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  permissionText: { fontSize: 11, flex: 1, lineHeight: 15 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  errorText: { fontSize: 11.5, flex: 1, lineHeight: 15 },
  notice: { fontSize: 11.5, fontWeight: "600" },
  stateBox: { alignItems: "center", gap: 7, paddingVertical: 16, paddingHorizontal: 8 },
  stateText: { fontSize: 11.5, lineHeight: 16, textAlign: "center" },
  refreshRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 3 },
  refreshText: { fontSize: 11.5, fontWeight: "600" },
});
