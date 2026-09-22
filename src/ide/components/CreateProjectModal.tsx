import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Keyboard,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/themeContext';
import { useAccurateKeyboard } from '../../theme/useAccurateKeyboard';
import { useKeyboardMouseMode } from '../context/KeyboardMouseContext';
import { DirectoryPickerModal } from './DirectoryPickerModal';
import {
  formatDisplayPath,
  getCustomDirPlaceholder,
  getDefaultWorkspacePreviewPath,
  getParentDirLabel,
} from '../services/storagePaths';

interface CreateProjectModalProps {
  visible: boolean;
  onClose: () => void;
  onCreateProject: (name: string, customPath?: string) => void;
}

export function CreateProjectModal({ visible, onClose, onCreateProject }: CreateProjectModalProps) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const [projectName, setProjectName] = useState('');
  const [useCustomDirectory, setUseCustomDirectory] = useState(false);
  const [customDirectoryPath, setCustomDirectoryPath] = useState('');
  const [isDirectoryPickerVisible, setDirectoryPickerVisible] = useState(false);
  const { keyboardOffset, isKeyboardVisible } = useAccurateKeyboard(8);
  const scrollRef = useRef<ScrollView>(null);
  const customDirInputRef = useRef<TextInput>(null);
  const fieldTops = useRef<{ name: number; custom: number }>({ name: 0, custom: 0 });

  const scrollToField = (field: 'name' | 'custom') => {
    const y = field === 'name' ? fieldTops.current.name : fieldTops.current.custom;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    });
  };

  const handleSubmit = () => {
    if (!projectName.trim()) {
      Alert.alert('Validation Error', 'Please enter a project name.');
      return;
    }
    if (useCustomDirectory && !customDirectoryPath.trim()) {
      Alert.alert('Validation Error', 'Please select or enter a custom directory path.');
      return;
    }

    onCreateProject(
      projectName.trim(),
      useCustomDirectory ? customDirectoryPath.trim() : undefined
    );
    setProjectName('');
    setUseCustomDirectory(false);
    setCustomDirectoryPath('');
    onClose();
  };

  const folderName = projectName.trim().replace(/[\/\\]/g, "-");
  const computedPreviewPath = useCustomDirectory && customDirectoryPath.trim()
    ? (() => {
        const clean = customDirectoryPath.trim().replace(/^file:\/\//, "").replace(/\/+$/, "");
        const lastSegment = clean.split("/").filter(Boolean).pop() || "";
        if (folderName && lastSegment.toLowerCase() !== folderName.toLowerCase()) {
          return `${clean}/${folderName}/`;
        }
        return `${clean}/`;
      })()
    : (projectName.trim() ? formatDisplayPath(getDefaultWorkspacePreviewPath(projectName.trim())) : "");

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.modalOverlay, isKeyboardVisible && { paddingBottom: keyboardOffset }]}>
        <TouchableOpacity style={[styles.modalBackdrop, { backgroundColor: theme.overlay }]} activeOpacity={1} onPress={onClose} />
        <View style={[
          styles.bottomSheet,
          { backgroundColor: theme.bgSecondary, borderColor: theme.border },
          isKeyboardVisible && styles.bottomSheetKeyboardOpen,
        ]}>
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>New Workspace Project</Text>

            {/* Project Name */}
            <Text style={[styles.label, { color: theme.textSecondary }]}>Project Name</Text>
            <View
              onLayout={(e) => { fieldTops.current.name = e.nativeEvent.layout.y; }}
            >
            <TextInput
              style={[styles.input, { backgroundColor: theme.bgInput, borderColor: theme.border, color: theme.textPrimary }]}
              placeholder="e.g. mobile-todo-app"
              placeholderTextColor={theme.textMuted}
              value={projectName}
              onChangeText={setProjectName}
              autoCapitalize="none"
              autoFocus
              showSoftInputOnFocus={!keyboardMouseMode}
              returnKeyType={useCustomDirectory ? 'next' : 'done'}
              onFocus={() => scrollToField('name')}
              onSubmitEditing={() => {
                if (useCustomDirectory) customDirInputRef.current?.focus();
              }}
            />
            </View>

            {/* Workspace Directory Location Option */}
            <Text style={[styles.label, { color: theme.textSecondary }]}>Workspace Location</Text>
            <View style={styles.locationToggleRow}>
              <TouchableOpacity
                style={[
                  styles.locationTypeBtn,
                  { backgroundColor: theme.bgTertiary, borderColor: theme.border },
                  !useCustomDirectory && { backgroundColor: `${theme.accent}20`, borderColor: theme.accent },
                ]}
                onPress={() => setUseCustomDirectory(false)}
              >
                <Ionicons
                  name="folder-outline"
                  size={16}
                  color={!useCustomDirectory ? theme.accent : theme.textMuted}
                />
                <Text
                  style={[
                    styles.locationTypeBtnText,
                    { color: !useCustomDirectory ? theme.accent : theme.textSecondary },
                  ]}
                >
                  Default Storage
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.locationTypeBtn,
                  { backgroundColor: theme.bgTertiary, borderColor: theme.border },
                  useCustomDirectory && { backgroundColor: `${theme.accent}20`, borderColor: theme.accent },
                ]}
                onPress={() => setUseCustomDirectory(true)}
              >
                <Ionicons
                  name="file-tray-full-outline"
                  size={16}
                  color={useCustomDirectory ? theme.accent : theme.textMuted}
                />
                <Text
                  style={[
                    styles.locationTypeBtnText,
                    { color: useCustomDirectory ? theme.accent : theme.textSecondary },
                  ]}
                >
                  Specific Directory
                </Text>
              </TouchableOpacity>
            </View>

            {/* Custom Directory Input & Browse Button */}
            {useCustomDirectory && (
              <View
                style={[styles.customDirBox, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}
                onLayout={(e) => { fieldTops.current.custom = e.nativeEvent.layout.y; }}
              >
                <Text style={[styles.customDirLabel, { color: theme.textSecondary }]}>
                  {getParentDirLabel()}
                </Text>
                <View style={styles.customDirInputRow}>
                  <TextInput
                    ref={customDirInputRef}
                    style={[
                      styles.customDirInput,
                      { backgroundColor: theme.bgInput, borderColor: theme.border, color: theme.textPrimary },
                    ]}
                    placeholder={getCustomDirPlaceholder()}
                    placeholderTextColor={theme.textMuted}
                    value={customDirectoryPath}
                    onChangeText={setCustomDirectoryPath}
                    autoCapitalize="none"
                    showSoftInputOnFocus={!keyboardMouseMode}
                    returnKeyType="done"
                    onFocus={() => scrollToField('custom')}
                  />
                  <TouchableOpacity
                    style={[styles.browseBtn, { backgroundColor: theme.accent }]}
                    onPress={() => setDirectoryPickerVisible(true)}
                  >
                    <Ionicons name="folder-open" size={16} color={theme.sendButtonIcon} />
                    <Text style={[styles.browseBtnText, { color: theme.sendButtonIcon }]}>Browse</Text>
                  </TouchableOpacity>
                </View>

                {computedPreviewPath ? (
                  <View style={[styles.previewPathBox, { backgroundColor: `${theme.accent}14`, borderColor: `${theme.accent}30` }]}>
                    <Ionicons name="folder-outline" size={13} color={theme.accent} />
                    <Text style={[styles.previewPathText, { color: theme.accent }]} numberOfLines={1}>
                      Folder: {computedPreviewPath}
                    </Text>
                  </View>
                ) : null}

                <Text style={[styles.customDirHint, { color: theme.textMuted }]}>
                  A new project folder will be created inside this directory.
                </Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: theme.bgTertiary }]} onPress={onClose}>
                <Text style={[styles.buttonTextCancel, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: theme.accent }]} onPress={handleSubmit}>
                <Text style={[styles.buttonTextCreate, { color: theme.sendButtonIcon }]}>Create & Open</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Directory Picker Sub-modal */}
          <DirectoryPickerModal
            visible={isDirectoryPickerVisible}
            initialPath={customDirectoryPath}
            onClose={() => setDirectoryPickerVisible(false)}
            onSelectDirectory={(chosenPath) => setCustomDirectoryPath(chosenPath)}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  bottomSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
    borderWidth: 1,
  },
  bottomSheetKeyboardOpen: {
    maxHeight: '90%',
    paddingBottom: 12,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  input: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    fontSize: 15,
    marginBottom: 16,
    borderWidth: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  locationToggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  locationTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  locationTypeBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  customDirBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  customDirLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  customDirInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  customDirInput: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 6,
    gap: 5,
  },
  browseBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  previewPathBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 8,
  },
  previewPathText: {
    fontSize: 11.5,
    fontFamily: 'monospace',
    flex: 1,
  },
  customDirHint: {
    fontSize: 11,
    marginTop: 6,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    marginBottom: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonTextCancel: {
    fontSize: 14,
    fontWeight: '600',
  },
  buttonTextCreate: {
    fontSize: 14,
    fontWeight: '700',
  },
});
