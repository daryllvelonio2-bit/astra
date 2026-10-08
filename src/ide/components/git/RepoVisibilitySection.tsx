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
 * Repository visibility (public / private) for the current workspace's repo,
 * rendered as flat body content inside RepoVisibilityModal (this file is the
 * feature's UI; the modal provides only the shared shell).
 *
 * Flat by design: no bordered card inside the modal shell and no second
 * heading — the modal header is the only title. The current state and the one
 * change action carry the visual weight; descriptions stay muted and short.
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
      {/* Current state — what it is, right now: the strongest element */}
      <View style={styles.stateBlock}>
        <Ionicons name={info.isPrivate ? "lock-closed" : "globe-outline"} size={28} color={accentFor} />
        <View style={styles.stateBody}>
          <Text style={[styles.stateBadge, { color: accentFor }]}>{visibilityLabel(info.isPrivate)}</Text>
          <Text style={[styles.stateDesc, { color: theme.textSecondary }]}>
            {visibilityDescription(info.isPrivate)}
          </Text>
        </View>
      </View>

      {/* The one change action — admins/owners only */}
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
            <Ionicons name={info.isPrivate ? "globe-outline" : "lock-closed"} size={16} color={accentFor} />
          )}
          <Text style={[styles.actionText, { color: accentFor }]}>
            {info.isPrivate ? "Make public" : "Make private"}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.inlineNote}>
          <Ionicons name="lock-closed-outline" size={14} color={theme.textMuted} />
          <Text style={[styles.inlineNoteText, { color: theme.textMuted }]}>
            {visibilityPermissionNote(info.canManage)}
          </Text>
        </View>
      )}

      {!!error && (
        <View style={styles.inlineNote}>
          <Ionicons name="alert-circle-outline" size={14} color={theme.accentRed} />
          <Text style={[styles.inlineNoteText, { color: theme.accentRed }]}>{error}</Text>
        </View>
      )}
      {!!notice && !error && (
        <View style={styles.inlineNote}>
          <Ionicons name="checkmark-circle-outline" size={14} color={theme.accentGreen} />
          <Text style={[styles.inlineNoteText, { color: theme.accentGreen }]}>{notice}</Text>
        </View>
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

const styles = StyleSheet.create({
  root: { gap: 12 },
  stateBlock: { flexDirection: "row", alignItems: "center", gap: 12 },
  stateBody: { flex: 1, gap: 2 },
  stateBadge: { fontSize: 20, fontWeight: "800", letterSpacing: 0.5 },
  stateDesc: { fontSize: 11.5, lineHeight: 15 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
  },
  actionText: { fontSize: 14, fontWeight: "800" },
  inlineNote: { flexDirection: "row", alignItems: "center", gap: 7 },
  inlineNoteText: { fontSize: 11.5, flex: 1, lineHeight: 15 },
  stateBox: { alignItems: "center", gap: 8, paddingVertical: 20, paddingHorizontal: 8 },
  stateText: { fontSize: 11.5, lineHeight: 16, textAlign: "center" },
  refreshRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 2 },
  refreshText: { fontSize: 11.5, fontWeight: "600" },
});
