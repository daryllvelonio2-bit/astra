import React from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { FileNode } from "../types";
import { useTheme } from "../../theme/themeContext";
import { useAccurateKeyboard } from "../../theme/useAccurateKeyboard";
import { useKeyboardMouseMode } from "../context/KeyboardMouseContext";

interface FileActionModalProps {
  modalMode: "none" | "options" | "rename" | "add";
  selectedNode: FileNode | null;
  menuPosition: { x: number; y: number };
  modalInput: string;
  onChangeInput: (val: string) => void;
  onClose: () => void;
  onSelectRename: () => void;
  onSelectAdd: () => void;
  onDeleteConfirm: () => void;
  onRenameSubmit: () => void;
  onAddSubmit: () => void;
  onBackToOptions: () => void;
}

export function FileActionModal({
  modalMode,
  selectedNode,
  menuPosition,
  modalInput,
  onChangeInput,
  onClose,
  onSelectRename,
  onSelectAdd,
  onDeleteConfirm,
  onRenameSubmit,
  onAddSubmit,
  onBackToOptions,
}: FileActionModalProps) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const { keyboardOffset } = useAccurateKeyboard(16);
  if (modalMode === "none") return null;

  const isInputMode = modalMode === "rename" || modalMode === "add";

  return (
    <View
      style={[
        styles.modalOverlay,
        isInputMode && [styles.inputOverlay, { paddingBottom: keyboardMouseMode ? 0 : keyboardOffset }],
      ]}
    >
      <TouchableOpacity
        style={[styles.modalBackdrop, { backgroundColor: theme.overlay }]}
        activeOpacity={1}
        onPress={onClose}
      />
      <View
        style={[
          styles.modalCard,
          isInputMode
            ? [styles.inputCard, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]
            : { backgroundColor: theme.bgSecondary, borderColor: theme.border, top: menuPosition.y, left: menuPosition.x },
        ]}
      >
        {modalMode === "options" && (
          <>
            <Text style={[styles.modalTitle, { color: theme.textPrimary, borderBottomColor: theme.border }]} numberOfLines={1}>
              {selectedNode?.name}
            </Text>
            <TouchableOpacity style={styles.modalOption} onPress={onSelectRename}>
              <Text style={[styles.modalOptionText, { color: theme.accent }]}>Rename</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={onSelectAdd}>
              <Text style={[styles.modalOptionText, { color: theme.accent }]}>Add New File</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalOption, styles.deleteOption, { borderTopColor: theme.border }]} onPress={onDeleteConfirm}>
              <Text style={[styles.modalOptionText, styles.deleteText, { color: theme.accentRed }]}>Delete</Text>
            </TouchableOpacity>
          </>
        )}

        {modalMode === "rename" && (
          <>
            <Text style={[styles.modalTitle, { color: theme.textPrimary, borderBottomColor: theme.border }]}>Rename</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.bgInput, borderColor: theme.border, color: theme.textPrimary }]}
              value={modalInput}
              onChangeText={onChangeInput}
              placeholder="New name..."
              placeholderTextColor={theme.textMuted}
              autoFocus
              autoCapitalize="none"
              showSoftInputOnFocus={!keyboardMouseMode}
              onSubmitEditing={onRenameSubmit}
              returnKeyType="done"
              onKeyPress={(e) => {
                if (e.nativeEvent.key === "Escape") {
                  onClose();
                }
              }}
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.bgTertiary }]} onPress={onBackToOptions}>
                <Text style={[styles.modalBtnText, { color: theme.textSecondary }]}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: theme.accent }]} onPress={onRenameSubmit}>
                <Text style={[styles.modalBtnText, styles.modalBtnPrimaryText, { color: theme.sendButtonIcon }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {modalMode === "add" && (
          <>
            <Text style={[styles.modalTitle, { color: theme.textPrimary, borderBottomColor: theme.border }]}>New File</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.bgInput, borderColor: theme.border, color: theme.textPrimary }]}
              value={modalInput}
              onChangeText={onChangeInput}
              placeholder="Component.tsx"
              placeholderTextColor={theme.textMuted}
              autoFocus
              autoCapitalize="none"
              showSoftInputOnFocus={!keyboardMouseMode}
              onSubmitEditing={onAddSubmit}
              returnKeyType="done"
              onKeyPress={(e) => {
                if (e.nativeEvent.key === "Escape") {
                  onClose();
                }
              }}
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.bgTertiary }]} onPress={onClose}>
                <Text style={[styles.modalBtnText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: theme.accent }]} onPress={onAddSubmit}>
                <Text style={[styles.modalBtnText, styles.modalBtnPrimaryText, { color: theme.sendButtonIcon }]}>Create</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 999,
  },
  inputOverlay: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    position: "absolute",
    borderRadius: 8,
    padding: 12,
    width: 170,
    borderWidth: 1,
    zIndex: 100,
    elevation: 6,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  inputCard: {
    position: "relative",
    width: "100%",
    maxWidth: 300,
  },
  modalTitle: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 8,
    borderBottomWidth: 1,
    paddingBottom: 4,
  },
  modalOption: {
    paddingVertical: 7,
    paddingHorizontal: 4,
  },
  modalOptionText: {
    fontSize: 13,
  },
  deleteOption: {
    borderTopWidth: 1,
    marginTop: 4,
  },
  deleteText: {},
  modalInput: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    fontSize: 13,
    marginBottom: 10,
    borderWidth: 1,
  },
  modalBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 6,
  },
  modalBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  modalBtnText: {
    fontSize: 12,
  },
  modalBtnPrimary: {},
  modalBtnPrimaryText: {
    fontWeight: "bold",
  },
});
