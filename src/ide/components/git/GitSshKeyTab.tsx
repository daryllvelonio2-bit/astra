import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons, Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";

interface GitSshKeyTabProps {
  sshKey: string | null;
  loading: boolean;
  copiedKey: boolean;
  onCopyKey: () => void;
  onGenerateKey: () => void;
}

export function GitSshKeyTab({
  sshKey,
  loading,
  copiedKey,
  onCopyKey,
  onGenerateKey,
}: GitSshKeyTabProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.infoBox, { backgroundColor: `${theme.accent}12`, borderColor: `${theme.accent}33` }]}>
        <Text style={[styles.infoTitle, { color: theme.accent }]}>
          SSH Key Authentication (Ed25519)
        </Text>
        <Text style={[styles.infoBody, { color: theme.textSecondary }]}>
          SSH keys never expire and require zero passwords. Add this public key to GitHub under{" "}
          <Text style={{ fontWeight: "700" }}>Settings → SSH and GPG keys → New SSH key</Text>.
        </Text>
      </View>

      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="small" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Checking SSH keys…
          </Text>
        </View>
      ) : sshKey ? (
        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>
            Your Public Key (id_ed25519.pub)
          </Text>
          <View
            style={[
              styles.keyBox,
              { backgroundColor: theme.bgTertiary, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.keyText, { color: theme.textPrimary }]} selectable>
              {sshKey}
            </Text>
          </View>

          <View style={styles.sshBtnRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { flex: 1, backgroundColor: theme.accent }]}
              onPress={onCopyKey}
              activeOpacity={0.8}
            >
              <Ionicons
                name={copiedKey ? "checkmark-circle" : "copy-outline"}
                size={15}
                color="#fff"
              />
              <Text style={styles.actionBtnText}>
                {copiedKey ? "Copied!" : "Copy Public Key"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.secondaryBtn,
                { backgroundColor: theme.bgTertiary, borderColor: theme.border },
              ]}
              onPress={onGenerateKey}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={13} color={theme.textSecondary} />
              <Text style={[styles.secondaryBtnText, { color: theme.textSecondary }]}>
                Regenerate
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.remoteHint, { color: theme.textMuted }]}>
            Tip: When cloning or pushing via SSH, use{" "}
            <Text style={{ fontFamily: "monospace", color: theme.accent }}>
              git@github.com:user/repo.git
            </Text>{" "}
            as your remote URL.
          </Text>
        </View>
      ) : (
        <View style={styles.emptySsh}>
          <Octicons name="key" size={32} color={theme.textMuted} />
          <Text style={[styles.emptySshTitle, { color: theme.textPrimary }]}>
            No SSH Key Found
          </Text>
          <Text style={[styles.emptySshBody, { color: theme.textSecondary }]}>
            Generate a secure ed25519 SSH key with 1 tap.
          </Text>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              { backgroundColor: theme.accent, alignSelf: "stretch" },
            ]}
            onPress={onGenerateKey}
            activeOpacity={0.8}
          >
            <Text style={styles.actionBtnText}>Generate SSH Key</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
  field: {
    gap: 4,
  },
  label: {
    fontSize: 11.5,
    fontWeight: "600",
  },
  actionBtn: {
    height: 38,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 12,
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 12.5,
    fontWeight: "700",
  },
  secondaryBtn: {
    height: 38,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 12,
  },
  secondaryBtnText: {
    fontSize: 11.5,
    fontWeight: "600",
  },
  centerLoading: {
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
  },
  keyBox: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    maxHeight: 90,
  },
  keyText: {
    fontFamily: "monospace",
    fontSize: 10,
    lineHeight: 14,
  },
  sshBtnRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  remoteHint: {
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: 4,
  },
  emptySsh: {
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  emptySshTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  emptySshBody: {
    fontSize: 11.5,
    textAlign: "center",
    maxWidth: 240,
  },
});
