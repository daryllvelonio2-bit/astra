import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Image,
} from "react-native";
import { Ionicons, Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useAccurateKeyboard } from "../../../theme/useAccurateKeyboard";
import { useKeyboardMouseMode } from "../../context/KeyboardMouseContext";
import { showAppDialog } from "../../services/appDialog";
import {
  CollaboratorRow,
  addCollaborator,
  cancelInvitation,
  listRepoAccess,
  parseRepoFullName,
  removeCollaborator,
} from "../../services/gitCollaboratorsApi";
import { canRemoveRow, isPendingRow, repoFullName } from "../../services/gitCollaboratorModel";

/**
 * Repository collaborators for the current workspace: who has access, who has
 * a pending invite, and inline add by username / remove with confirmation.
 * The repo (owner/repo) is shown at the top so an invite can never go to the
 * wrong repository.
 *
 * The remote URL comes from the workspace's git origin (same source the rest
 * of the Git tab uses) and is parsed with the shared parseRepoFullName helper.
 */

interface GitCollaboratorsModalProps {
  visible: boolean;
  remoteUrl: string | null;
  onClose: () => void;
}

export function GitCollaboratorsModal({ visible, remoteUrl, onClose }: GitCollaboratorsModalProps) {
  const { theme } = useTheme();
  const { isKeyboardVisible, keyboardOffset } = useAccurateKeyboard(12);
  const { keyboardMouseMode } = useKeyboardMouseMode();

  const ref = parseRepoFullName(remoteUrl);
  const fullName = repoFullName(ref);

  const [rows, setRows] = useState<CollaboratorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!ref) return;
    setLoading(true);
    setError("");
    const res = await listRepoAccess(ref.owner, ref.repo);
    if (!res.ok) {
      setRows([]);
      setError(res.error || "Could not load collaborators.");
    } else {
      setRows([...res.collaborators, ...res.invitations]);
    }
    setLoading(false);
  }, [ref?.owner, ref?.repo]);

  useEffect(() => {
    if (visible) {
      setNotice("");
      void load();
    }
  }, [visible, load]);

  const handleAdd = async () => {
    const user = username.trim().replace(/^@/, "");
    if (!ref || !user || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const res = await addCollaborator(ref.owner, ref.repo, user);
    if (!res.ok) {
      setBusy(false);
      setError(res.error || "Could not add that collaborator.");
      return;
    }
    setUsername("");
    await load();
    setBusy(false);
    setNotice(res.invited ? `Invitation sent to ${user}.` : `${user} is already a collaborator.`);
  };

  const doRemove = async (row: CollaboratorRow) => {
    if (!ref) return;
    setBusy(true);
    setError("");
    setNotice("");
    // Route by row kind: a pending invitee is not a collaborator yet, so the
    // collaborators DELETE does nothing for them — cancelling needs the
    // invitations endpoint with the row's own invitation id.
    const pending = isPendingRow(row);
    const res = pending
      ? await cancelInvitation(ref.owner, ref.repo, row.invitationId as number)
      : await removeCollaborator(ref.owner, ref.repo, row.login);
    if (!res.ok) {
      setBusy(false);
      setError(res.error || (pending ? "Could not cancel that invitation." : "Could not remove that collaborator."));
      return;
    }
    // Re-read from the server so the list shown is provably the live state,
    // not just the row we guessed we removed.
    await load();
    setBusy(false);
    setNotice(pending ? `Invitation for ${row.login} cancelled.` : `${row.login} removed.`);
  };

  const confirmRemove = (row: CollaboratorRow) => {
    const pending = isPendingRow(row);
    showAppDialog({
      title: pending ? "Cancel invitation?" : `Remove ${row.login}?`,
      message: pending
        ? `${row.login} will no longer be invited to ${fullName}.`
        : `${row.login} will lose access to ${fullName}.`,
      buttons: [
        { text: "Cancel", style: "cancel" },
        {
          text: pending ? "Cancel invite" : "Remove",
          style: "destructive",
          onPress: () => void doRemove(row),
        },
      ],
    });
  };

  const renderRow = ({ item }: { item: CollaboratorRow }) => (
    <View style={[styles.row, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
      {item.avatarUrl ? (
        <Image source={{ uri: item.avatarUrl }} style={[styles.avatar, { borderColor: theme.border }]} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.accent, borderColor: theme.border }]}>
          <Text style={[styles.avatarLetter, { color: theme.sendButtonIcon }]}>
            {(item.login || "?").slice(0, 1).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.rowBody}>
        <Text style={[styles.login, { color: theme.textPrimary }]} numberOfLines={1}>
          {item.login || "(unknown)"}
        </Text>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: `${theme.accent}22`, borderColor: `${theme.accent}55` }]}>
            <Text style={[styles.badgeText, { color: theme.accent }]}>{item.permissionLabel}</Text>
          </View>
          {isPendingRow(item) && (
            <View style={[styles.badge, { backgroundColor: `${theme.accentGold}22`, borderColor: `${theme.accentGold}55` }]}>
              <Text style={[styles.badgeText, { color: theme.accentGold }]}>pending invite</Text>
            </View>
          )}
        </View>
      </View>
      {/* No removal unless it can actually work: a pending row with no id cannot be cancelled. */}
      {canRemoveRow(item) && (
        <TouchableOpacity
          style={styles.removeBtn}
          onPress={() => confirmRemove(item)}
          disabled={busy}
          accessibilityLabel={isPendingRow(item) ? `Cancel invitation for ${item.login}` : `Remove ${item.login}`}
        >
          <Octicons name="trash" size={14} color={theme.accentRed} />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: theme.overlay }, isKeyboardVisible && { paddingBottom: keyboardOffset }]}>
        <View style={[styles.modalCard, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <Octicons name="people" size={16} color={theme.accent} />
            <Text style={[styles.title, { color: theme.textPrimary }]}>Collaborators</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Acting repo — pinned so an invite cannot target the wrong repo */}
          <View style={[styles.repoBar, { backgroundColor: theme.bgTertiary, borderBottomColor: theme.border }]}>
            <Ionicons name="git-branch-outline" size={12} color={theme.textMuted} />
            <Text style={[styles.repoText, { color: theme.textSecondary }]} numberOfLines={1}>
              {ref ? fullName : "No GitHub remote for this workspace"}
            </Text>
          </View>

          <View style={styles.body}>
            {!ref ? (
              <View style={styles.stateBox}>
                <Ionicons name="cloud-offline-outline" size={18} color={theme.textMuted} />
                <Text style={[styles.stateText, { color: theme.textMuted }]}>
                  This workspace has no GitHub remote (owner/repo). Set one in Remote first, then manage
                  collaborators here.
                </Text>
              </View>
            ) : (
              <>
                {/* Add by username */}
                <View style={styles.addRow}>
                  <TextInput
                    style={[
                      styles.input,
                      { backgroundColor: theme.bgTertiary, borderColor: theme.border, color: theme.textPrimary },
                    ]}
                    placeholder="GitHub username"
                    placeholderTextColor={theme.textMuted}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!busy}
                    showSoftInputOnFocus={!keyboardMouseMode}
                    onSubmitEditing={handleAdd}
                    returnKeyType="done"
                  />
                  <TouchableOpacity
                    style={[
                      styles.addBtn,
                      { backgroundColor: username.trim() && !busy ? theme.accent : theme.bgTertiary, borderColor: theme.border },
                    ]}
                    onPress={handleAdd}
                    disabled={busy || !username.trim()}
                    activeOpacity={0.8}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color={theme.accent} />
                    ) : (
                      <Text style={[styles.addBtnText, { color: username.trim() ? theme.sendButtonIcon : theme.textMuted }]}>
                        Add
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
                <Text style={[styles.hint, { color: theme.textMuted }]}>
                  Invites grant write (push) access and must be accepted on GitHub.
                </Text>

                {!!error && (
                  <View style={[styles.errorBox, { backgroundColor: `${theme.accentRed}14`, borderColor: `${theme.accentRed}44` }]}>
                    <Ionicons name="alert-circle-outline" size={14} color={theme.accentRed} />
                    <Text style={[styles.errorText, { color: theme.accentRed }]}>{error}</Text>
                  </View>
                )}
                {!!notice && !error && (
                  <Text style={[styles.notice, { color: theme.accentGreen }]}>{notice}</Text>
                )}

                {loading ? (
                  <View style={styles.stateBox}>
                    <ActivityIndicator size="small" color={theme.accent} />
                    <Text style={[styles.stateText, { color: theme.textMuted }]}>Loading collaborators…</Text>
                  </View>
                ) : rows.length === 0 ? (
                  <View style={styles.stateBox}>
                    <Octicons name="person" size={18} color={theme.textMuted} />
                    <Text style={[styles.stateText, { color: theme.textMuted }]}>
                      No collaborators yet. Add someone by their GitHub username above.
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text style={[styles.countLine, { color: theme.textMuted }]}>
                      {rows.length} {rows.length === 1 ? "person" : "people"} with access
                    </Text>
                    <FlatList
                      data={rows}
                      keyExtractor={(item) => `${item.kind}:${item.login}:${item.invitationId ?? ""}`}
                      renderItem={renderRow}
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                      style={styles.list}
                      contentContainerStyle={styles.listContent}
                    />
                  </>
                )}

                {!loading && (
                  <TouchableOpacity style={styles.refreshRow} onPress={() => void load()} disabled={busy} activeOpacity={0.7}>
                    <Ionicons name="refresh" size={13} color={theme.accent} />
                    <Text style={[styles.refreshText, { color: theme.accent }]}>Refresh</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "82%",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  title: { fontSize: 14, fontWeight: "700", flex: 1 },
  closeBtn: { padding: 2 },
  repoBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  repoText: { fontSize: 12, fontWeight: "600", flex: 1 },
  body: { padding: 14, gap: 10 },
  addRow: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 12,
  },
  addBtn: {
    minWidth: 64,
    height: 36,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  addBtnText: { fontSize: 12.5, fontWeight: "700" },
  hint: { fontSize: 10.5, lineHeight: 14 },
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
  countLine: { fontSize: 10.5 },
  list: { maxHeight: 320 },
  listContent: { gap: 6, paddingVertical: 2 },
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
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarLetter: { fontSize: 13, fontWeight: "800" },
  rowBody: { flex: 1, gap: 3 },
  login: { fontSize: 12.5, fontWeight: "700" },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  badge: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontSize: 9.5, fontWeight: "700" },
  removeBtn: { padding: 6 },
  stateBox: { alignItems: "center", gap: 7, paddingVertical: 24, paddingHorizontal: 8 },
  stateText: { fontSize: 11.5, lineHeight: 16, textAlign: "center" },
  refreshRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 4 },
  refreshText: { fontSize: 11.5, fontWeight: "600" },
});
