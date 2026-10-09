import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
 * Repository visibility (public / private) body inside RepoVisibilityModal.
 *
 * Styled to the collaborators modal — NOT to the settings cards. The current
 * state is a row with the SAME anatomy as a collaborator row (leading
 * circular icon in the avatar slot, a bold name line, a muted secondary line,
 * and a trailing badge), the change control uses the collaborators "Add"
 * button metrics, and the states/notices reuse the collaborators
 * error/empty/refresh treatments. Nothing new is invented: the pieces are the
 * sibling modal's own pieces.
 *
 * It shows the current state at all times, offers the switch only to
 * admin/owner accounts (per the API's own `permissions` block), and gates the
 * change behind a confirmation that names the real consequence. After a
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
        ? `Going private hides ${fullName}, but forks, saved links and existing clones keep working — it is not a security boundary.`
        : `Everyone on the internet can then find, read, fork and clone ${fullName}.`,
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

  if (loading && !info) {
    return (
      <View style={styles.stateBox}>
        <ActivityIndicator size="small" color={theme.accent} />
        <Text style={[styles.stateText, { color: theme.textMuted }]}>Checking visibility…</Text>
      </View>
    );
  }

  if (!info) {
    return (
      <View style={styles.stateBox}>
        <Ionicons name="alert-circle-outline" size={18} color={theme.accentRed} />
        <Text style={[styles.stateText, { color: theme.accentRed }]}>
          {error || "Could not read this repository's visibility."}
        </Text>
        <TouchableOpacity style={styles.refreshRow} onPress={() => void load()} activeOpacity={0.7}>
          <Ionicons name="refresh" size={13} color={theme.accent} />
          <Text style={[styles.refreshText, { color: theme.accent }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Same muted count line the collaborators list sits under */}
      <Text style={[styles.countLine, { color: theme.textMuted }]}>Who can reach this repository</Text>

      {/* Current state — what it is, right now: the strongest element, shaped
          exactly like one collaborator row (leading icon, name, secondary
          line, trailing badge). */}
      <View style={[styles.row, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
        <View
          style={[styles.avatar, styles.stateIcon, { backgroundColor: `${accentFor}22`, borderColor: `${accentFor}55` }]}
        >
          <Ionicons name={info.isPrivate ? "lock-closed" : "globe-outline"} size={15} color={accentFor} />
        </View>
        <View style={styles.rowBody}>
          <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
            {info.isPrivate ? "Private" : "Public"}
          </Text>
          <Text style={[styles.hint, { color: theme.textMuted }]} numberOfLines={2}>
            {visibilityDescription(info.isPrivate)}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: `${accentFor}22`, borderColor: `${accentFor}55` }]}>
          <Text style={[styles.badgeText, { color: accentFor }]}>{visibilityLabel(info.isPrivate)}</Text>
        </View>
      </View>

      {/* The one change action — admins/owners only, same button metrics as Add */}
      {info.canManage ? (
        <TouchableOpacity
          style={[
            styles.actionBtn,
            { backgroundColor: accentFor, borderColor: accentFor },
            busy && { opacity: 0.6 },
          ]}
          onPress={() => confirmChange(!info.isPrivate)}
          disabled={busy}
          activeOpacity={0.8}
        >
          {busy ? (
            <ActivityIndicator size="small" color={theme.sendButtonIcon} />
          ) : (
            <Ionicons name={info.isPrivate ? "globe-outline" : "lock-closed"} size={14} color={theme.sendButtonIcon} />
          )}
          <Text style={[styles.actionText, { color: theme.sendButtonIcon }]}>
            {info.isPrivate ? "Make public" : "Make private"}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.noteRow}>
          <Ionicons name="lock-closed-outline" size={14} color={theme.textMuted} />
          <Text style={[styles.hint, styles.noteText, { color: theme.textMuted }]}>
            {visibilityPermissionNote(info.canManage)}
          </Text>
        </View>
      )}

      {!!error && (
        <View style={[styles.errorBox, { backgroundColor: `${theme.accentRed}14`, borderColor: `${theme.accentRed}44` }]}>
          <Ionicons name="alert-circle-outline" size={14} color={theme.accentRed} />
          <Text style={[styles.errorText, { color: theme.accentRed }]}>{error}</Text>
        </View>
      )}
      {!!notice && !error && (
        <Text style={[styles.notice, { color: theme.accentGreen }]}>{notice}</Text>
      )}

      {!busy && (
        <TouchableOpacity style={styles.refreshRow} onPress={() => void load()} activeOpacity={0.7}>
          <Ionicons name="refresh" size={13} color={theme.accent} />
          <Text style={[styles.refreshText, { color: theme.accent }]}>Refresh</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// Metrics below are copied from GitCollaboratorsModal's own styles so the two
// modals share one visual language (row, avatar, badge, button, error/empty,
// refresh). They are mirrored, not imported, because that file's styles are
// module-private to a different feature.
const styles = StyleSheet.create({
  root: { gap: 10 },
  countLine: { fontSize: 10.5 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  avatar: { width: 30, height: 30, borderRadius: 15, borderWidth: 1 },
  stateIcon: { alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, gap: 3 },
  name: { fontSize: 12.5, fontWeight: "700" },
  hint: { fontSize: 10.5, lineHeight: 14 },
  badge: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontSize: 9.5, fontWeight: "700" },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 36,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
  },
  actionText: { fontSize: 12.5, fontWeight: "700" },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  noteText: { fontSize: 11.5, lineHeight: 15, flex: 1 },
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
  stateBox: { alignItems: "center", gap: 7, paddingVertical: 24, paddingHorizontal: 8 },
  stateText: { fontSize: 11.5, lineHeight: 16, textAlign: "center" },
  refreshRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 4 },
  refreshText: { fontSize: 11.5, fontWeight: "600" },
});
