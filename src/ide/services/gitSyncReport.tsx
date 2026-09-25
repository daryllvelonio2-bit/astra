import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/themeContext";
import { showAppDialog } from "./appDialog";

/**
 * Structured, themed result card for fetch/pull/push — parses the raw git
 * stdout into sections (new refs, incoming commits, changed files, stat
 * line) instead of dumping a wall of text into a native alert.
 */

export interface SyncReport {
  kind: "fetch" | "pull" | "push";
  branch: string | null;
  newRefs: string[]; // "origin/main", "tag v1.2"
  commits: string[]; // "abc1234 Fix the thing — Daryll"
  files: string[]; // " src/a.ts | 12 +-"
  statLine: string | null; // " 3 files changed, 40 insertions(+), 2 deletions(-)"
  raw: string;
}

const isRefLine = (s: string) =>
  /^\s*(\[new branch\]|\[new tag\]|\[deleted branch\]|\[deleted tag\]|main\b.*->|\S+.*-> ).*/.test(
    s
  ) && s.includes("->");

const isCommitLine = (s: string) => /^[*o]?\s+[0-9a-f]{7,40}\s+\S/.test(s);
const isFileStat = (s: string) => /\|\s+\d+\s*[-+~]*/.test(s);
const isStatSummary = (s: string) =>
  /\d+ files? changed|\d+ insertions?\(\+\)|\d+ deletions?\(-\)|fast-forward|up to date|already up-to-date/i.test(
    s
  );

export function parseSyncOutput(kind: SyncReport["kind"], stdout: string, branch: string | null): SyncReport {
  const lines = stdout.split("\n").map((l) => l.replace(/\s+$/, ""));
  const rep: SyncReport = {
    kind,
    branch,
    newRefs: [],
    commits: [],
    files: [],
    statLine: null,
    raw: stdout.trim(),
  };
  for (const l of lines) {
    if (!l.trim()) continue;
    if (/From: ?github\.com|remote:|Fetching|warning:|Auto-merging|error:|fatal:/i.test(l)) continue;
    if (isRefLine(l)) rep.newRefs.push(l.trim().replace(/\s+/g, " "));
    else if (isCommitLine(l)) rep.commits.push(l.trim().replace(/^[*o]\s+/, ""));
    else if (isFileStat(l)) rep.files.push(l.trim());
    else if (isStatSummary(l)) rep.statLine = (rep.statLine ?? "") + (rep.statLine ? "; " : "") + l.trim();
    else if (rep.newRefs.length + rep.commits.length + rep.files.length === 0) rep.commits.push(l.trim());
  }
  return rep;
}

export function hasSyncContent(rep: SyncReport): boolean {
  return !!(rep.newRefs.length || rep.commits.length || rep.files.length || rep.statLine);
}

function ReportBody({ rep }: { rep: SyncReport }) {
  const { theme } = useTheme();
  return (
    <View style={styles.body}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {rep.newRefs.length > 0 && (
          <Section title={rep.kind === "push" ? "Pushed" : "Refs updated"} icon="cloud-upload" theme={theme}>
            {rep.newRefs.map((r, i) => (
              <Line key={i} text={r} theme={theme} mono />
            ))}
          </Section>
        )}
        {rep.commits.length > 0 && (
          <Section title="Commits" icon="git-commit" theme={theme}>
            {rep.commits.slice(0, 30).map((c, i) => {
              const m = c.match(/^([0-9a-f]{7,40})\s+(.*)$/);
              return (
                <View key={i} style={styles.commitRow}>
                  {m ? (
                    <>
                      <Text style={[styles.sha, { color: theme.accent }]}>{m[1].slice(0, 7)}</Text>
                      <Text style={[styles.commitMsg, { color: theme.textSecondary }]} numberOfLines={1}>
                        {m[2]}
                      </Text>
                    </>
                  ) : (
                    <Text style={[styles.commitMsg, { color: theme.textSecondary }]} numberOfLines={2}>
                      {c}
                    </Text>
                  )}
                </View>
              );
            })}
            {rep.commits.length > 30 && (
              <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                …and {rep.commits.length - 30} more
              </Text>
            )}
          </Section>
        )}
        {rep.files.length > 0 && (
          <Section title="Files changed" icon="file-diff" theme={theme}>
            {rep.files.slice(0, 20).map((f, i) => (
              <Line key={i} text={f} theme={theme} mono />
            ))}
          </Section>
        )}
        {rep.statLine && (
          <View style={[styles.statBox, { backgroundColor: `${theme.accent}14`, borderColor: `${theme.accent}44` }]}>
            <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: "600" }}>
              {rep.statLine}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  icon,
  theme,
  children,
}: {
  title: string;
  icon: string;
  theme: any;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Octicons name={icon as any} size={12} color={theme.textMuted} />
        <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Line({ text, theme, mono }: { text: string; theme: any; mono?: boolean }) {
  return (
    <Text style={[styles.line, { color: theme.textSecondary }, mono && styles.mono]} numberOfLines={2}>
      {text}
    </Text>
  );
}

export function showSyncReportDialog(rep: SyncReport, onDetail?: () => void): void {
  const titles: Record<SyncReport["kind"], string> = {
    fetch: "Fetched from remote",
    pull: "Pulled latest changes",
    push: "Pushed to origin",
  };
  showAppDialog({
    title: titles[rep.kind],
    message: rep.branch ? `Branch: ${rep.branch}` : undefined,
    content: (
      <View style={{ maxHeight: 340 }}>
        <ReportBody rep={rep} />
      </View>
    ),
    buttons: [
      { text: "Close", style: "cancel" },
      ...(onDetail ? [{ text: "View history", onPress: onDetail }] : []),
    ],
  });
}

const styles = StyleSheet.create({
  body: { marginTop: 12 },
  scroll: { flexGrow: 0 },
  section: { marginBottom: 10 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 },
  sectionTitle: { fontSize: 10.5, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
  line: { fontSize: 12, lineHeight: 17 },
  mono: { fontVariant: ["tabular-nums"] },
  commitRow: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 2 },
  sha: { fontSize: 11.5, fontWeight: "700", width: 56 },
  commitMsg: { fontSize: 12, flex: 1 },
  statBox: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 4,
  },
});