import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { TypePill, labelColor, styles as shared } from "./GitHubStates";
import { GitHubIssue, GitHubPull, GitHubRepo, GitHubUserSummary } from "../../services/gitHubTypes";
import { formatStale } from "../../services/gitHubProfileService";

/**
 * List rows shared by every GitHub screen. Each row is a plain pressable
 * block: identity on the left, one line of context, companion actions on
 * the right. No nested boxes.
 */

export function RepoRow({
  repo,
  onPress,
  onClone,
  showOwner = false,
  trailing,
}: {
  repo: GitHubRepo;
  onPress: () => void;
  onClone?: () => void;
  showOwner?: boolean;
  trailing?: React.ReactNode;
}) {
  const { theme } = useTheme();
  const name = showOwner ? repo.fullName : repo.name;

  return (
    <View style={[rowStyles.row, { borderBottomColor: theme.border }]}>
      <TouchableOpacity style={rowStyles.main} onPress={onPress} activeOpacity={0.7}>
        <Octicons
          name={repo.isPrivate ? "lock" : repo.isFork ? "repo-forked" : "repo"}
          size={13}
          color={theme.textSecondary}
          style={rowStyles.icon}
        />
        <View style={rowStyles.body}>
          <Text style={[rowStyles.title, { color: theme.textPrimary }]} numberOfLines={1}>
            {name}
          </Text>
          {!!repo.description && (
            <Text style={[rowStyles.sub, { color: theme.textSecondary }]} numberOfLines={2}>
              {repo.description}
            </Text>
          )}
          <View style={rowStyles.meta}>
            {!!repo.language && <Text style={[rowStyles.metaText, { color: theme.accent }]}>{repo.language}</Text>}
            {repo.stars > 0 && <Text style={[rowStyles.metaText, { color: theme.textMuted }]}>★ {repo.stars}</Text>}
            {repo.forks > 0 && <Text style={[rowStyles.metaText, { color: theme.textMuted }]}>⑂ {repo.forks}</Text>}
            {repo.openIssues > 0 && (
              <Text style={[rowStyles.metaText, { color: theme.textMuted }]}>{repo.openIssues} issues</Text>
            )}
            {repo.isArchived && <Text style={[rowStyles.metaText, { color: theme.accentGold }]}>archived</Text>}
            {!!repo.updatedAt && (
              <Text style={[rowStyles.metaText, { color: theme.textMuted }]}>{formatStale(repo.updatedAt)}</Text>
            )}
          </View>
        </View>
        {trailing}
        {onClone && (
          <TouchableOpacity
            style={[rowStyles.chip, { backgroundColor: `${theme.accent}18`, borderColor: `${theme.accent}44` }]}
            onPress={onClone}
            activeOpacity={0.8}
          >
            <Octicons name="download" size={11} color={theme.accent} />
            <Text style={[rowStyles.chipText, { color: theme.accent }]}>Clone</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    </View>
  );
}

export function IssueRow({
  issue,
  onPress,
  selected,
}: {
  issue: GitHubIssue;
  onPress: () => void;
  selected?: boolean;
}) {
  const { theme } = useTheme();
  const isClosed = issue.state === "closed";
  const glyph = issue.isPullRequest ? "git-pull-request" : "issue-opened";
  const color = isClosed ? theme.accentPurple : issue.isPullRequest ? theme.accentGreen : theme.accentGreen;

  return (
    <View style={[rowStyles.row, { borderBottomColor: theme.border }]}>
      <TouchableOpacity
        style={[
          rowStyles.main,
          selected && { backgroundColor: `${theme.accent}14` },
        ]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <Octicons
          name={isClosed ? "check" : (glyph as any)}
          size={13}
          color={isClosed ? theme.accentPurple : color}
          style={rowStyles.icon}
        />
        <View style={rowStyles.body}>
          <Text style={[rowStyles.title, { color: theme.textPrimary }]} numberOfLines={2}>
            {issue.title}
          </Text>
          <View style={rowStyles.meta}>
            <Text style={[rowStyles.metaText, { color: theme.textMuted }]}>#{issue.number}</Text>
            <Text style={[rowStyles.metaText, { color: theme.textMuted }]}>
              {isClosed ? "closed " : "opened "}
              {formatStale(isClosed ? issue.closedAt || issue.updatedAt : issue.createdAt)}
            </Text>
            <Text style={[rowStyles.metaText, { color: theme.textMuted }]}>by {issue.authorLogin || "unknown"}</Text>
            {issue.commentCount > 0 && (
              <Text style={[rowStyles.metaText, { color: theme.textMuted }]}>💬 {issue.commentCount}</Text>
            )}
          </View>
          {issue.labels.length > 0 && (
            <View style={rowStyles.labelRow}>
              {issue.labels.slice(0, 4).map((label) => (
                <Text key={label.name} style={[rowStyles.label, { color: labelColor(label.color) }]} numberOfLines={1}>
                  {label.name}
                </Text>
              ))}
              {issue.labels.length > 4 && (
                <Text style={[rowStyles.label, { color: theme.textMuted }]}>+{issue.labels.length - 4}</Text>
              )}
            </View>
          )}
        </View>
        {issue.isPullRequest && (
          <Text style={[rowStyles.metaText, { color: theme.textMuted, marginTop: 2 }]}>
            {issue.assigneeLogins.length > 0 ? `@${issue.assigneeLogins[0]}` : ""}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export function PullRow({
  pull,
  onPress,
}: {
  pull: GitHubPull;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const isMerged = pull.isMerged;
  const isClosed = pull.state === "closed" && !isMerged;
  const color = isMerged ? theme.accentPurple : isClosed ? theme.accentRed : theme.accentGreen;

  return (
    <View style={[rowStyles.row, { borderBottomColor: theme.border }]}>
      <TouchableOpacity style={rowStyles.main} onPress={onPress} activeOpacity={0.7}>
        <Octicons name="git-pull-request" size={13} color={color} style={rowStyles.icon} />
        <View style={rowStyles.body}>
          <Text style={[rowStyles.title, { color: theme.textPrimary }]} numberOfLines={2}>
            {pull.title}
          </Text>
          <View style={rowStyles.meta}>
            <Text style={[rowStyles.metaText, { color: theme.textMuted }]}>#{pull.number}</Text>
            <Text style={[rowStyles.metaText, { color: theme.textMuted }]}>
              {isMerged ? "merged " : isClosed ? "closed " : "opened "}
              {formatStale(isMerged ? pull.mergedAt : pull.updatedAt)}
            </Text>
            <Text style={[rowStyles.metaText, { color: theme.textMuted }]}>by {pull.authorLogin || "unknown"}</Text>
            {pull.isDraft && <TypePill label="DRAFT" color={theme.textMuted} />}
          </View>
          <View style={rowStyles.meta}>
            <Text style={[rowStyles.metaText, { color: theme.textSecondary }]}>
              {pull.headRef} → {pull.baseRef}
            </Text>
            <Text style={[rowStyles.metaText, { color: theme.accentGreen }]}>+{pull.additions}</Text>
            <Text style={[rowStyles.metaText, { color: theme.accentRed }]}>-{pull.deletions}</Text>
            {pull.requestedReviewers.length > 0 && (
              <Text style={[rowStyles.metaText, { color: theme.accentGold }]}>review requested</Text>
            )}
          </View>
          {pull.labels.length > 0 && (
            <View style={rowStyles.labelRow}>
              {pull.labels.slice(0, 4).map((label) => (
                <Text key={label.name} style={[rowStyles.label, { color: labelColor(label.color) }]} numberOfLines={1}>
                  {label.name}
                </Text>
              ))}
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

export function UserRow({
  user,
  onPress,
  trailing,
}: {
  user: GitHubUserSummary & { contributions?: number };
  onPress: () => void;
  trailing?: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View style={[rowStyles.row, { borderBottomColor: theme.border }]}>
      <TouchableOpacity style={rowStyles.main} onPress={onPress} activeOpacity={0.7}>
        {user.avatarUrl ? (
          <Image source={{ uri: user.avatarUrl }} style={rowStyles.avatar} />
        ) : (
          <View style={[rowStyles.avatar, rowStyles.avatarFallback, { backgroundColor: theme.accent }]}>
            <Text style={rowStyles.avatarLetter}>{(user.login || "?").slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={rowStyles.body}>
          <Text style={[rowStyles.title, { color: theme.textPrimary }]} numberOfLines={1}>
            {user.name || user.login}
          </Text>
          <View style={rowStyles.meta}>
            <Text style={[rowStyles.metaText, { color: theme.textMuted }]}>@{user.login}</Text>
            {user.kind === "Organization" && <TypePill label="ORG" color={theme.accentCyan} />}
            {typeof user.contributions === "number" && (
              <Text style={[rowStyles.metaText, { color: theme.textMuted }]}>{user.contributions} commits</Text>
            )}
          </View>
        </View>
        {trailing}
      </TouchableOpacity>
    </View>
  );
}

export const rowStyles = StyleSheet.create({
  row: { borderBottomWidth: StyleSheet.hairlineWidth },
  main: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12 },
  icon: { marginTop: 2 },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 13, fontWeight: "700" },
  sub: { fontSize: 11.5, lineHeight: 15 },
  meta: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 1, alignItems: "center" },
  metaText: { fontSize: 10.5 },
  labelRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 3 },
  label: { fontSize: 10, fontWeight: "700" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 10.5, fontWeight: "700" },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#333" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarLetter: { color: "#fff", fontSize: 13, fontWeight: "800" },
  ...shared,
});