import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { Ionicons, Octicons } from "@expo/vector-icons";
import { ThemeColors } from "../../theme/themeContext";
import {
  configureGitCredentials,
  getSshPublicKey,
  generateSshKey,
} from "../../ide/services/gitService";
import { Clipboard } from "../../ide/services/clipboardService";
import { GitTokenTab } from "../../ide/components/git/GitTokenTab";
import { GitSshKeyTab } from "../../ide/components/git/GitSshKeyTab";

interface GitHubSetupStepProps {
  theme: ThemeColors;
  isLandscape?: boolean;
  onConfigured: () => void;
  onSkip: () => void;
}

export function GitHubSetupStep({
  theme,
  isLandscape = false,
  onConfigured,
  onSkip,
}: GitHubSetupStepProps) {
  const [authMethod, setAuthMethod] = useState<"token" | "ssh">("token");

  // Token state
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const [tokenSaved, setTokenSaved] = useState(false);

  // SSH state
  const [sshKey, setSshKey] = useState<string | null>(null);
  const [loadingSsh, setLoadingSsh] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  useEffect(() => {
    loadSshKey();
  }, []);

  const loadSshKey = async () => {
    setLoadingSsh(true);
    const key = await getSshPublicKey();
    setSshKey(key);
    setLoadingSsh(false);
  };

  const handleSaveToken = async () => {
    if (!token.trim()) {
      Alert.alert("Token Required", "Please enter your GitHub Personal Access Token.");
      return;
    }
    const cleanUsername = username.trim() || "git";
    const cleanEmail = email.trim() || `${cleanUsername}@users.noreply.github.com`;

    setSavingToken(true);
    const ok = await configureGitCredentials(token.trim(), cleanUsername, cleanEmail);
    setSavingToken(false);

    if (ok) {
      setTokenSaved(true);
      onConfigured();
      Alert.alert("Success", "GitHub credentials configured successfully!");
    } else {
      Alert.alert("Error", "Failed to save Git credentials.");
    }
  };

  const handleGenerateSsh = async () => {
    setLoadingSsh(true);
    const res = await generateSshKey(email || username || "astra-app");
    setLoadingSsh(false);
    if (res.success && res.publicKey) {
      setSshKey(res.publicKey);
      onConfigured();
      Alert.alert(
        "SSH Key Created",
        "Your ed25519 key was generated. Tap 'Copy Public Key' and add it to your GitHub account under Settings → SSH keys."
      );
    } else {
      Alert.alert("Error", res.error || "Failed to generate SSH key.");
    }
  };

  const handleCopyKey = () => {
    if (!sshKey) return;
    Clipboard.setStringAsync(sshKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
      <View style={styles.headerWrap}>
        <View style={styles.headerTitleRow}>
          <Text style={[styles.stepTitle, { color: theme.textPrimary }]}>
            Connect GitHub
          </Text>
          <View style={[styles.optionalBadge, { backgroundColor: `${theme.accent}14` }]}>
            <Text style={[styles.optionalText, { color: theme.accent }]}>Optional</Text>
          </View>
        </View>
        <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
          Enable 1-tap git push, pull, and repository management. You can also skip and set this up anytime.
        </Text>
      </View>

      {/* Auth Method Switcher */}
      <View style={[styles.tabBar, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
        <TouchableOpacity
          style={[
            styles.tabBtn,
            authMethod === "token" && [styles.activeTabBtn, { backgroundColor: theme.bgTertiary }],
          ]}
          onPress={() => setAuthMethod("token")}
          activeOpacity={0.7}
        >
          <Octicons
            name="key"
            size={14}
            color={authMethod === "token" ? theme.accent : theme.textMuted}
          />
          <Text
            style={[
              styles.tabText,
              { color: authMethod === "token" ? theme.textPrimary : theme.textMuted },
              authMethod === "token" && styles.activeTabText,
            ]}
          >
            Token
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabBtn,
            authMethod === "ssh" && [styles.activeTabBtn, { backgroundColor: theme.bgTertiary }],
          ]}
          onPress={() => setAuthMethod("ssh")}
          activeOpacity={0.7}
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={14}
            color={authMethod === "ssh" ? theme.accent : theme.textMuted}
          />
          <Text
            style={[
              styles.tabText,
              { color: authMethod === "ssh" ? theme.textPrimary : theme.textMuted },
              authMethod === "ssh" && styles.activeTabText,
            ]}
          >
            SSH Key
          </Text>
        </TouchableOpacity>
      </View>

      {/* Active Method Form */}
      <View style={[styles.formCard, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
        {authMethod === "token" ? (
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
            onCopyKey={handleCopyKey}
            onGenerateKey={handleGenerateSsh}
          />
        )}
      </View>

      {/* Skip / Later Option */}
      <TouchableOpacity
        style={[styles.skipOptionRow, { borderColor: theme.border }]}
        onPress={onSkip}
        activeOpacity={0.7}
      >
        <Ionicons name="information-circle-outline" size={16} color={theme.textMuted} />
        <Text style={[styles.skipOptionText, { color: theme.textMuted }]}>
          Don't have a GitHub token ready? You can skip and set this up later in the Git tab.
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    gap: 14,
    paddingBottom: 24,
  },
  headerWrap: {
    gap: 4,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  optionalBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  optionalText: {
    fontSize: 10.5,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  stepSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  tabBar: {
    flexDirection: "row",
    padding: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  activeTabBtn: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "600",
  },
  activeTabText: {
    fontWeight: "700",
  },
  formCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    overflow: "hidden",
  },
  skipOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  skipOptionText: {
    fontSize: 11.5,
    lineHeight: 16,
    flex: 1,
  },
});
