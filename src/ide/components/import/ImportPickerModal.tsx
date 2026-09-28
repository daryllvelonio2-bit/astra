import React, { useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, Modal, FlatList,
  StyleSheet, TextInput, ActivityIndicator, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useAccurateKeyboard } from "../../../theme/useAccurateKeyboard";
import { useKeyboardMouseMode } from "../../context/KeyboardMouseContext";
import { getFileIcon } from "../fileExplorerUtils";
import { getImportBrowserBase } from "../../services/storagePaths";
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

/** Remembered across opens so a second import resumes where you left off. */
let lastVisitedDir: string | null = null;

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * ImportPickerModal — browse the phone and import a file (tap it) or the
 * whole open folder (footer button) into the current project.
 *
 * Chrome budget: ONE 38px address row above the list. The separate path bar
 * and the quick-location chip strip were folded into that row, so the file
 * list owns nearly the whole sheet.
 */
export function ImportPickerModal({
  visible, onClose, onImportFile, onImportFolder, isBusy = false, progress,
}: ImportPickerModalProps) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const { isKeyboardVisible, keyboardOffset } = useAccurateKeyboard(8);
  const defaultBase = getImportBrowserBase();

  const [currentPath, setCurrentPath] = useState(lastVisitedDir || defaultBase);
  const [typedPath, setTypedPath] = useState(lastVisitedDir || defaultBase);
  const [entries, setEntries] = useState<NativeDirEntry[]>([]);
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [hasPermission, setHasPermission] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setHasPermission(hasAllFilesPermission());
    void loadDirectory(lastVisitedDir || defaultBase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const loadDirectory = async (dirPath: string) => {
    let clean = (dirPath || "").trim();
    if (!clean) clean = defaultBase;
    if (!clean.endsWith("/")) clean += "/";
    lastVisitedDir = clean;
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
    if (lastSlash > 0) void loadDirectory(trimmed.substring(0, lastSlash + 1));
    else if (defaultBase && currentPath !== defaultBase) void loadDirectory(defaultBase);
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
  const canGoUp = currentPath.replace(/\/+$/, "").length > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, isKeyboardVisible && { paddingBottom: keyboardOffset }]}>
        <TouchableOpacity
          style={[styles.backdrop, { backgroundColor: theme.overlay }]}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.container,
            { backgroundColor: theme.bgSecondary, borderColor: theme.border },
            isKeyboardVisible && styles.containerKeyboard,
          ]}
        >
          {/* Address row: [folder] Import  <path>  [up] [shield] [close] */}
          <View style={[styles.addressRow, { borderBottomColor: theme.border }]}>
            <Ionicons name="download-outline" size={16} color={theme.accent} />
            <Text style={[styles.addressTitle, { color: theme.textPrimary }]}>Import</Text>

            {isEditingPath ? (
              <TextInput
                style={[styles.pathInput, { color: theme.textPrimary }]}
                value={typedPath}
                onChangeText={setTypedPath}
                autoFocus
                showSoftInputOnFocus={!keyboardMouseMode}
                onSubmitEditing={() => void loadDirectory(typedPath)}
                autoCapitalize="none"
                selectTextOnFocus
              />
            ) : (
              <TouchableOpacity
                style={styles.pathTap}
                onPress={() => setIsEditingPath(true)}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.pathText, { color: theme.textSecondary }]}
                  numberOfLines={1}
                  ellipsizeMode="head"
                >
                  {currentPath}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={isEditingPath ? () => void loadDirectory(typedPath) : handleGoUp}
              disabled={!isEditingPath && !canGoUp}
              style={styles.headerBtn}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityLabel={isEditingPath ? "Go to path" : "Parent folder"}
            >
              <Ionicons
                name={isEditingPath ? "arrow-forward" : "arrow-up"}
                size={17}
                color={theme.accent}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handlePermission}
              style={styles.headerBtn}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityLabel="Storage access"
            >
              <Ionicons
                name={hasPermission ? "shield-checkmark-outline" : "shield-outline"}
                size={16}
                color={hasPermission ? theme.textMuted : theme.accentGold}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onClose}
              style={styles.headerBtn}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={19} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Listing */}
          <View style={styles.listWrap}>
            <FlatList
              data={entries}
              keyExtractor={(item) => item.path}
              initialNumToRender={16}
              maxToRenderPerBatch={12}
              windowSize={5}
              removeClippedSubviews={Platform.OS === "android"}
              style={styles.list}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.entryItem, { borderBottomColor: theme.border }]}
                  onPress={() =>
                    item.isDirectory ? void loadDirectory(item.path) : onImportFile(item.path)
                  }
                  activeOpacity={0.7}
                  disabled={isBusy}
                >
                  {item.isDirectory
                    ? <Ionicons name="folder" size={18} color={theme.accent} style={styles.entryIcon} />
                    : <View style={styles.entryIcon}>{getFileIcon(item.name)}</View>}
                  <Text style={[styles.entryText, { color: theme.textPrimary }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.isDirectory ? (
                    <Ionicons name="chevron-forward" size={15} color={theme.textMuted} />
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
              <Ionicons name="folder-open-outline" size={16} color={theme.sendButtonIcon} />
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
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    height: "92%",
  },
  containerKeyboard: { height: "80%" },
  // One 38px row carrying the title, the path and every control.
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    height: 38,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  addressTitle: { fontSize: 13.5, fontWeight: "700" },
  pathTap: { flex: 1, paddingVertical: 4 },
  pathText: { fontSize: 11, fontFamily: "monospace" },
  pathInput: {
    flex: 1,
    fontSize: 11,
    fontFamily: "monospace",
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  headerBtn: { padding: 3 },
  listWrap: { flex: 1, position: "relative" },
  list: { flex: 1, paddingHorizontal: 12 },
  entryItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  entryIcon: { marginRight: 9, alignItems: "center", justifyContent: "center" },
  entryText: { flex: 1, fontSize: 13, fontWeight: "500" },
  entrySize: { fontSize: 10.5, fontFamily: "monospace" },
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
  footer: { flexDirection: "row", padding: 10, gap: 8, borderTopWidth: 1 },
  footerBtnCancel: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  footerBtnTextCancel: { fontSize: 13, fontWeight: "600" },
  footerBtnPrimary: {
    flex: 2,
    flexDirection: "row",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  footerBtnTextPrimary: { fontSize: 13, fontWeight: "700" },
  disabled: { opacity: 0.5 },
});
