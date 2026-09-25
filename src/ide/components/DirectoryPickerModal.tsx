import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, FlatList, StyleSheet, TextInput, ScrollView, Platform } from 'react-native';
import { showAppDialog } from "../services/appDialog";
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/themeContext';
import { useAccurateKeyboard } from '../../theme/useAccurateKeyboard';
import { useKeyboardMouseMode } from '../context/KeyboardMouseContext';
import {
  getDefaultPickerBase,
  getPickerTitle,
  getQuickPaths,
} from '../services/storagePaths';
import {
  readDirEntries,
  makeDir,
  hasAllFilesPermission,
  requestAllFilesPermission,
  NativeDirEntry,
} from '../services/nativeFs';

interface DirectoryPickerModalProps {
  visible: boolean;
  initialPath?: string;
  onClose: () => void;
  onSelectDirectory: (directoryPath: string) => void;
}

export function DirectoryPickerModal({
  visible,
  initialPath,
  onClose,
  onSelectDirectory,
}: DirectoryPickerModalProps) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const defaultBase = getDefaultPickerBase();
  const pickerTitle = getPickerTitle();
  const [currentPath, setCurrentPath] = useState<string>(initialPath || defaultBase);
  const [typedPath, setTypedPath] = useState<string>(initialPath || defaultBase);
  const [entries, setEntries] = useState<NativeDirEntry[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isEditingPath, setIsEditingPath] = useState(false);

  useEffect(() => {
    if (visible) {
      const target = initialPath && initialPath.length > 0 ? initialPath : defaultBase;
      loadDirectory(target);
    }
  }, [visible, initialPath]);

  const loadDirectory = async (dirPath: string) => {
    try {
      let cleanPath = dirPath.trim();
      if (!cleanPath.endsWith('/')) cleanPath += '/';

      await makeDir(cleanPath);

      setCurrentPath(cleanPath);
      setTypedPath(cleanPath);
      setIsEditingPath(false);

      const loaded = await readDirEntries(cleanPath);
      const dirs = loaded.filter((e) => e.isDirectory);
      setEntries(dirs);
    } catch (err: any) {
      console.warn('Failed to read directory:', err);
    }
  };

  const handleGoUp = () => {
    const trimmed = currentPath.replace(/\/+$/, '');
    const lastSlash = trimmed.lastIndexOf('/');
    if (lastSlash > 0) {
      const parent = trimmed.substring(0, lastSlash + 1);
      loadDirectory(parent);
    } else if (defaultBase && currentPath !== defaultBase) {
      loadDirectory(defaultBase);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const target = `${currentPath}${newFolderName.trim()}/`;
      await makeDir(target);
      setNewFolderName('');
      setIsCreatingFolder(false);
      await loadDirectory(currentPath);
    } catch (e: any) {
      showAppDialog({ title: 'Error', message: `Could not create folder: ${e.message}` });
    }
  };

  const handleSelectCurrent = () => {
    onSelectDirectory(currentPath);
    onClose();
  };

  const handleRequestStoragePermission = async () => {
    requestAllFilesPermission();
  };

  const quickPaths = getQuickPaths();
  const { isKeyboardVisible, keyboardOffset } = useAccurateKeyboard(8);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, isKeyboardVisible && { paddingBottom: keyboardOffset }]}>
        <TouchableOpacity style={[styles.backdrop, { backgroundColor: theme.overlay }]} activeOpacity={1} onPress={onClose} />
        <View style={[styles.container, { backgroundColor: theme.bgSecondary, borderColor: theme.border }, isKeyboardVisible && { maxHeight: '90%' }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={styles.headerLeft}>
              <Ionicons name="folder-open-outline" size={20} color={theme.accent} />
              <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>{pickerTitle}</Text>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity onPress={handleRequestStoragePermission} style={styles.permBtn}>
                <Ionicons name="shield-checkmark-outline" size={16} color={theme.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
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

          {/* Current Path Bar (with editable input option) */}
          <View style={[styles.pathBar, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
            <TouchableOpacity onPress={handleGoUp} style={styles.upButton}>
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
              <TouchableOpacity onPress={() => loadDirectory(typedPath)} style={styles.goBtn}>
                <Text style={[styles.goBtnText, { color: theme.accent }]}>Go</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setIsEditingPath(true)} style={styles.editBtn}>
                <Ionicons name="pencil-outline" size={16} color={theme.textMuted} />
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={() => setIsCreatingFolder(!isCreatingFolder)} style={styles.addFolderBtn}>
              <Ionicons name="folder-outline" size={18} color={theme.accent} />
              <Ionicons name="add" size={12} color={theme.accent} style={styles.addPlus} />
            </TouchableOpacity>
          </View>

          {/* New folder inline input */}
          {isCreatingFolder && (
            <View style={[styles.newFolderRow, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}>
              <TextInput
                style={[styles.newFolderInput, { backgroundColor: theme.bgInput, color: theme.textPrimary, borderColor: theme.border }]}
                placeholder="New folder name"
                placeholderTextColor={theme.textMuted}
                value={newFolderName}
                onChangeText={setNewFolderName}
                autoFocus
                showSoftInputOnFocus={!keyboardMouseMode}
                onSubmitEditing={handleCreateFolder}
                returnKeyType="done"
              />
              <TouchableOpacity style={[styles.newFolderActionBtn, { backgroundColor: theme.accent }]} onPress={handleCreateFolder}>
                <Text style={[styles.newFolderActionText, { color: theme.sendButtonIcon }]}>Create</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelNewFolderBtn} onPress={() => setIsCreatingFolder(false)}>
                <Ionicons name="close" size={18} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {/* Directory listing */}
          <FlatList
            data={entries}
            keyExtractor={(item) => item.path}
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={Platform.OS === "android"}
            style={styles.list}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.entryItem, { borderBottomColor: theme.border }]}
                onPress={() => loadDirectory(item.path)}
              >
                <Ionicons name="folder" size={20} color={theme.accent} style={styles.entryIcon} />
                <Text style={[styles.entryText, { color: theme.textPrimary }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>No subdirectories here</Text>
              </View>
            }
          />

          {/* Bottom Actions */}
          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            <TouchableOpacity style={[styles.footerBtnCancel, { backgroundColor: theme.bgTertiary }]} onPress={onClose}>
              <Text style={[styles.footerBtnTextCancel, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.footerBtnSelect, { backgroundColor: theme.accent }]} onPress={handleSelectCurrent}>
              <Ionicons name="checkmark" size={18} color={theme.sendButtonIcon} />
              <Text style={[styles.footerBtnTextSelect, { color: theme.sendButtonIcon }]}>Use This Directory</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  container: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    maxHeight: '85%',
    minHeight: 420,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  permBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  quickBar: {
    maxHeight: 40,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  quickChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 6,
    height: 28,
    justifyContent: 'center',
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  pathBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginVertical: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  upButton: {
    padding: 4,
    marginRight: 6,
  },
  pathTextWrap: {
    flex: 1,
  },
  pathText: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  pathInput: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'monospace',
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  editBtn: {
    padding: 4,
    marginLeft: 4,
  },
  goBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  goBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  addFolderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    marginLeft: 6,
  },
  addPlus: {
    marginLeft: -4,
    marginTop: -6,
  },
  newFolderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginBottom: 8,
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  newFolderInput: {
    flex: 1,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    fontSize: 13,
  },
  newFolderActionBtn: {
    paddingHorizontal: 12,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
  },
  newFolderActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cancelNewFolderBtn: {
    padding: 6,
  },
  list: {
    flex: 1,
    paddingHorizontal: 14,
  },
  entryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  entryIcon: {
    marginRight: 10,
  },
  entryText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 13,
  },
  footer: {
    flexDirection: 'row',
    padding: 14,
    gap: 10,
    borderTopWidth: 1,
  },
  footerBtnCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnTextCancel: {
    fontSize: 14,
    fontWeight: '600',
  },
  footerBtnSelect: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  footerBtnTextSelect: {
    fontSize: 14,
    fontWeight: '700',
  },
});
