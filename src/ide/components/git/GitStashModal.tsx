import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons, Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useAccurateKeyboard } from "../../../theme/useAccurateKeyboard";
import { useKeyboardMouseMode } from "../../context/KeyboardMouseContext";
import type { StashEntry } from "../../services/gitStashService";

interface GitStashModalProps {
  visible: boolean;
  stashes: StashEntry[];
  busy: boolean;
  onClose: () => void;
  onSave: (message: string, includeUntracked: boolean) => void;
  onApply: (ref: string) => void;
  onPop: (ref: string) => void;
  onDrop: (ref: string) => void;
}

/**
 * Stash shelf: save the working tree with an optional message, then
 * apply / pop / drop each entry. One feature = one file.
 */
export function GitStashModal({
  visible,
  stashes,
  busy,
  onClose,
  onSave,
  onApply,
  onPop,
  onDrop,
}: GitStashModalProps) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const { isKeyboardVisible, keyboardOffset } = useAccurateKeyboard(12);
  const [message, setMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(false);

  const handleSave = () => {
    onSave(message.trim(), includeUntracked);
    setMessage("");
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, isKeyboardVisible && { paddingBottom: keyboardOffset }]}>
        <View style={[styles.modalCard, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <Octicons name="archive" size={16} color={theme.accent} />
            <Text style={[styles.title, { color: theme.textPrimary }]}>Stash</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close stash">
              <Ionicons name="close" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.saveRow}>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: theme.bgTertiary, borderColor: theme.border, color: theme.textPrimary },
              ]}
              placeholder="Stash message (optional)…"
              placeholderTextColor={theme.textMuted}
              value={message}
              onChangeText={setMessage}
              autoCapitalize="none"
              autoCorrect={false}
              showSoftInputOnFocus={!keyboardMouseMode}
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
            <View style={styles.saveActions}>
              <TouchableOpacity
                style={styles.untrackedRow}
                onPress={() => setIncludeUntracked((v) => !v)}
                activeOpacity={0.7}
                accessibilityLabel="Include untracked files"
              >
                <Ionicons
                  name={includeUntracked ? "checkbox" : "square-outline"}
                  size={15}
                  color={includeUntracked ? theme.accent : theme.textMuted}
                />
                <Text style={[styles.untrackedText, { color: theme.textSecondary }]}>Untracked</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: theme.accent }]}
                onPress={handleSave}
                disabled={busy}
                accessibilityLabel="Save stash"
              >
                <Text style={styles.saveBtnText}>Stash</Text>
              </TouchableOpacity>
            </View>
          </View>

          <FlatList
            data={stashes}
            keyExtractor={(item) => item.ref}
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={Platform.OS === "android"}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: theme.textMuted }]}>No stashes yet.</Text>
            }
            renderItem={({ item }) => (
              <View style={[styles.row, { borderBottomColor: theme.border }]}>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                    {item.shortMessage}
                  </Text>
                  <Text style={[styles.rowSub, { color: theme.textMuted }]} numberOfLines={1}>
                    {item.ref}
                    {item.epoch > 0 ? ` · ${new Date(item.epoch * 1000).toLocaleDateString()}` : ""}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => onApply(item.ref)} disabled={busy} hitSlop={8}>
                  <Text style={[styles.rowBtn, { color: theme.accent }]}>Apply</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onPop(item.ref)} disabled={busy} hitSlop={8}>
                  <Text style={[styles.rowBtn, { color: theme.accentGreen }]}>Pop</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onDrop(item.ref)} disabled={busy} hitSlop={8}>
                  <Text style={[styles.rowBtn, { color: theme.accentRed }]}>Drop</Text>
                </TouchableOpacity>
              </View>
            )}
          />
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
  saveRow: {
    padding: 10,
    gap: 8,
  },
  input: {
    height: 36,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 12,
  },
  saveActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  untrackedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  untrackedText: {
    fontSize: 12,
  },
  saveBtn: {
    paddingHorizontal: 16,
    height: 32,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  list: {
    maxHeight: 280,
  },
  empty: {
    textAlign: "center",
    padding: 20,
    fontSize: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  rowSub: {
    fontSize: 11,
  },
  rowBtn: {
    fontSize: 12,
    fontWeight: "600",
  },
});
