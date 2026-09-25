import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import type { ResetMode } from "../../services/gitCommitActions";

export interface CommitActionHandlers {
  amend: (message: string) => void;
  reset: (mode: ResetMode) => void;
  checkout: () => void;
  revert: () => void;
  createBranch: (name: string) => void;
  createTag: (name: string) => void;
  cherryPick: () => void;
  copySha: () => void;
  viewOnGitHub: () => void;
}

interface GitCommitActionsModalProps {
  visible: boolean;
  anchor: { x: number; y: number };
  commitSummary: string;
  amendInitialMessage: string;
  shortHash: string;
  canViewOnGitHub: boolean;
  busy: boolean;
  onClose: () => void;
  actions: CommitActionHandlers;
}

type Panel = "menu" | "amend" | "reset" | "branch" | "tag";

const ROW_ICON_SIZE = 15;
const MENU_WIDTH = 260;

export function GitCommitActionsModal({
  visible,
  anchor,
  commitSummary,
  amendInitialMessage,
  shortHash,
  canViewOnGitHub,
  busy,
  onClose,
  actions,
}: GitCommitActionsModalProps) {
  const { theme } = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();
  const [panel, setPanel] = useState<Panel>("menu");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  // Measured so the sheet can flip left/up when it would overflow the screen.
  const [size, setSize] = useState({ w: MENU_WIDTH, h: 320 });

  const placeSheet = () => {
    const GAP = 6;
    const EDGE = 8;
    let left = anchor.x + GAP;
    if (left + size.w > winW - EDGE) left = anchor.x - size.w - GAP;
    left = Math.max(EDGE, Math.min(left, Math.max(EDGE, winW - size.w - EDGE)));
    let top = anchor.y + GAP;
    if (top + size.h > winH - EDGE) top = anchor.y - size.h - GAP;
    top = Math.max(EDGE, Math.min(top, Math.max(EDGE, winH - size.h - EDGE)));
    return { left, top };
  };

  const close = () => {
    setPanel("menu");
    setText("");
    setError("");
    onClose();
  };

  const openPanel = (p: Panel, initial = "") => {
    setText(initial);
    setError("");
    setPanel(p);
  };

  const submit = () => {
    const value = text.trim();
    if (panel === "amend") {
      if (!value) return setError("Message cannot be empty.");
      actions.amend(value);
      return close();
    }
    if (panel === "branch" || panel === "tag") {
      if (!value) return setError(`A ${panel === "branch" ? "branch" : "tag"} name is required.`);
      if (/\s/.test(value)) return setError("No spaces allowed.");
      if (panel === "branch") actions.createBranch(value);
      else actions.createTag(value);
      return close();
    }
  };

  const MenuRow = ({
    icon,
    label,
    danger,
    disabled,
    onPress,
  }: {
    icon: keyof typeof Octicons.glyphMap;
    label: string;
    danger?: boolean;
    disabled?: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={disabled || busy}
      activeOpacity={0.6}
    >
      <Octicons
        name={icon}
        size={ROW_ICON_SIZE}
        color={danger ? theme.accentRed : theme.textSecondary}
      />
      <Text
        style={[
          styles.rowText,
          { color: danger ? theme.accentRed : theme.textPrimary },
          disabled && styles.rowDisabled,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const Divider = () => <View style={[styles.divider, { backgroundColor: theme.border }]} />;

  const renderInputPanel = (placeholder: string, multiline = false) => (
    <View style={styles.panelBody}>
      <TextInput
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          {
            backgroundColor: theme.bgTertiary,
            color: theme.textPrimary,
            borderColor: theme.border,
          },
        ]}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        value={text}
        onChangeText={setText}
        multiline={multiline}
        autoCorrect={false}
        autoCapitalize={panel === "tag" ? "none" : undefined}
        onFocus={() => setError("")}
      />
      {error !== "" && (
        <Text style={[styles.errorText, { color: theme.accentRed }]}>{error}</Text>
      )}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.cancelBtn, { borderColor: theme.border }]}
          onPress={close}
        >
          <Text style={[styles.buttonText, { color: theme.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmBtn, { backgroundColor: theme.accent }]}
          onPress={submit}
        >
          <Text style={[styles.buttonText, { color: "#fff" }]}>Confirm</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        {/* Dismiss layer sits *under* the sheet; rows capture their own taps. */}
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
        <View
          style={[
            styles.sheet,
            placeSheet(),
            { backgroundColor: theme.bgSecondary, borderColor: theme.border },
          ]}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
          }}
        >
            <View style={styles.header}>
              <View style={styles.headerTextWrap}>
                <Text style={[styles.headerTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                  {commitSummary}
                </Text>
                <Text style={[styles.headerHash, { color: theme.textMuted }]}>#{shortHash}</Text>
              </View>
              <TouchableOpacity onPress={close} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Octicons name="x" size={16} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            {busy && (
              <View style={[styles.busyBar, { backgroundColor: `${theme.accent}22` }]}>
                <Text style={[styles.busyText, { color: theme.accent }]}>Running git command…</Text>
              </View>
            )}

            {panel === "menu" && (
              <ScrollView style={[styles.menuScroll, { maxHeight: Math.max(200, winH - 140) }]}>
                <MenuRow
                  icon="pencil"
                  label="Amend commit"
                  onPress={() => openPanel("amend", amendInitialMessage)}
                />
                <MenuRow
                  icon="sync"
                  label="Reset to commit"
                  onPress={() => setPanel("reset")}
                />
                <MenuRow icon="check-circle" label="Checkout commit" onPress={actions.checkout} />
                <MenuRow icon="reply" label="Revert changes in commit" onPress={actions.revert} />
                <Divider />
                <MenuRow icon="git-branch" label="Create branch from commit" onPress={() => setPanel("branch")} />
                <MenuRow icon="tag" label="Create tag" onPress={() => setPanel("tag")} />
                <MenuRow icon="rocket" label="Cherry-pick commit" onPress={actions.cherryPick} />
                <Divider />
                <MenuRow icon="copy" label="Copy SHA" onPress={actions.copySha} />
                <MenuRow
                  icon="link-external"
                  label="View on GitHub"
                  disabled={!canViewOnGitHub}
                  onPress={actions.viewOnGitHub}
                />
              </ScrollView>
            )}

            {panel === "amend" && renderInputPanel("New commit message", true)}

            {panel === "reset" && (
              <View style={styles.panelBody}>
                <Text style={[styles.panelHint, { color: theme.textMuted }]}>
                  Reset moves the current branch to #{shortHash}.
                </Text>
                <MenuRow
                  icon="file"
                  label="Soft — keep staged changes"
                  onPress={() => {
                    actions.reset("soft");
                    close();
                  }}
                />
                <MenuRow
                  icon="dash"
                  label="Mixed — keep working changes"
                  onPress={() => {
                    actions.reset("mixed");
                    close();
                  }}
                />
                <MenuRow
                  icon="trash"
                  label="Hard — discard all changes"
                  danger
                  onPress={() => {
                    actions.reset("hard");
                    close();
                  }}
                />
              </View>
            )}

            {panel === "branch" && renderInputPanel("new-branch-name")}
            {panel === "tag" && renderInputPanel("v1.0.0")}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    position: "absolute",
    width: MENU_WIDTH,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.25)",
  },
  headerTextWrap: { flex: 1 },
  headerTitle: { fontSize: 13, fontWeight: "700" },
  headerHash: { fontSize: 10.5, fontFamily: "monospace", marginTop: 2 },
  busyBar: { paddingHorizontal: 14, paddingVertical: 8 },
  busyText: { fontSize: 11.5, fontWeight: "600" },
  menuScroll: { maxHeight: 380 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowText: { fontSize: 13, fontWeight: "500" },
  rowDisabled: { opacity: 0.4 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  panelBody: { padding: 14, gap: 10 },
  panelHint: { fontSize: 11.5, marginBottom: 2 },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
    minHeight: 40,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: "top" },
  errorText: { fontSize: 11.5 },
  buttonRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  cancelBtn: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: "center",
  },
  confirmBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  buttonText: { fontSize: 12.5, fontWeight: "700" },
});