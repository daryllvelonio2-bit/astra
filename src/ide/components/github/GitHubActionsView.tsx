import React from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { fetchWorkflowRuns, cancelWorkflowRun, rerunWorkflow } from "../../services/gitHubRepoWriteService";
import { useGitHubResource, useGitHubAction } from "./useGitHubResource";
import { EmptyState, ErrorState, LoadingState } from "./GitHubStates";
import { formatStale } from "../../services/gitHubProfileService";

/**
 * Actions tab: recent workflow runs with status, branch, actor, and the two
 * real controls the web UI offers — re-run and cancel. Statuses are colour
 * coded the same way GitHub does (green success, red failure, gold running).
 */

export function GitHubActionsView({ owner, repo }: { owner: string; repo: string }) {
  const { theme } = useTheme();
  const runs = useGitHubResource(() => fetchWorkflowRuns(owner, repo, { limit: 30 }), [owner, repo]);
  const action = useGitHubAction();

  if (runs.loading && !runs.data) return <LoadingState />;
  if (runs.error) return <ErrorState error={runs.error} onRetry={runs.refresh} />;
  if ((runs.data || []).length === 0) {
    return <EmptyState text="No workflow runs found." hint="This repository has no GitHub Actions runs, or the token lacks the workflow scope." />;
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {!!action.error && <Text style={[styles.error, { color: theme.accentRed }]}>{action.error}</Text>}
      {(runs.data || []).map((run) => {
        const color =
          run.status !== "completed"
            ? theme.accentGold
            : run.conclusion === "success"
            ? theme.accentGreen
            : run.conclusion === "cancelled"
            ? theme.textMuted
            : theme.accentRed;
        return (
          <View key={run.id} style={[styles.row, { borderBottomColor: theme.border }]}>
            <Octicons
              name={run.status !== "completed" ? "sync" : run.conclusion === "success" ? "check-circle" : "x-circle"}
              size={13}
              color={color}
            />
            <View style={styles.body}>
              <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
                {run.name} #{run.runNumber}
              </Text>
              <View style={styles.meta}>
                <Text style={[styles.metaText, { color: theme.textMuted }]}>{run.event}</Text>
                <Text style={[styles.metaText, { color: theme.textMuted }]}>{run.branch}</Text>
                <Text style={[styles.metaText, { color: theme.textMuted }]}>{run.actorLogin}</Text>
                <Text style={[styles.metaText, { color: theme.textMuted }]}>{formatStale(run.createdAt)}</Text>
                <Text style={[styles.metaText, { color }]}>{run.conclusion || run.status}</Text>
              </View>
              {!!run.commitMessage && (
                <Text style={[styles.commit, { color: theme.textSecondary }]} numberOfLines={1}>
                  {run.commitMessage}
                </Text>
              )}
            </View>
            <View style={styles.actions}>
              {run.status !== "completed" ? (
                <TouchableOpacity
                  onPress={() => action.run(() => cancelWorkflowRun(owner, repo, run.id), runs.refresh)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.actionText, { color: theme.accentRed }]}>Cancel</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => action.run(() => rerunWorkflow(owner, repo, run.id), runs.refresh)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.actionText, { color: theme.accent }]}>Re-run</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}
      <View style={{ height: 12 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 12.5, fontWeight: "700" },
  meta: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  metaText: { fontSize: 10 },
  commit: { fontSize: 10.5 },
  actions: { justifyContent: "center" },
  actionText: { fontSize: 11, fontWeight: "700" },
  error: { fontSize: 11.5, paddingHorizontal: 12, paddingTop: 8 },
});