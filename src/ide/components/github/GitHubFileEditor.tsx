import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useKeyboardMouseMode } from "../../context/KeyboardMouseContext";
import { ghPut, GitHubResult } from "../../services/gitHubApi";
import { invalidateTreeCommitCache } from "../../services/gitHubTreeCommitService";

/**
 * Commit a file edit straight to GitHub, the way the web editor does:
 * content + sha + branch in, commit created out. Kept apart from the
 * read-only viewer so the viewer stays simple.
 */

export async function commitFileEdit(
  owner: string,
  repo: string,
  path: string,
  payload: { text: string; sha: string; message: string; branch: string; newBranch?: string }
): Promise<GitHubResult<{ commitSha: string }>> {
  // GitHub requires UTF-8 content; btoa only handles latin1, so encode the
  // string to UTF-8 bytes first (same trick VS Code/mobile clients use).
  const encoded = encodeBase64(payload.text);

  const res = await ghPut<any>(`/repos/${owner}/${repo}/contents/${path}`, {
    message: payload.message,
    content: encoded,
    sha: payload.sha,
    branch: payload.branch,
    ...(payload.newBranch ? { branch: payload.newBranch } : {}),
  });
  if (!res.ok) return { ok: false, error: res.error };
  // The tree's per-row "last commit" lines are memoized; a fresh commit
  // makes them stale, so drop the memo before the code tab re-reads.
  invalidateTreeCommitCache();
  return { ok: true, data: { commitSha: res.data?.commit?.sha || "" } };
}

function encodeBase64(text: string): string {
  const bytes = Array.from(new TextEncoder().encode(text));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let i = 0; i < binary.length; i += 3) {
    const c1 = binary.charCodeAt(i);
    const c2 = binary.charCodeAt(i + 1);
    const c3 = binary.charCodeAt(i + 2);
    const triplet = (c1 << 16) | ((isNaN(c2) ? 0 : c2) << 8) | (isNaN(c3) ? 0 : c3);
    output += chars[(triplet >> 18) & 63];
    output += chars[(triplet >> 12) & 63];
    output += isNaN(c2) ? "=" : chars[(triplet >> 6) & 63];
    output += isNaN(c3) ? "=" : chars[triplet & 63];
  }
  return output;
}

export function GitHubFileEditorSheet({
  path,
  initialText,
  sha,
  branch,
  busy,
  error,
  onCommit,
  onCancel,
}: {
  path: string;
  initialText: string;
  sha: string;
  branch: string;
  busy?: boolean;
  error?: string | null;
  onCommit: (payload: { text: string; message: string; newBranch?: string }) => void;
  onCancel: () => void;
}) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const [text, setText] = useState(initialText);
  const [message, setMessage] = useState(`Update ${path.split("/").pop()}`);
  const [newBranch, setNewBranch] = useState("");

  return (
    <View style={[styles.wrap, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Octicons name="pencil" size={13} color={theme.accent} />
        <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
          Editing {path}
        </Text>
        <TouchableOpacity onPress={onCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Octicons name="x" size={14} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: theme.textSecondary }]}>Content</Text>
        <TextInput
          style={[
            styles.code,
            { color: theme.textPrimary, backgroundColor: theme.bgInput, borderColor: theme.border },
          ]}
          value={text}
          onChangeText={setText}
          multiline
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
          showSoftInputOnFocus={!keyboardMouseMode}
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Commit message</Text>
        <TextInput
          style={[
            styles.field,
            { color: theme.textPrimary, backgroundColor: theme.bgInput, borderColor: theme.border },
          ]}
          value={message}
          onChangeText={setMessage}
          placeholder="Commit message"
          placeholderTextColor={theme.textMuted}
          showSoftInputOnFocus={!keyboardMouseMode}
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>
          Branch (blank = commit to {branch})
        </Text>
        <TextInput
          style={[
            styles.field,
            { color: theme.textPrimary, backgroundColor: theme.bgInput, borderColor: theme.border },
          ]}
          value={newBranch}
          onChangeText={setNewBranch}
          placeholder="e.g. patch-1 (creates a new branch)"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          showSoftInputOnFocus={!keyboardMouseMode}
        />

        <Text style={[styles.note, { color: theme.textMuted }]}>
          Committing writes directly to GitHub using your saved token. Leave the branch blank to commit to {branch}.
        </Text>

        {!!error && <Text style={[styles.error, { color: theme.accentRed }]}>{error}</Text>}

        <View style={styles.footer}>
          <TouchableOpacity style={[styles.btn, { borderColor: theme.border }]} onPress={onCancel} activeOpacity={0.8}>
            <Text style={[styles.btnText, { color: theme.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.primary, { backgroundColor: busy ? theme.bgTertiary : theme.accent }]}
            onPress={() =>
              onCommit({ text, message, newBranch: newBranch.trim() || undefined })
            }
            disabled={busy || !message.trim()}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnText, { color: busy ? theme.textMuted : "#fff" }]}>
              {busy ? "Committing..." : "Commit changes"}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 12 }} />
      </ScrollView>

      {!!sha && (
        <Text style={[styles.sha, { color: theme.textMuted }]} numberOfLines={1}>
          based on {sha.slice(0, 7)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, borderTopWidth: StyleSheet.hairlineWidth },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { flex: 1, fontSize: 12.5, fontWeight: "700" },
  body: { paddingHorizontal: 12 },
  label: { fontSize: 10.5, fontWeight: "700", marginTop: 10, marginBottom: 4 },
  code: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    fontSize: 11.5,
    fontFamily: "monospace",
    minHeight: 200,
  },
  field: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    height: 36,
    fontSize: 12.5,
  },
  note: { fontSize: 10.5, marginTop: 8, lineHeight: 14 },
  error: { fontSize: 11.5, marginTop: 8 },
  footer: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 12 },
  btn: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { borderColor: "transparent" },
  btnText: { fontSize: 12, fontWeight: "700" },
  sha: { fontSize: 9.5, paddingHorizontal: 12, paddingBottom: 8 },
});