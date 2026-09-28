import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, TouchableOpacity, Modal, FlatList, ScrollView,
  StyleSheet, TextInput, ActivityIndicator, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useAccurateKeyboard } from "../../../theme/useAccurateKeyboard";
import { useKeyboardMouseMode } from "../../context/KeyboardMouseContext";
import { getFileIcon } from "../fileExplorerUtils";
import { getDefaultPickerBase, getQuickPaths } from "../../services/storagePaths";
import {
  readDirEntries, hasAllFilesPermission, requestAllFilesPermission, NativeDirEntry,
} from "../../services/nativeFs";
import { ImportProgress } from "../../services/importService";

interface ImportPickerModalProps {
  visible: boolean;
  onClose: () => void;
  /** Import a single file from phone storage. */
  onImportFile: (absolutePath: string) => void;
  /** Import a whole folder from phone storage. */
  onImportFolder: (absolutePath: string) => void;
  isBusy?: boolean;
  progress?: ImportProgress | null;
}

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * ImportPickerModal — browse the phone and import a file (tap it) or the
 * whole open folder (footer button) into the current project.
 */
export function ImportPickerModal({
  visible, onClose, onImportFile, onImportFolder, isBusy = false, progress,
}: ImportPickerModalProps) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const { isKeyboardVisible, keyboardOffset } = useAccurateKeyboard(8);
  const defaultBase = getDefaultPickerBase();

  const [currentPath, setCurrentPath] = useState(defaultBase);
  const [typedPath, setTypedPath] = useState(defaultBase);
  const [entries, setEntries] = useState<NativeDirEntry[]>([]);
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [hasPermission, setHasPermission] = useState(true);
  // Static per platform — build once, not on every progress re-render.
  const quickPaths = useMemo(() => getQuickPaths(), []);

  useEffect(() => {
    if (!visible) return;
    setHasPermission(hasAllFilesPermission());
    loadDirectory(currentPath || defaultBase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const loadDirectory = async (dirPath: string) => {
    let clean = (dirPath || "").trim();
    if (!clean) clean = defaultBase;
    if (!clean.endsWith("/")) clean += "/";
    setCurrentPath(clean);
    setTypedPath(clean);
    setIsEditingPath(false);
    setHasPermission(hasAllFilesPermission());
    try {
      const loaded = await readDirEntries(clean);
      loaded.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setEntries(loaded);
    } catch (_) {
      setEntries([]);
    }
  };

  const handleGoUp = () => {
    const trimmed = currentPath.replace(/\/+$/, "");
    const lastSlash = trimmed.lastIndexOf("/");
    if (lastSlash > 0) loadDirectory(trimmed.substring(0, lastSlash + 1));
    else if (defaultBase && currentPath !== defaultBase) loadDirectory(defaultBase);
  };

  const handlePermission = () => {
    requestAllFilesPermission();
    setHasPermission(hasAllFilesPermission());
  };

  const busyLabel = progress
    ? progress.total > 0
      ? `Importing ${progress.done}/${progress.total}`
      : "Importing…"
    : "Importing…";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, isKeyboardVisible && { paddingBottom: keyboardOffset }]}>
        <TouchableOpacity
          style={[styles.backdrop, { backgroundColor: theme.overlay }]}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[styles.container, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={styles.headerLeft}>
              <Ionicons name="download-outline" size={20} color={theme.accent} />
              <View>
                <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Import</Text>
                <Text style={[styles.headerSub, { color: theme.textMuted }]}>
                  Tap a file, or pull in the whole folder
                </Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity onPress={handlePermission} style={styles.iconBtn}>
                <Ionicons
                  name={hasPermission ? "shield-checkmark-outline" : "shield-outline"}
                  size={17}
                  color={hasPermission ? theme.accent : theme.accentGold}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
                <Ionicons name="close" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick jumps */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickBar}>
            {quickPaths.map((qp) => (
              <TouchableOpacity
                key={qp.label}
                style={[styles.quickChip, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}
                onPress={() => loadDirectory(qp.path)}
              >
                <Text style={[styles.quickChipText, { color: theme.textSecondary }]}>{qp.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Path bar */}
          <View style={[styles.pathBar, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
            <TouchableOpacity onPress={handleGoUp} style={styles.iconBtn}>
              <Ionicons name="arrow-up" size={18} color={theme.accent} />
            </TouchableOpacity>
            {isEditingPath ? (
              <TextInput
                style={[styles.pathInput, { color: theme.textPrimary }]}
                value={typedPath}
                onChangeText={setTypedPath}
                autoFocus
                showSoftInputOnFocus={!keyboardMouseMode}
                onSubmitEditing={() => loadDirectory(typedPath)}
                autoCapitalize="none"
              />
            ) : (
              <TouchableOpacity style={styles.pathTextWrap} onPress={() => setIsEditingPath(true)}>
                <Text style={[styles.pathText, { color: theme.textPrimary }]} numberOfLines={1} ellipsizeMode="head">
                  {currentPath}
                </Text>
              </TouchableOpacity>
            )}
            {isEditingPath ? (
              <TouchableOpacity onPress={() => loadDirectory(typedPath)} style={styles.iconBtn}>
                <Text style={[styles.goText, { color: theme.accent }]}>Go</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setIsEditingPath(true)} style={styles.iconBtn}>
                <Ionicons name="pencil-outline" size={15} color={theme.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Listing */}
          <View style={styles.listWrap}>
            <FlatList
              data={entries}
              keyExtractor={(item) => item.path}
              initialNumToRender={14}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews={Platform.OS === "android"}
              style={styles.list}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.entryItem, { borderBottomColor: theme.border }]}
                  onPress={() => (item.isDirectory ? loadDirectory(item.path) : onImportFile(item.path))}
                  activeOpacity={0.7}
                  disabled={isBusy}
                >
                  {item.isDirectory
                    ? <Ionicons name="folder" size={19} color={theme.accent} style={styles.entryIcon} />
                    : <View style={styles.entryIcon}>{getFileIcon(item.name)}</View>}
                  <Text style={[styles.entryText, { color: theme.textPrimary }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.isDirectory ? (
                    <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                  ) : (
                    <Text style={[styles.entrySize, { color: theme.textMuted }]}>
                      {formatSize(item.size)}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <TouchableOpacity
                    onPress={hasPermission ? undefined : handlePermission}
                    disabled={hasPermission}
                    style={styles.emptyInner}
                  >
                    {!hasPermission && (
                      <Ionicons name="shield-outline" size={22} color={theme.accentGold} />
                    )}
                    <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                      {hasPermission ? "This folder is empty" : "Tap to grant storage access"}
                    </Text>
                  </TouchableOpacity>
                </View>
              }
            />

            {isBusy && (
              <View style={[styles.busyOverlay, { backgroundColor: theme.bgSecondary }]}>
                <ActivityIndicator size="small" color={theme.accent} />
                <Text style={[styles.busyTitle, { color: theme.textPrimary }]}>{busyLabel}</Text>
                {!!progress?.current && (
                  <Text style={[styles.busyFile, { color: theme.textMuted }]} numberOfLines={1}>
                    {progress.current}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.footerBtnCancel, { backgroundColor: theme.bgTertiary }]}
              onPress={onClose}
              disabled={isBusy}
            >
              <Text style={[styles.footerBtnTextCancel, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerBtnPrimary, { backgroundColor: theme.accent }, isBusy && styles.disabled]}
              onPress={() => onImportFolder(currentPath)}
              disabled={isBusy}
            >
              <Ionicons name="folder-open-outline" size={17} color={theme.sendButtonIcon} />
              <Text style={[styles.footerBtnTextPrimary, { color: theme.sendButtonIcon }]}>
                Import This Folder
              </Text>
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
    maxHeight: "85%",
    minHeight: 420,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  headerTitle: { fontSize: 15, fontWeight: "700" },
  headerSub: { fontSize: 11, marginTop: 1 },
  iconBtn: { padding: 5 },
  quickBar: { maxHeight: 38, paddingHorizontal: 14, marginTop: 8 },
  quickChip: {
    paddingHorizontal: 10,
    height: 28,
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 6,
  },
  quickChipText: { fontSize: 11, fontWeight: "600" },
  pathBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 14,
    marginVertical: 10,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  pathTextWrap: { flex: 1 },
  pathText: { fontSize: 12, fontFamily: "monospace" },
  pathInput: { flex: 1, fontSize: 12, fontFamily: "monospace", paddingVertical: 2, paddingHorizontal: 4 },
  goText: { fontSize: 12, fontWeight: "700" },
  listWrap: { flex: 1, position: "relative" },
  list: { flex: 1, paddingHorizontal: 14 },
  entryItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  entryIcon: { marginRight: 10, alignItems: "center", justifyContent: "center" },
  entryText: { flex: 1, fontSize: 13.5, fontWeight: "500" },
  entrySize: { fontSize: 11, fontFamily: "monospace" },
  emptyBox: { alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  emptyInner: { alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 24 },
  emptyText: { fontSize: 13, textAlign: "center" },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  busyTitle: { fontSize: 14, fontWeight: "700" },
  busyFile: { fontSize: 11.5, fontFamily: "monospace" },
  footer: { flexDirection: "row", padding: 14, gap: 10, borderTopWidth: 1 },
  footerBtnCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  footerBtnTextCancel: { fontSize: 14, fontWeight: "600" },
  footerBtnPrimary: {
    flex: 2,
    flexDirection: "row",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  footerBtnTextPrimary: { fontSize: 14, fontWeight: "700" },
  disabled: { opacity: 0.5 },
});
