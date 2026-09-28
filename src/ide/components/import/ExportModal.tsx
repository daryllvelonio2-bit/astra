import React from "react";
import { View, Text, TouchableOpacity, Modal, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { ExportProgress } from "../../services/exportService";

interface ExportModalProps {
  visible: boolean;
  onClose: () => void;
  projectName?: string;
  /** Name of the open file, if any — enables the single-file export. */
  fileName?: string;
  /** Folder on the phone the export is written to. */
  destDir: string;
  onChangeDest: () => void;
  onExportProject: () => void;
  onExportFile: () => void;
  isBusy?: boolean;
  progress?: ExportProgress | null;
}

/**
 * ExportModal — popup offering a whole-project .zip or the current file,
 * with a destination folder the user can change.
 */
export function ExportModal({
  visible, onClose, projectName, fileName, destDir, onChangeDest,
  onExportProject, onExportFile, isBusy = false, progress,
}: ExportModalProps) {
  const { theme } = useTheme();
  const hasFile = !!fileName;

  const busyLabel = progress
    ? progress.total > 1
      ? `Exporting ${progress.done}/${progress.total}`
      : "Exporting…"
    : "Exporting…";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity
          style={[styles.backdrop, { backgroundColor: theme.overlay }]}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[styles.container, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={styles.headerLeft}>
              <Ionicons name="share-outline" size={19} color={theme.accent} />
              <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Export</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.iconBtn} disabled={isBusy}>
              <Ionicons name="close" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Destination */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>SAVE TO</Text>
            <View style={[styles.destRow, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
              <Ionicons name="folder-outline" size={15} color={theme.textMuted} />
              <Text
                style={[styles.destText, { color: theme.textPrimary }]}
                numberOfLines={1}
                ellipsizeMode="head"
              >
                {destDir}
              </Text>
              <TouchableOpacity onPress={onChangeDest} style={styles.changeBtn} disabled={isBusy}>
                <Text style={[styles.changeText, { color: theme.accent }]}>Change</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Options */}
          <View style={styles.section}>
            <TouchableOpacity
              style={[styles.option, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}
              onPress={onExportProject}
              activeOpacity={0.75}
              disabled={isBusy}
            >
              <View style={[styles.optionIcon, { backgroundColor: theme.bgInput }]}>
                <Ionicons name="archive-outline" size={19} color={theme.accent} />
              </View>
              <View style={styles.optionBody}>
                <Text style={[styles.optionTitle, { color: theme.textPrimary }]}>Export Project</Text>
                <Text style={[styles.optionSub, { color: theme.textMuted }]} numberOfLines={1}>
                  {projectName ? `${projectName} → .zip` : "Entire project as a .zip"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.option,
                { backgroundColor: theme.bgTertiary, borderColor: theme.border },
                !hasFile && styles.disabled,
              ]}
              onPress={onExportFile}
              activeOpacity={0.75}
              disabled={isBusy || !hasFile}
            >
              <View style={[styles.optionIcon, { backgroundColor: theme.bgInput }]}>
                <Ionicons name="document-outline" size={19} color={theme.accent} />
              </View>
              <View style={styles.optionBody}>
                <Text style={[styles.optionTitle, { color: theme.textPrimary }]}>Export Current File</Text>
                <Text style={[styles.optionSub, { color: theme.textMuted }]} numberOfLines={1}>
                  {fileName || "No file open"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {isBusy && (
            <View style={styles.busyRow}>
              <ActivityIndicator size="small" color={theme.accent} />
              <Text style={[styles.busyTitle, { color: theme.textPrimary }]}>{busyLabel}</Text>
              {!!progress?.current && (
                <Text style={[styles.busyFile, { color: theme.textMuted }]} numberOfLines={1}>
                  {progress.current}
                </Text>
              )}
            </View>
          )}

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.cancelBtn, { backgroundColor: theme.bgTertiary }]}
              onPress={onClose}
              disabled={isBusy}
            >
              <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject },
  container: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 9 },
  headerTitle: { fontSize: 15.5, fontWeight: "700" },
  iconBtn: { padding: 5 },
  section: { paddingHorizontal: 16, paddingTop: 12 },
  sectionLabel: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.6, marginBottom: 6 },
  destRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  destText: { flex: 1, fontSize: 11.5, fontFamily: "monospace" },
  changeBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  changeText: { fontSize: 12, fontWeight: "700" },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  optionIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  optionBody: { flex: 1 },
  optionTitle: { fontSize: 13.5, fontWeight: "600" },
  optionSub: { fontSize: 11.5, marginTop: 1 },
  disabled: { opacity: 0.45 },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },
  busyTitle: { fontSize: 13, fontWeight: "600" },
  busyFile: { flex: 1, fontSize: 11, fontFamily: "monospace" },
  footer: { padding: 14, borderTopWidth: 1 },
  cancelBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontSize: 14, fontWeight: "600" },
});
