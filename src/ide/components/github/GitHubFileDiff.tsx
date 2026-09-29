import React, { useState, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Pressable, TextInput } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { GitHubPullFile } from "../../services/gitHubTypes";
import { showAppDialog } from "../../services/appDialog";
import { submitPullReview, PullReviewEvent, PullReviewCommentInput } from "../../services/gitHubReviewService";
import { useGitHubAction } from "./useGitHubResource";

/**
 * One file in a PR's "Files changed": collapsed by default so a 40-file PR
 * stays scannable, expanding to a coloured patch. Patch text is plain —
 * no syntax highlighting, no extra dependency.
 */

interface DiffLine {
  index: number;
  content: string;
  kind: "hunk" | "add" | "del" | "ctx";
  newLineNum: number | null; // Line number on the new (right) side
  oldLineNum: number | null; // Line number on the old (left) side
}

function parseDiffLines(patch: string): DiffLine[] {
  const lines = patch.split("\n");
  const result: DiffLine[] = [];
  let newLineNum: number | null = null;
  let oldLineNum: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    if (line.startsWith("@@")) {
      const match = line.match(/@@\s*-(\d+),?\d*\s*\+(\d+),?\d*\s*@@/);
      if (match) {
        oldLineNum = parseInt(match[1], 10) - 1; // Will increment to first line
        newLineNum = parseInt(match[2], 10) - 1; // Will increment to first line
      }
      result.push({ index: i, content: line, kind: "hunk", newLineNum: null, oldLineNum: null });
      continue;
    }

    if (line.startsWith("+")) {
      // Added line - only has new line number
      newLineNum = (newLineNum ?? 0) + 1;
      result.push({ index: i, content: line, kind: "add", newLineNum, oldLineNum: null });
    } else if (line.startsWith("-")) {
      // Deleted line - only has old line number
      oldLineNum = (oldLineNum ?? 0) + 1;
      result.push({ index: i, content: line, kind: "del", newLineNum: null, oldLineNum });
    } else {
      // Context line - has both line numbers
      newLineNum = (newLineNum ?? 0) + 1;
      oldLineNum = (oldLineNum ?? 0) + 1;
      result.push({ index: i, content: line, kind: "ctx", newLineNum, oldLineNum });
    }
  }

  return result;
}

interface GitHubFileDiffProps {
  file: GitHubPullFile;
  owner?: string;
  repo?: string;
  number?: number;
}

export function GitHubFileDiff({ file, owner, repo, number }: GitHubFileDiffProps) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [commentLine, setCommentLine] = useState<DiffLine | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const action = useGitHubAction();

  const statusColor =
    file.status === "added" ? theme.accentGreen : file.status === "removed" ? theme.accentRed : theme.accentGold;

  const diffLines = useMemo(() => parseDiffLines(file.patch || ""), [file.patch]);

  const handleLongPress = useCallback((line: DiffLine) => {
    // Only allow commenting on added or context lines (right side of diff)
    if (line.kind !== "add" && line.kind !== "ctx") return;
    if (line.newLineNum === null) return;
    setCommentLine(line);
    setCommentBody("");
    showAppDialog({
      title: `Add review comment to ${file.filename}`,
      message: `Line ${line.newLineNum} (${line.kind === "add" ? "added" : "context"})`,
      content: (
        <TextInput
          style={{
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.border,
            backgroundColor: theme.bgInput,
            borderRadius: 8,
            padding: 12,
            fontSize: 14,
            color: theme.textPrimary,
            minHeight: 100,
            textAlignVertical: "top",
            marginTop: 8,
          }}
          multiline
          placeholder="Write a review comment..."
          value={commentBody}
          onChangeText={setCommentBody}
          autoFocus
        />
      ),
      buttons: [
        { text: "Cancel", style: "cancel" },
        {
          text: "Add review comment",
          style: "default",
          onPress: async () => {
            if (!commentBody.trim() || !commentLine) return;
            if (!owner || !repo || !number) return;
            
            // Use the file path and new line number for the review comment
            const reviewComment: PullReviewCommentInput = {
              path: file.filename,
              line: commentLine.newLineNum ?? undefined,
              side: "RIGHT",
              body: commentBody.trim(),
            };

            await action.run(
              () => submitPullReview(owner, repo, number, { event: "COMMENT", body: "", comments: [reviewComment] }),
              () => {
                setCommentLine(null);
                setCommentBody("");
              }
            );
          },
        },
      ],
    });
  }, [action, file.filename, owner, repo, number, theme, commentBody, commentLine]);

  return (
    <View style={[styles.wrap, { borderBottomColor: theme.border }]}>
      <TouchableOpacity
        style={styles.head}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.7}
      >
        <Octicons name={open ? "chevron-down" : "chevron-right"} size={12} color={theme.textMuted} />
        <Text style={[styles.path, { color: theme.textPrimary }]} numberOfLines={1}>
          {file.filename}
        </Text>
        <Text style={[styles.stat, { color: statusColor }]}>{file.status}</Text>
        <Text style={[styles.stat, { color: theme.accentGreen }]}>+{file.additions}</Text>
        <Text style={[styles.stat, { color: theme.accentRed }]}>-{file.deletions}</Text>
      </TouchableOpacity>

      {open && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.patch}>
            {diffLines.map((line, index) => {
              const color =
                line.kind === "add"
                  ? theme.accentGreen
                  : line.kind === "del"
                  ? theme.accentRed
                  : line.kind === "hunk"
                  ? theme.accentCyan
                  : theme.textSecondary;
              
              const isCommentable = (line.kind === "add" || line.kind === "ctx") && line.newLineNum !== null;

              return (
                <Pressable
                  key={index}
                  style={styles.patchLine}
                  onLongPress={isCommentable ? () => handleLongPress(line) : undefined}
                  android_disableSound
                >
                  <Text style={[styles.patchLineText, { color }]}>
                    {line.content || " "}
                  </Text>
                  {isCommentable && (
                    <Text style={styles.commentHint}>
                      <Octicons name="comment" size={10} color={theme.textMuted} />
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  path: { flex: 1, fontSize: 11.5, fontWeight: "700" },
  stat: { fontSize: 10, fontWeight: "700" },
  patch: { paddingHorizontal: 12, paddingBottom: 10 },
  patchLine: { fontSize: 11, fontFamily: "monospace", flexDirection: "row", alignItems: "center" },
  patchLineText: { flex: 1 },
  commentHint: { fontSize: 10, color: "transparent" },
});