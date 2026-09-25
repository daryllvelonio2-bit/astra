import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView } from "react-native";
import { showAppDialog } from "../../services/appDialog";
import { Ionicons, Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useAccurateKeyboard } from "../../../theme/useAccurateKeyboard";
import {
  configureGitCredentials,
  getSshPublicKey,
  generateSshKey,
} from "../../services/gitService";
import { Clipboard } from "../../services/clipboardService";
import { GitTokenTab } from "./GitTokenTab";
import { GitSshKeyTab } from "./GitSshKeyTab";
import { GitBrowserLoginTab } from "./GitBrowserLoginTab";

interface GitCredentialsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function GitCredentialsModal({ visible, onClose }: GitCredentialsModalProps) {
  const { theme } = useTheme();
  const { isKeyboardVisible, keyboardOffset } = useAccurateKeyboard(12);
  const [activeTab, setActiveTab] = useState<"browser" | "token" | "ssh">("browser");

  // Token state
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [savingToken, setSavingToken] = useState(false);

  // SSH state
  const [sshKey, setSshKey] = useState<string | null>(null);
  const [loadingSsh, setLoadingSsh] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  useEffect(() => {
    if (visible) {
      loadSshKey();
      setCopiedKey(false);
    }
  }, [visible]);

  const loadSshKey = async () => {
    setLoadingSsh(true);
    const key = await getSshPublicKey();
    setSshKey(key);
    setLoadingSsh(false);
  };

  const handleGenerateSsh = async () => {
    setLoadingSsh(true);
    const res = await generateSshKey(email || username);
    setLoadingSsh(false);
    if (res.success && res.publicKey) {
      setSshKey(res.publicKey);
      showAppDialog({ title: "SSH Key Generated", message: "Your ed25519 SSH key has been created. Copy the public key below and add it to GitHub." });
    } else {
      showAppDialog({ title: "Error", message: res.error || "Failed to generate SSH key" });
    }
  };

  const handleCopySshKey = async () => {
    if (!sshKey) return;
    await Clipboard.setStringAsync(sshKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 3000);
    showAppDialog({ title: "Copied!", message: "SSH public key copied to clipboard. Go to GitHub -> Settings -> SSH and GPG keys -> New SSH key, and paste it." });
  };

  const handleSaveToken = async () => {
    if (!token.trim() || !username.trim()) {
      showAppDialog({ title: "Missing information", message: "Please provide at least your GitHub username and token." });
      return;
    }
    setSavingToken(true);
    const ok = await configureGitCredentials(
      token.trim(),
      username.trim(),
      email.trim() || `${username.trim()}@users.noreply.github.com`
    );
    setSavingToken(false);
    if (ok) {
      showAppDialog({ title: "Saved", message: "GitHub credentials configured successfully. Push and pull will now authenticate automatically." });
      onClose();
    } else {
      showAppDialog({ title: "Error", message: "Could not configure git credentials." });
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, isKeyboardVisible && { paddingBottom: keyboardOffset }]}>
        <View
          style={[
            styles.modalCard,
            { backgroundColor: theme.bgSecondary, borderColor: theme.border },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <Octicons name="key" size={16} color={theme.accent} />
            <Text style={[styles.title, { color: theme.textPrimary }]}>
              GitHub Authentication
            </Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Auth Method Tabs */}
          <View style={[styles.tabBar, { borderBottomColor: theme.border }]}>
            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === "browser" && {
                  borderBottomColor: theme.accent,
                  borderBottomWidth: 2,
                },
              ]}
              onPress={() => setActiveTab("browser")}
            >
              <Octicons
                name="mark-github"
                size={13}
                color={activeTab === "browser" ? theme.accent : theme.textSecondary}
              />
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === "browser" ? theme.accent : theme.textSecondary },
                  activeTab === "browser" && { fontWeight: "700" },
                ]}
              >
                Browser
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === "token" && {
                  borderBottomColor: theme.accent,
                  borderBottomWidth: 2,
                },
              ]}
              onPress={() => setActiveTab("token")}
            >
              <Octicons
                name="shield-check"
                size={13}
                color={activeTab === "token" ? theme.accent : theme.textSecondary}
              />
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === "token" ? theme.accent : theme.textSecondary },
                  activeTab === "token" && { fontWeight: "700" },
                ]}
              >
                Fine-Grained Token
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === "ssh" && {
                  borderBottomColor: theme.accent,
                  borderBottomWidth: 2,
                },
              ]}
              onPress={() => setActiveTab("ssh")}
            >
              <Octicons
                name="terminal"
                size={13}
                color={activeTab === "ssh" ? theme.accent : theme.textSecondary}
              />
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === "ssh" ? theme.accent : theme.textSecondary },
                  activeTab === "ssh" && { fontWeight: "700" },
                ]}
              >
                SSH Key
              </Text>
            </TouchableOpacity>
          </View>

          {/* Body */}
          <ScrollView contentContainerStyle={styles.body}>
            {activeTab === "browser" ? (
              <GitBrowserLoginTab />
            ) : activeTab === "token" ? (
              <GitTokenTab
                username={username}
                email={email}
                token={token}
                saving={savingToken}
                onChangeUsername={setUsername}
                onChangeEmail={setEmail}
                onChangeToken={setToken}
                onSave={handleSaveToken}
              />
            ) : (
              <GitSshKeyTab
                sshKey={sshKey}
                loading={loadingSsh}
                copiedKey={copiedKey}
                onCopyKey={handleCopySshKey}
                onGenerateKey={handleGenerateSsh}
              />
            )}
          </ScrollView>
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
    maxHeight: "90%",
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
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  tabText: {
    fontSize: 12,
  },
  body: {
    padding: 14,
  },
});
