import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useKeyboardMouseMode } from "../../context/KeyboardMouseContext";
import { updateRepo, deleteRepo, fetchCollaborators } from "../../services/gitHubRepoWriteService";
import { fetchRepo } from "../../services/gitHubRepoService";
import { showAppDialog } from "../../services/appDialog";
import { useGitHubAction, useGitHubResource } from "./useGitHubResource";
import { GitHubNavigation } from "./useGitHubNavigation";
import { GitHubRepo } from "../../services/gitHubTypes";
import { LoadingState, ErrorState, EmptyState } from "./GitHubStates";

/**
 * Repo settings for the signed-in owner: name, description, homepage,
 * topics, archive toggle, and delete (confirms, since GitHub itself asks
 * you to be sure). Collaborators are listed read-only. Outer component
 * fetches; the form initializes cleanly from the loaded repo.
 */

export function GitHubRepoSettingsView({
  owner,
  repo,
  nav,
}: {
  owner: string;
  repo: string;
  nav: GitHubNavigation;
}) {
  const detail = useGitHubResource(() => fetchRepo(owner, repo), [owner, repo]);

  if (detail.loading && !detail.data) return <LoadingState />;
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.refresh} />;
  if (!detail.data) return <EmptyState text="Repository not found." />;

  return <SettingsForm owner={owner} repo={repo} detail={detail.data} nav={nav} />;
}

function SettingsForm({
  owner,
  repo,
  detail,
  nav,
}: {
  owner: string;
  repo: string;
  detail: GitHubRepo;
  nav: GitHubNavigation;
}) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const [name, setName] = useState(detail.name);
  const [description, setDescription] = useState(detail.description);
  const [homepage, setHomepage] = useState(detail.homepage);
  const [topics, setTopics] = useState((detail.topics || []).join(", "));
  const [archived, setArchived] = useState(!!detail.isArchived);
  const action = useGitHubAction();

  const collaborators = useGitHubResource(() => fetchCollaborators(owner, repo), [owner, repo]);

  const save = () => {
    const newName = name.trim();
    if (!newName) return;
    void action.run(
      () =>
        updateRepo(owner, repo, {
          name: newName !== repo ? newName : undefined,
          description: description.trim(),
          homepage: homepage.trim(),
          topics: topics.split(",").map((t) => t.trim()).filter(Boolean),
          archived,
        }),
      () => {
        if (newName !== repo) nav.replace({ name: "repo", owner, repo: newName });
        else nav.pop();
      }
    );
  };

  const confirmDelete = () => {
    showAppDialog({
      title: `Delete ${owner}/${repo}?`,
      message: "This removes the repository, its issues, PRs and history on GitHub. This cannot be undone.",
      buttons: [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void action.run(() => deleteRepo(owner, repo), () => nav.popToRoot());
          },
        },
      ],
    });
  };

  return (
    <ScrollView style={styles.wrap} keyboardShouldPersistTaps="handled">
      <Text style={[styles.label, { color: theme.textSecondary }]}>Repository name</Text>
      <Field value={name} onChangeText={setName} theme={theme} keyboardMouseMode={keyboardMouseMode} autoCapitalize="none" />

      <Text style={[styles.label, { color: theme.textSecondary }]}>Description</Text>
      <Field value={description} onChangeText={setDescription} theme={theme} keyboardMouseMode={keyboardMouseMode} />

      <Text style={[styles.label, { color: theme.textSecondary }]}>Website</Text>
      <Field value={homepage} onChangeText={setHomepage} theme={theme} keyboardMouseMode={keyboardMouseMode} placeholder="https://..." autoCapitalize="none" />

      <Text style={[styles.label, { color: theme.textSecondary }]}>Topics (comma separated)</Text>
      <Field value={topics} onChangeText={setTopics} theme={theme} keyboardMouseMode={keyboardMouseMode} placeholder="cli, typescript" autoCapitalize="none" />

      <TouchableOpacity
        style={[styles.toggleRow, { borderColor: theme.border }]}
        onPress={() => setArchived((v) => !v)}
        activeOpacity={0.7}
      >
        <Octicons name={archived ? "check-circle" : "circle"} size={13} color={archived ? theme.accentGold : theme.textMuted} />
        <View style={styles.toggleText}>
          <Text style={[styles.toggleTitle, { color: theme.textPrimary }]}>Archive repository</Text>
          <Text style={[styles.toggleSub, { color: theme.textMuted }]}>Read-only: issues and PRs close, pushes rejected.</Text>
        </View>
      </TouchableOpacity>

      {!!action.error && <Text style={[styles.error, { color: theme.accentRed }]}>{action.error}</Text>}

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: action.busy ? theme.bgTertiary : theme.accent }]}
        onPress={save}
        disabled={action.busy || !name.trim()}
        activeOpacity={0.8}
      >
        <Text style={[styles.saveText, { color: action.busy ? theme.textMuted : "#fff" }]}>
          {action.busy ? "Saving..." : "Save changes"}
        </Text>
      </TouchableOpacity>

      <View style={[styles.section, { borderTopColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>COLLABORATORS</Text>
        {collaborators.loading && !collaborators.data ? (
          <LoadingState />
        ) : collaborators.error ? (
          <ErrorState error={collaborators.error} onRetry={collaborators.refresh} compact />
        ) : (collaborators.data || []).length === 0 ? (
          <EmptyState text="No collaborators (or the token cannot list them)." />
        ) : (
          (collaborators.data || []).map((c) => (
            <View key={c.login} style={[styles.collabRow, { borderBottomColor: theme.border }]}>
              <Octicons name="person" size={11} color={theme.textMuted} />
              <Text style={[styles.collabName, { color: theme.textPrimary }]} numberOfLines={1}>
                {c.login}
              </Text>
              <Text style={[styles.collabRole, { color: theme.textMuted }]}>{c.role}</Text>
            </View>
          ))
        )}
      </View>

      <View style={[styles.section, { borderTopColor: theme.border }]}>
        <Text style={[styles.dangerTitle, { color: theme.accentRed }]}>Danger zone</Text>
        <TouchableOpacity style={[styles.dangerBtn, { borderColor: theme.accentRed }]} onPress={confirmDelete} activeOpacity={0.8}>
          <Octicons name="trash" size={12} color={theme.accentRed} />
          <Text style={[styles.dangerBtnText, { color: theme.accentRed }]}>Delete this repository</Text>
        </TouchableOpacity>
      </View>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function Field({
  value,
  onChangeText,
  theme,
  keyboardMouseMode,
  placeholder,
  autoCapitalize = "sentences",
}: {
  value: string;
  onChangeText: (v: string) => void;
  theme: any;
  keyboardMouseMode: boolean;
  placeholder?: string;
  autoCapitalize?: "none" | "sentences";
}) {
  return (
    <TextInput
      style={[styles.field, { color: theme.textPrimary, backgroundColor: theme.bgInput, borderColor: theme.border }]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.textMuted}
      autoCapitalize={autoCapitalize}
      showSoftInputOnFocus={!keyboardMouseMode}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 14 },
  label: { fontSize: 11, fontWeight: "700", marginTop: 12, marginBottom: 4 },
  field: { borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, height: 38, fontSize: 12.5 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, marginTop: 16 },
  toggleText: { flex: 1, gap: 2 },
  toggleTitle: { fontSize: 12.5, fontWeight: "700" },
  toggleSub: { fontSize: 10.5 },
  error: { fontSize: 11.5, marginTop: 10 },
  saveBtn: { height: 40, borderRadius: 9, alignItems: "center", justifyContent: "center", marginTop: 16 },
  saveText: { fontSize: 12.5, fontWeight: "800" },
  section: { marginTop: 22, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  sectionTitle: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6, marginBottom: 6 },
  collabRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  collabName: { flex: 1, fontSize: 12, fontWeight: "600" },
  collabRole: { fontSize: 10 },
  dangerTitle: { fontSize: 12.5, fontWeight: "800", marginBottom: 8 },
  dangerBtn: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, height: 36 },
  dangerBtnText: { fontSize: 11.5, fontWeight: "700" },
});
