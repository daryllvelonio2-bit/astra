import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons, Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useAccurateKeyboard } from "../../../theme/useAccurateKeyboard";
import { useKeyboardMouseMode } from "../../context/KeyboardMouseContext";
import { GitBranch } from "./types";

interface GitBranchModalProps {
  visible: boolean;
  branches: GitBranch[];
  currentBranch: string;
  loading: boolean;
  onClose: () => void;
  onSwitchBranch: (branchName: string) => void;
  onCreateBranch: (branchName: string) => void;
}

export function GitBranchModal({
  visible,
  branches,
  currentBranch,
  loading,
  onClose,
  onSwitchBranch,
  onCreateBranch,
}: GitBranchModalProps) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const { isKeyboardVisible, keyboardOffset } = useAccurateKeyboard(12);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");

  const filtered = branches.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase().trim())
  );

  const handleCreate = () => {
    const trimmed = newBranchName.trim();
    if (!trimmed) return;
    onCreateBranch(trimmed);
    setNewBranchName("");
    setShowCreate(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, isKeyboardVisible && { paddingBottom: keyboardOffset }]}>
        <View style={[styles.modalCard, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <Octicons name="git-branch" size={16} color={theme.accent} />
            <Text style={[styles.title, { color: theme.textPrimary }]}>Switch Branch</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Search Input */}
          <View style={styles.searchRow}>
            <TextInput
              style={[
                styles.searchInput,
                { backgroundColor: theme.bgTertiary, borderColor: theme.border, color: theme.textPrimary },
              ]}
              placeholder="Filter branches…"
              placeholderTextColor={theme.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              showSoftInputOnFocus={!keyboardMouseMode}
            />
          </View>

          {/* Branch List */}
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={theme.accent} />
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.name}
              initialNumToRender={12}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews={Platform.OS === "android"}
              keyboardShouldPersistTaps="handled"
              style={styles.branchList}
              renderItem={({ item }) => {
                const isSelected = item.name === currentBranch;
                return (
                  <TouchableOpacity
                    style={[
                      styles.branchItem,
                      { borderBottomColor: theme.border },
                      isSelected && { backgroundColor: `${theme.accent}15` },
                    ]}
                    onPress={() => {
                      onSwitchBranch(item.name);
                      onClose();
                    }}
                    activeOpacity={0.7}
                  >
                    <Octicons
                      name={item.isRemote ? "repo-forked" : "git-branch"}
                      size={14}
                      color={isSelected ? theme.accent : theme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.branchItemName,
                        { color: isSelected ? theme.accent : theme.textPrimary },
                        isSelected && { fontWeight: "700" },
                      ]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark" size={16} color={theme.accent} style={styles.checkIcon} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {/* Create New Branch Row */}
          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            {showCreate ? (
              <View style={styles.createRow}>
                <TextInput
                  style={[
                    styles.newBranchInput,
                    { backgroundColor: theme.bgTertiary, borderColor: theme.border, color: theme.textPrimary },
                  ]}
                  placeholder="New branch name…"
                  placeholderTextColor={theme.textMuted}
                  value={newBranchName}
                  onChangeText={setNewBranchName}
                  autoCapitalize="none"
                  autoFocus
                  showSoftInputOnFocus={!keyboardMouseMode}
                  onSubmitEditing={handleCreate}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[styles.createActionBtn, { backgroundColor: theme.accent }]}
                  onPress={handleCreate}
                >
                  <Text style={styles.createActionText}>Create</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.toggleCreateBtn}
                onPress={() => setShowCreate(true)}
              >
                <Ionicons name="add" size={16} color={theme.accent} />
                <Text style={[styles.toggleCreateText, { color: theme.accent }]}>New Branch…</Text>
              </TouchableOpacity>
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
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    maxHeight: 500,
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
  title: {
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  closeBtn: {
    padding: 2,
  },
  searchRow: {
    padding: 10,
  },
  searchInput: {
    height: 36,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 12,
  },
  branchList: {
    maxHeight: 280,
  },
  loadingBox: {
    padding: 24,
    alignItems: "center",
  },
  branchItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  branchItemName: {
    fontSize: 12.5,
    flex: 1,
  },
  checkIcon: {
    marginLeft: "auto",
  },
  footer: {
    padding: 10,
    borderTopWidth: 1,
  },
  toggleCreateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    gap: 6,
  },
  toggleCreateText: {
    fontSize: 12,
    fontWeight: "600",
  },
  createRow: {
    flexDirection: "row",
    gap: 8,
  },
  newBranchInput: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 12,
  },
  createActionBtn: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  createActionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
});
