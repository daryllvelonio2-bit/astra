import React, { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { Ionicons, Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useOrientation } from "../../../theme/useOrientation";
import { GitCommit, GitCommitFile, GitFileStatus } from "./types";
import { parseUnifiedDiff, ParsedDiffLine, DiffParseResult } from "./diffParser";

interface GitDiffViewerProps {
  diff: string;
  loading: boolean;
  selectedFile: GitFileStatus | null;
  selectedCommit: GitCommit | null;
  selectedCommitFile?: GitCommitFile | null;
  onBackToMaster?: () => void;
}

export function GitDiffViewer({
  diff,
  loading,
  selectedFile,
  selectedCommit,
  selectedCommitFile = null,
  onBackToMaster,
}: GitDiffViewerProps) {
  const { theme } = useTheme();
  const { isLandscape } = useOrientation();
  const parsed = useMemo(() => parseUnifiedDiff(diff), [diff]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bgPrimary }]}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading diff…</Text>
      </View>
    );
  }

  const currentFile = selectedFile || selectedCommitFile;

  if (!currentFile && !selectedCommit) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bgPrimary }]}>
        <Octicons name="diff" size={isLandscape ? 32 : 40} color={theme.textMuted} />
        <Text style={[styles.placeholderTitle, isLandscape && styles.placeholderTitleLandscape, { color: theme.textPrimary }]}>
          No file selected
        </Text>
        <Text style={[styles.placeholderBody, isLandscape && styles.placeholderBodyLandscape, { color: theme.textSecondary }]}>
          Select a changed file or commit on the left to view its diff.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
      {/* Diff Header Bar */}
      <View
        style={[
          styles.headerBar,
          isLandscape && styles.headerBarLandscape,
          { backgroundColor: theme.bgSecondary, borderBottomColor: theme.border },
        ]}
      >
        {onBackToMaster && (
          <TouchableOpacity style={styles.backBtn} onPress={onBackToMaster}>
            <Ionicons name="arrow-back" size={isLandscape ? 16 : 18} color={theme.textPrimary} />
          </TouchableOpacity>
        )}
        <View style={styles.headerTitleCol}>
          <View style={styles.headerTitleRow}>
            <Text
              style={[styles.headerTitle, isLandscape && styles.headerTitleLandscape, { color: theme.textPrimary }]}
              numberOfLines={1}
            >
              {currentFile ? currentFile.path : selectedCommit?.message}
            </Text>
            {currentFile && (
              <View
                style={[
                  styles.fileStatusPill,
                  isLandscape && styles.fileStatusPillLandscape,
                  {
                    backgroundColor:
                      currentFile.status === "deleted"
                        ? `${theme.accentRed}18`
                        : currentFile.status === "modified"
                        ? `${theme.accentGold}18`
                        : `${theme.accentGreen}18`,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.fileStatusPillText,
                    isLandscape && styles.fileStatusPillTextLandscape,
                    {
                      color:
                        currentFile.status === "deleted"
                          ? theme.accentRed
                          : currentFile.status === "modified"
                          ? theme.accentGold
                          : theme.accentGreen,
                    },
                  ]}
                >
                  {currentFile.status === "modified"
                    ? "Modified"
                    : currentFile.status === "deleted"
                    ? "Deleted"
                    : currentFile.status === "renamed"
                    ? "Renamed"
                    : "New"}
                </Text>
              </View>
            )}
          </View>
          {selectedCommit && (
            <Text
              style={[styles.headerSubtitle, isLandscape && styles.headerSubtitleLandscape, { color: theme.textMuted }]}
              numberOfLines={1}
            >
              {selectedCommit.shortHash} by {selectedCommit.authorName} · {selectedCommit.relativeTime}
            </Text>
          )}
        </View>
        <View style={styles.statsRow}>
          {parsed.additions > 0 && (
            <Text style={[styles.statBadge, isLandscape && styles.statBadgeLandscape, { color: theme.accentGreen }]}>
              +{parsed.additions}
            </Text>
          )}
          {parsed.deletions > 0 && (
            <Text style={[styles.statBadge, isLandscape && styles.statBadgeLandscape, { color: theme.accentRed }]}>
              -{parsed.deletions}
            </Text>
          )}
        </View>
      </View>

      {/* Code Diff Lines */}
      {parsed.infoMessage ? (
        <View style={[styles.center, { backgroundColor: theme.bgPrimary }]}>
          <Text style={[styles.placeholderBody, isLandscape && styles.placeholderBodyLandscape, { color: theme.textSecondary }]}>
            {parsed.infoMessage}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.diffScroll}
          contentContainerStyle={styles.diffContent}
          horizontal={false}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.codeBlock}>
              {parsed.lines.map((line, idx) => {
                if (line.type === "hunk") {
                  return (
                    <View
                      key={idx}
                      style={[
                        styles.hunkRow,
                        {
                          backgroundColor: `${theme.accent}14`,
                          borderTopColor: `${theme.accent}30`,
                          borderBottomColor: `${theme.accent}30`,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.hunkText,
                          isLandscape && styles.hunkTextLandscape,
                          { color: theme.accent },
                        ]}
                      >
                        {line.content}
                      </Text>
                    </View>
                  );
                }

                if (line.type === "meta-notice") {
                  return (
                    <View
                      key={idx}
                      style={[styles.noticeRow, { backgroundColor: theme.bgSecondary }]}
                    >
                      <Text style={[styles.noticeText, { color: theme.textMuted }]}>
                        {line.content}
                      </Text>
                    </View>
                  );
                }

                const isAdd = line.type === "add";
                const isDel = line.type === "del";
                const rowBg = isAdd
                  ? `${theme.accentGreen}1A`
                  : isDel
                  ? `${theme.accentRed}1A`
                  : "transparent";
                const textColor = isAdd
                  ? theme.accentGreen
                  : isDel
                  ? theme.accentRed
                  : theme.textPrimary;

                return (
                  <View
                    key={idx}
                    style={[styles.diffRow, { backgroundColor: rowBg }]}
                  >
                    {/* Old Line Number */}
                    <Text
                      style={[
                        styles.gutterNum,
                        isLandscape && styles.gutterNumLandscape,
                        { color: theme.textMuted },
                      ]}
                    >
                      {line.oldLineNumber != null ? line.oldLineNumber : ""}
                    </Text>

                    {/* New Line Number */}
                    <Text
                      style={[
                        styles.gutterNum,
                        isLandscape && styles.gutterNumLandscape,
                        { color: theme.textMuted },
                      ]}
                    >
                      {line.newLineNumber != null ? line.newLineNumber : ""}
                    </Text>

                    {/* Diff Marker */}
                    <Text
                      style={[
                        styles.gutterMarker,
                        isLandscape && styles.gutterMarkerLandscape,
                        { color: textColor },
                      ]}
                    >
                      {isAdd ? "+" : isDel ? "-" : " "}
                    </Text>

                    {/* Code Line Text */}
                    <Text
                      style={[
                        styles.codeText,
                        isLandscape && styles.codeTextLandscape,
                        { color: textColor },
                      ]}
                    >
                      {line.content || " "}
                    </Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    marginTop: 6,
  },
  placeholderTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  placeholderTitleLandscape: {
    fontSize: 13,
  },
  placeholderBody: {
    fontSize: 12,
    textAlign: "center",
    maxWidth: 280,
  },
  placeholderBodyLandscape: {
    fontSize: 11,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  headerBarLandscape: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    height: 32,
    gap: 6,
  },
  backBtn: {
    padding: 4,
    marginRight: 4,
  },
  headerTitleCol: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerTitle: {
    fontSize: 12.5,
    fontWeight: "700",
  },
  headerTitleLandscape: {
    fontSize: 11.5,
  },
  fileStatusPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  fileStatusPillLandscape: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  fileStatusPillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  fileStatusPillTextLandscape: {
    fontSize: 8.5,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 10.5,
    marginTop: 1,
  },
  headerSubtitleLandscape: {
    fontSize: 9.5,
    marginTop: 0,
  },
  statsRow: {
    flexDirection: "row",
    gap: 6,
  },
  statBadge: {
    fontSize: 11.5,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  statBadgeLandscape: {
    fontSize: 10.5,
  },
  diffScroll: {
    flex: 1,
  },
  diffContent: {
    paddingBottom: 24,
  },
  codeBlock: {
    minWidth: "100%",
  },
  hunkRow: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minWidth: "100%",
  },
  hunkText: {
    fontSize: 10.5,
    fontFamily: "monospace",
  },
  hunkTextLandscape: {
    fontSize: 9.5,
  },
  noticeRow: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: "100%",
  },
  noticeText: {
    fontSize: 10,
    fontFamily: "monospace",
    fontStyle: "italic",
  },
  diffRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 8,
    minHeight: 18,
  },
  gutterNum: {
    width: 28,
    fontSize: 10,
    fontFamily: "monospace",
    textAlign: "right",
    paddingRight: 6,
    userSelect: "none",
  },
  gutterNumLandscape: {
    width: 24,
    fontSize: 9,
    paddingRight: 4,
  },
  gutterMarker: {
    width: 14,
    fontSize: 10,
    fontFamily: "monospace",
    fontWeight: "700",
    textAlign: "center",
    userSelect: "none",
  },
  gutterMarkerLandscape: {
    width: 12,
    fontSize: 9.5,
  },
  codeText: {
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 16,
  },
  codeTextLandscape: {
    fontSize: 10,
    lineHeight: 15,
  },
});
