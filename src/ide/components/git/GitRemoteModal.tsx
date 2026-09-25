import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, Modal, StyleSheet, ActivityIndicator } from "react-native";
import { showAppDialog } from "../../services/appDialog";
import { Ionicons, Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useAccurateKeyboard } from "../../../theme/useAccurateKeyboard";
import { useKeyboardMouseMode } from "../../context/KeyboardMouseContext";

interface GitRemoteModalProps {
  visible: boolean;
  currentRemoteUrl: string | null;
  onClose: () => void;
  onSaveRemote: (url: string) => Promise<{ success: boolean; error?: string }>;
}

export function GitRemoteModal({
  visible,
  currentRemoteUrl,
  onClose,
  onSaveRemote,
}: GitRemoteModalProps) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const { isKeyboardVisible, keyboardOffset } = useAccurateKeyboard(12);
  const [remoteInput, setRemoteInput] = useState("");
  const [protocol, setProtocol] = useState<"https" | "ssh">("https");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      if (currentRemoteUrl) {
        setRemoteInput(currentRemoteUrl);
        if (currentRemoteUrl.startsWith("git@") || currentRemoteUrl.startsWith("ssh://")) {
          setProtocol("ssh");
        } else {
          setProtocol("https");
        }
      } else {
        setRemoteInput("");
        setProtocol("https");
      }
    }
  }, [visible, currentRemoteUrl]);

  const normalizeUrl = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed) return "";

    // Already a full git URL
    if (trimmed.startsWith("https://") || trimmed.startsWith("http://") || trimmed.startsWith("git@") || trimmed.startsWith("ssh://")) {
      return trimmed.endsWith(".git") ? trimmed : `${trimmed}.git`;
    }

    // Shorthand: username/repo
    const cleanRepo = trimmed.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "");
    if (protocol === "ssh") {
      return `git@github.com:${cleanRepo}.git`;
    }
    return `https://github.com/${cleanRepo}.git`;
  };

  const handleProtocolToggle = (newProto: "https" | "ssh") => {
    setProtocol(newProto);
    const trimmed = remoteInput.trim();
    if (!trimmed) return;

    // Convert existing URL if matching github format
    const match = trimmed.match(/(?:github\.com[:/])([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (match) {
      const user = match[1];
      const repo = match[2];
      if (newProto === "ssh") {
        setRemoteInput(`git@github.com:${user}/${repo}.git`);
      } else {
        setRemoteInput(`https://github.com/${user}/${repo}.git`);
      }
    }
  };

  const handleSave = async () => {
    const finalUrl = normalizeUrl(remoteInput);
    if (!finalUrl) {
      showAppDialog({ title: "Missing URL", message: "Please provide a GitHub repository name or remote URL." });
      return;
    }

    setSaving(true);
    const res = await onSaveRemote(finalUrl);
    setSaving(false);
    if (res.success) {
      showAppDialog({ title: "Remote Saved", message: `Origin set to ${finalUrl}. You can now push and pull.` });
      onClose();
    } else {
      showAppDialog({ title: "Error", message: res.error || "Could not set remote URL." });
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, isKeyboardVisible && { paddingBottom: keyboardOffset }]}>
        <View style={[styles.modalCard, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <Octicons name="globe" size={16} color={theme.accent} />
            <Text style={[styles.title, { color: theme.textPrimary }]}>
              {currentRemoteUrl ? "Repository Remote" : "Publish to GitHub"}
            </Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <View style={styles.body}>
            <View style={[styles.infoBox, { backgroundColor: `${theme.accent}12`, borderColor: `${theme.accent}33` }]}>
              <Text style={[styles.infoTitle, { color: theme.accent }]}>
                Connect to Remote Repository
              </Text>
              <Text style={[styles.infoBody, { color: theme.textSecondary }]}>
                Enter your GitHub <Text style={{ fontWeight: "700" }}>username/repo</Text> or full clone URL. No terminal commands needed.
              </Text>
            </View>

            {/* Protocol Selector */}
            <View style={styles.protoRow}>
              <TouchableOpacity
                style={[
                  styles.protoBtn,
                  protocol === "https" && { backgroundColor: theme.accent, borderColor: theme.accent },
                  protocol !== "https" && { backgroundColor: theme.bgTertiary, borderColor: theme.border },
                ]}
                onPress={() => handleProtocolToggle("https")}
              >
                <Text style={[styles.protoText, { color: protocol === "https" ? "#fff" : theme.textSecondary }]}>
                  HTTPS
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.protoBtn,
                  protocol === "ssh" && { backgroundColor: theme.accent, borderColor: theme.accent },
                  protocol !== "ssh" && { backgroundColor: theme.bgTertiary, borderColor: theme.border },
                ]}
                onPress={() => handleProtocolToggle("ssh")}
              >
                <Text style={[styles.protoText, { color: protocol === "ssh" ? "#fff" : theme.textSecondary }]}>
                  SSH (git@github.com)
                </Text>
              </TouchableOpacity>
            </View>

            {/* Input Field */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                {protocol === "https" ? "Repository (e.g. username/my-repo or https://...)" : "SSH Remote (e.g. username/my-repo or git@...)"}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: theme.bgTertiary, borderColor: theme.border, color: theme.textPrimary },
                ]}
                placeholder={protocol === "https" ? "octocat/my-project" : "git@github.com:octocat/my-project.git"}
                placeholderTextColor={theme.textMuted}
                value={remoteInput}
                onChangeText={setRemoteInput}
                autoCapitalize="none"
                autoCorrect={false}
                showSoftInputOnFocus={!keyboardMouseMode}
                onSubmitEditing={handleSave}
                returnKeyType="done"
              />
            </View>

            {/* Action Buttons */}
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: theme.accent }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>
                  {currentRemoteUrl ? "Update Remote" : "Connect & Publish"}
                </Text>
              )}
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
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
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
  body: {
    padding: 14,
    gap: 12,
  },
  infoBox: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: "700",
  },
  infoBody: {
    fontSize: 11,
    lineHeight: 15,
  },
  protoRow: {
    flexDirection: "row",
    gap: 8,
  },
  protoBtn: {
    flex: 1,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  protoText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  field: {
    gap: 4,
  },
  label: {
    fontSize: 11.5,
    fontWeight: "600",
  },
  input: {
    height: 36,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 12,
  },
  saveBtn: {
    height: 38,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
});
