import React from "react";
import { View, Text, TouchableOpacity, Modal, StyleSheet } from "react-native";
import { Ionicons, Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { parseRepoFullName } from "../../services/gitCollaboratorsApi";
import { repoFullName } from "../../services/gitCollaboratorModel";
import { RepoVisibilitySection } from "./RepoVisibilitySection";

/**
 * Repository visibility (public / private) for the current workspace's repo —
 * its own modal and its own trigger in the Git header, beside Collaborators.
 *
 * The shell is deliberately the SAME as GitCollaboratorsModal: identical
 * backdrop, card radius/max width, header row (icon + title + close), the
 * pinned repo bar under the header, and the same body padding/gap. The two
 * modals open from adjacent icons, so they must read as one product. The
 * feature UI lives in RepoVisibilitySection, rendered as the body — its rows
 * use the collaborators modal's own row metrics.
 *
 * owner/repo come from the workspace's git origin — the same remoteUrl
 * GitHeaderBar already holds — parsed with the shared helper.
 */

interface RepoVisibilityModalProps {
  visible: boolean;
  remoteUrl: string | null;
  onClose: () => void;
}

export function RepoVisibilityModal({ visible, remoteUrl, onClose }: RepoVisibilityModalProps) {
  const { theme } = useTheme();

  const ref = parseRepoFullName(remoteUrl);
  const fullName = repoFullName(ref);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
        <View style={[styles.modalCard, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
          {/* Header — same row as the collaborators modal */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <Octicons name="shield-lock" size={16} color={theme.accent} />
            <Text style={[styles.title, { color: theme.textPrimary }]}>Repository visibility</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Acting repo — pinned, exactly like the collaborators modal */}
          <View style={[styles.repoBar, { backgroundColor: theme.bgTertiary, borderBottomColor: theme.border }]}>
            <Ionicons name="git-branch-outline" size={12} color={theme.textMuted} />
            <Text style={[styles.repoText, { color: theme.textSecondary }]} numberOfLines={1}>
              {ref ? fullName : "No GitHub remote for this workspace"}
            </Text>
          </View>

          <View style={styles.body}>
            {ref ? (
              <RepoVisibilitySection visible={visible} owner={ref.owner} repo={ref.repo} fullName={fullName} />
            ) : (
              <View style={styles.stateBox}>
                <Ionicons name="cloud-offline-outline" size={18} color={theme.textMuted} />
                <Text style={[styles.stateText, { color: theme.textMuted }]}>
                  This workspace has no GitHub remote (owner/repo). Set one in Remote first.
                </Text>
              </View>
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
  stateBox: { alignItems: "center", gap: 7, paddingVertical: 24, paddingHorizontal: 8 },
  stateText: { fontSize: 11.5, lineHeight: 16, textAlign: "center" },
});
