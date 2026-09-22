import React from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { useTheme } from "../../../theme/themeContext";
import { useKeyboardMouseMode } from "../../context/KeyboardMouseContext";

interface GitTokenTabProps {
  username: string;
  email: string;
  token: string;
  saving: boolean;
  onChangeUsername: (val: string) => void;
  onChangeEmail: (val: string) => void;
  onChangeToken: (val: string) => void;
  onSave: () => void;
}

export function GitTokenTab({
  username,
  email,
  token,
  saving,
  onChangeUsername,
  onChangeEmail,
  onChangeToken,
  onSave,
}: GitTokenTabProps) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();

  return (
    <View style={styles.container}>
      <View style={[styles.infoBox, { backgroundColor: `${theme.accent}12`, borderColor: `${theme.accent}33` }]}>
        <Text style={[styles.infoTitle, { color: theme.accent }]}>
          Fine-Grained Token (Repository Scoped)
        </Text>
        <Text style={[styles.infoBody, { color: theme.textSecondary }]}>
          In GitHub → Settings → Developer Settings → Personal access tokens → Fine-grained tokens.
          Select your repo and grant <Text style={{ fontWeight: "700" }}>Contents: Read and write</Text>.
          Classic tokens are also supported.
        </Text>
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>GitHub Username</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.bgTertiary, borderColor: theme.border, color: theme.textPrimary }]}
          placeholder="e.g. octocat"
          placeholderTextColor={theme.textMuted}
          value={username}
          onChangeText={onChangeUsername}
          autoCapitalize="none"
          showSoftInputOnFocus={!keyboardMouseMode}
        />
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Commit Email (Optional)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.bgTertiary, borderColor: theme.border, color: theme.textPrimary }]}
          placeholder="e.g. octocat@users.noreply.github.com"
          placeholderTextColor={theme.textMuted}
          value={email}
          onChangeText={onChangeEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          showSoftInputOnFocus={!keyboardMouseMode}
        />
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Token (Fine-Grained or Classic)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.bgTertiary, borderColor: theme.border, color: theme.textPrimary }]}
          placeholder="github_pat_... or ghp_..."
          placeholderTextColor={theme.textMuted}
          value={token}
          onChangeText={onChangeToken}
          autoCapitalize="none"
          secureTextEntry
          showSoftInputOnFocus={!keyboardMouseMode}
        />
      </View>

      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: theme.accent }]}
        onPress={onSave}
        disabled={saving}
        activeOpacity={0.8}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.actionBtnText}>Save Token Credentials</Text>
        )}
      </TouchableOpacity>
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
  input: {
    height: 36,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 12,
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
});
