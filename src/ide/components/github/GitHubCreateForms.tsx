import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useKeyboardMouseMode } from "../../context/KeyboardMouseContext";
import { createIssue } from "../../services/gitHubIssueService";
import { createPull } from "../../services/gitHubPullService";
import { createRelease } from "../../services/gitHubRepoWriteService";
import { fetchBranches } from "../../services/gitHubRepoService";
import { useGitHubAction, useGitHubResource } from "./useGitHubResource";
import { GitHubNavigation } from "./useGitHubNavigation";
import { LoadingState } from "./GitHubStates";

/**
 * The four small "new ..." forms: issue, pull request, release. Gists are
 * code-first and stay on github.com. Each submits through its service and
 * navigates to the created object on success.
 */

export function GitHubNewIssueView({ owner, repo, nav }: { owner: string; repo: string; nav: GitHubNavigation }) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const action = useGitHubAction();

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    void action.run(() => createIssue(owner, repo, { title: t, body: body.trim() || undefined }), (issue) =>
      nav.replace({ name: "issue", owner, repo, number: issue.number, isPull: false })
    );
  };

  return (
    <ScrollView style={styles.wrap} keyboardShouldPersistTaps="handled">
      <TextInput
        style={[styles.titleInput, { color: theme.textPrimary, backgroundColor: theme.bgInput, borderColor: theme.border }]}
        value={title}
        onChangeText={setTitle}
        placeholder="Issue title"
        placeholderTextColor={theme.textMuted}
        autoCapitalize="sentences"
        showSoftInputOnFocus={!keyboardMouseMode}
      />
      <TextInput
        style={[styles.bodyInput, { color: theme.textPrimary, backgroundColor: theme.bgInput, borderColor: theme.border }]}
        value={body}
        onChangeText={setBody}
        placeholder="Leave a comment... (markdown supported)"
        placeholderTextColor={theme.textMuted}
        multiline
        textAlignVertical="top"
        autoCapitalize="sentences"
        showSoftInputOnFocus={!keyboardMouseMode}
      />
      {!!action.error && <Text style={[styles.error, { color: theme.accentRed }]}>{action.error}</Text>}
      <SubmitRow label={action.busy ? "Creating..." : "Create issue"} disabled={!title.trim() || action.busy} onPress={submit} accent={theme.accent} muted={theme.bgTertiary} textMuted={theme.textMuted} />
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

export function GitHubNewPullView({ owner, repo, nav }: { owner: string; repo: string; nav: GitHubNavigation }) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const branches = useGitHubResource(() => fetchBranches(owner, repo, 100), [owner, repo]);
  const [head, setHead] = useState("");
  const [base, setBase] = useState("main");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);
  const action = useGitHubAction();

  if (branches.loading && !branches.data) return <LoadingState />;
  const names = (branches.data || []).map((b) => b.name);

  const submit = () => {
    const t = title.trim();
    if (!t || !head.trim() || !base.trim()) return;
    void action.run(() => createPull(owner, repo, { title: t, head: head.trim(), base: base.trim(), body: body.trim() || undefined, draft }), (pull) =>
      nav.replace({ name: "issue", owner, repo, number: pull.number, isPull: true })
    );
  };

  return (
    <ScrollView style={styles.wrap} keyboardShouldPersistTaps="handled">
      <BranchField label="Base branch (merge into)" value={base} onChange={setBase} names={names} theme={theme} keyboardMouseMode={keyboardMouseMode} />
      <BranchField label="Compare branch (source)" value={head} onChange={setHead} names={names} theme={theme} keyboardMouseMode={keyboardMouseMode} />
      <TextInput
        style={[styles.titleInput, { color: theme.textPrimary, backgroundColor: theme.bgInput, borderColor: theme.border }]}
        value={title}
        onChangeText={setTitle}
        placeholder="Pull request title"
        placeholderTextColor={theme.textMuted}
        autoCapitalize="sentences"
        showSoftInputOnFocus={!keyboardMouseMode}
      />
      <TextInput
        style={[styles.bodyInput, { color: theme.textPrimary, backgroundColor: theme.bgInput, borderColor: theme.border }]}
        value={body}
        onChangeText={setBody}
        placeholder="Description (optional)"
        placeholderTextColor={theme.textMuted}
        multiline
        textAlignVertical="top"
        autoCapitalize="sentences"
        showSoftInputOnFocus={!keyboardMouseMode}
      />
      <TouchableOpacity style={styles.draftRow} onPress={() => setDraft((v) => !v)} activeOpacity={0.7}>
        <Octicons name={draft ? "check-circle" : "circle"} size={13} color={draft ? theme.accent : theme.textMuted} />
        <Text style={[styles.draftText, { color: theme.textSecondary }]}>Create as draft</Text>
      </TouchableOpacity>
      {!!action.error && <Text style={[styles.error, { color: theme.accentRed }]}>{action.error}</Text>}
      <SubmitRow
        label={action.busy ? "Creating..." : "Create pull request"}
        disabled={!title.trim() || !head.trim() || !base.trim() || action.busy}
        onPress={submit}
        accent={theme.accent}
        muted={theme.bgTertiary}
        textMuted={theme.textMuted}
      />
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

export function GitHubNewReleaseView({ owner, repo, nav }: { owner: string; repo: string; nav: GitHubNavigation }) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const [tag, setTag] = useState("");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [prerelease, setPrerelease] = useState(false);
  const action = useGitHubAction();

  const submit = () => {
    const t = tag.trim();
    if (!t) return;
    void action.run(() => createRelease(owner, repo, { tag_name: t, name: name.trim() || undefined, body: body.trim() || undefined, prerelease }), () =>
      nav.replace({ name: "releases", owner, repo })
    );
  };

  return (
    <ScrollView style={styles.wrap} keyboardShouldPersistTaps="handled">
      <TextInput
        style={[styles.titleInput, { color: theme.textPrimary, backgroundColor: theme.bgInput, borderColor: theme.border }]}
        value={tag}
        onChangeText={setTag}
        placeholder="Tag name (e.g. v1.2.0)"
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        showSoftInputOnFocus={!keyboardMouseMode}
      />
      <TextInput
        style={[styles.titleInput, { color: theme.textPrimary, backgroundColor: theme.bgInput, borderColor: theme.border }]}
        value={name}
        onChangeText={setName}
        placeholder="Release title (optional)"
        placeholderTextColor={theme.textMuted}
        autoCapitalize="sentences"
        showSoftInputOnFocus={!keyboardMouseMode}
      />
      <TextInput
        style={[styles.bodyInput, { color: theme.textPrimary, backgroundColor: theme.bgInput, borderColor: theme.border }]}
        value={body}
        onChangeText={setBody}
        placeholder="Describe this release..."
        placeholderTextColor={theme.textMuted}
        multiline
        textAlignVertical="top"
        autoCapitalize="sentences"
        showSoftInputOnFocus={!keyboardMouseMode}
      />
      <TouchableOpacity style={styles.draftRow} onPress={() => setPrerelease((v) => !v)} activeOpacity={0.7}>
        <Octicons name={prerelease ? "check-circle" : "circle"} size={13} color={prerelease ? theme.accentGold : theme.textMuted} />
        <Text style={[styles.draftText, { color: theme.textSecondary }]}>This is a pre-release</Text>
      </TouchableOpacity>
      {!!action.error && <Text style={[styles.error, { color: theme.accentRed }]}>{action.error}</Text>}
      <SubmitRow label={action.busy ? "Publishing..." : "Publish release"} disabled={!tag.trim() || action.busy} onPress={submit} accent={theme.accent} muted={theme.bgTertiary} textMuted={theme.textMuted} />
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

function BranchField({
  label,
  value,
  onChange,
  names,
  theme,
  keyboardMouseMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  names: string[];
  theme: any;
  keyboardMouseMode: boolean;
}) {
  return (
    <View style={styles.branchField}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        style={[styles.titleInput, { color: theme.textPrimary, backgroundColor: theme.bgInput, borderColor: theme.border, marginTop: 0 }]}
        value={value}
        onChangeText={onChange}
        placeholder="branch name"
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        showSoftInputOnFocus={!keyboardMouseMode}
      />
      <View style={styles.suggestRow}>
        {names.slice(0, 6).map((n) => (
          <TouchableOpacity key={n} onPress={() => onChange(n)} style={styles.suggest} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
            <Text style={[styles.suggestText, { color: n === value ? theme.accent : theme.textMuted }]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function SubmitRow({
  label,
  disabled,
  onPress,
  accent,
  muted,
  textMuted,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  accent: string;
  muted: string;
  textMuted: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.submit, { backgroundColor: disabled ? muted : accent }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={[styles.submitText, { color: disabled ? textMuted : "#fff" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 14, paddingTop: 10 },
  label: { fontSize: 11, fontWeight: "700", marginBottom: 4, marginTop: 10 },
  titleInput: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    height: 38,
    fontSize: 13,
    marginBottom: 10,
  },
  bodyInput: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    fontSize: 12.5,
    minHeight: 120,
  },
  branchField: { marginBottom: 4 },
  suggestRow: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 4, marginBottom: 8 },
  suggest: {},
  suggestText: { fontSize: 10.5, fontWeight: "600" },
  draftRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  draftText: { fontSize: 12 },
  error: { fontSize: 11.5, marginTop: 10 },
  submit: { height: 40, borderRadius: 9, alignItems: "center", justifyContent: "center", marginTop: 16 },
  submitText: { fontSize: 12.5, fontWeight: "800" },
});
