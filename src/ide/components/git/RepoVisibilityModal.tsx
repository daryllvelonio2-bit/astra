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
 * This file supplies only the shared modal shell (backdrop, header, title +
 * repo subtitle, close control) that GitCollaboratorsModal also uses; the flat
 * feature UI lives in RepoVisibilitySection, rendered as the body. One
 * container level: the card, a hairline under the header, then flat content.
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
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <Octicons name="shield-lock" size={16} color={theme.accent} />
            <View style={styles.titleBlock}>
              <Text style={[styles.title, { color: theme.textPrimary }]}>Repository visibility</Text>
              <Text style={[styles.subtitle, { color: theme.textMuted }]} numberOfLines={1}>
                {ref ? fullName : "No GitHub remote for this workspace"}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={theme.textMuted} />
            </TouchableOpacity>
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
  titleBlock: { flex: 1, gap: 1 },
  title: { fontSize: 14, fontWeight: "700" },
  subtitle: { fontSize: 11 },
  closeBtn: { padding: 2 },
  body: { padding: 14, gap: 12 },
  stateBox: { alignItems: "center", gap: 8, paddingVertical: 24, paddingHorizontal: 8 },
  stateText: { fontSize: 11.5, lineHeight: 16, textAlign: "center" },
});
