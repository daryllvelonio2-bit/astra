import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Switch, StyleSheet } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useKeyboardMouseMode } from "../../context/KeyboardMouseContext";
import { createRepo } from "../../services/gitHubRepoWriteService";
import { useGitHubAction } from "./useGitHubResource";
import { GitHubNavigation } from "./useGitHubNavigation";

/**
 * Create-repository form — the fields github.com actually uses, nothing
 * more: name, description, visibility, init, .gitignore template. On
 * success the router jumps straight into the new repo.
 */

export function GitHubNewRepoView({ nav, onCreated }: { nav: GitHubNavigation; onCreated?: () => void }) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [autoInit, setAutoInit] = useState(true);
  const [gitignore, setGitignore] = useState("");
  const action = useGitHubAction();

  const valid = name.trim().length > 0 && /^[a-zA-Z0-9_.-]+$/.test(name.trim());

  const submit = () => {
    void action.run<{ fullName: string; htmlUrl: string }>(
      () =>
        createRepo({
          name: name.trim(),
          description: description.trim() || undefined,
          isPrivate,
          autoInit,
          gitignoreTemplate: gitignore.trim() || undefined,
        }),
      (data) => {
        onCreated?.();
        const [owner, repo] = (data.fullName || name.trim()).split("/");
        if (owner && repo) nav.replace({ name: "repo", owner, repo });
        else nav.popToRoot();
      }
    );
  };

  return (
    <ScrollView style={styles.wrap} keyboardShouldPersistTaps="handled">
      <Text style={[styles.heading, { color: theme.textPrimary }]}>Create a new repository</Text>
      <Text style={[styles.sub, { color: theme.textMuted }]}>
        A repository contains all project files, history and collaboration.
      </Text>

      <Label text="Repository name *" theme={theme} />
      <TextInput
        style={[styles.input, { color: theme.textPrimary, backgroundColor: theme.bgInput, borderColor: theme.border }]}
        value={name}
        onChangeText={setName}
        placeholder="my-project"
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        showSoftInputOnFocus={!keyboardMouseMode}
      />
      {!!name && !valid && (
        <Text style={[styles.warn, { color: theme.accentRed }]}>
          Only letters, numbers, dots, hyphens and underscores.
        </Text>
      )}

      <Label text="Description (optional)" theme={theme} />
      <TextInput
        style={[styles.input, { color: theme.textPrimary, backgroundColor: theme.bgInput, borderColor: theme.border }]}
        value={description}
        onChangeText={setDescription}
        placeholder="What is this repository for?"
        placeholderTextColor={theme.textMuted}
        autoCapitalize="sentences"
        showSoftInputOnFocus={!keyboardMouseMode}
      />

      <View style={[styles.switchRow, { borderColor: theme.border }]}>
        <View style={styles.switchText}>
          <Text style={[styles.switchTitle, { color: theme.textPrimary }]}>Private</Text>
          <Text style={[styles.sub, { color: theme.textMuted }]}>Only you and collaborators can see it.</Text>
        </View>
        <Switch
          value={isPrivate}
          onValueChange={setIsPrivate}
          trackColor={{ false: theme.bgTertiary, true: theme.accent }}
          thumbColor={theme.textPrimary}
        />
      </View>

      <View style={[styles.switchRow, { borderColor: theme.border }]}>
        <View style={styles.switchText}>
          <Text style={[styles.switchTitle, { color: theme.textPrimary }]}>Initialize with a README</Text>
          <Text style={[styles.sub, { color: theme.textMuted }]}>Adds an initial commit you can clone right away.</Text>
        </View>
        <Switch
          value={autoInit}
          onValueChange={setAutoInit}
          trackColor={{ false: theme.bgTertiary, true: theme.accent }}
          thumbColor={theme.textPrimary}
        />
      </View>

      <Label text="Add .gitignore (optional template name)" theme={theme} />
      <TextInput
        style={[styles.input, { color: theme.textPrimary, backgroundColor: theme.bgInput, borderColor: theme.border }]}
        value={gitignore}
        onChangeText={setGitignore}
        placeholder="Node, Python, Rust..."
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        showSoftInputOnFocus={!keyboardMouseMode}
      />

      {!!action.error && <Text style={[styles.warn, { color: theme.accentRed }]}>{action.error}</Text>}

      <TouchableOpacity
        style={[styles.submit, { backgroundColor: valid && !action.busy ? theme.accent : theme.bgTertiary }]}
        onPress={submit}
        disabled={!valid || action.busy}
        activeOpacity={0.8}
      >
        <Octicons name="repo" size={13} color={valid ? "#fff" : theme.textMuted} />
        <Text style={[styles.submitText, { color: valid ? "#fff" : theme.textMuted }]}>
          {action.busy ? "Creating..." : "Create repository"}
        </Text>
      </TouchableOpacity>
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

function Label({ text, theme }: { text: string; theme: { textSecondary: string } }) {
  return <Text style={[styles.label, { color: theme.textSecondary }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 14 },
  heading: { fontSize: 15, fontWeight: "800", marginTop: 12 },
  sub: { fontSize: 11, lineHeight: 15 },
  label: { fontSize: 11, fontWeight: "700", marginTop: 14, marginBottom: 4 },
  input: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    height: 38,
    fontSize: 12.5,
  },
  warn: { fontSize: 11, marginTop: 5 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
  },
  switchText: { flex: 1, gap: 2 },
  switchTitle: { fontSize: 12.5, fontWeight: "700" },
  submit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    height: 40,
    borderRadius: 9,
    marginTop: 18,
  },
  submitText: { fontSize: 12.5, fontWeight: "800" },
});
