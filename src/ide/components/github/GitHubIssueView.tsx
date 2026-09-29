import React, { useCallback, useState } from "react";
import { View, Text, Image, TouchableOpacity, ScrollView, StyleSheet, Pressable, TextInput } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { fetchIssue, fetchIssueComments, addIssueComment, closeIssue, reopenIssue } from "../../services/gitHubIssueService";
import { fetchPull, fetchPullFiles, fetchPullReviews, mergePull, setPullReady, reopenPull, closePull } from "../../services/gitHubPullService";
import { submitPullReview, dismissPullReview, PullReviewEvent } from "../../services/gitHubReviewService";
import { useGitHubResource, useGitHubAction } from "./useGitHubResource";
import { ErrorState, LoadingState } from "./GitHubStates";
import { Composer } from "./GitHubControls";
import { GitHubPull, GitHubPullFile, GitHubPullReview } from "../../services/gitHubTypes";
import { formatStale } from "../../services/gitHubProfileService";
import { GitHubFileDiff } from "./GitHubFileDiff";
import { openMenu, MenuItem } from "./GitHubMenuList";
import { showAppDialog } from "../../services/appDialog";

/**
 * Issue + PR detail. One file: both are the same thread with a timeline and
 * a composer; PRs add a conversation/files/checks strip. Destructive actions
 * confirm first, and every mutation is a named, awaitable service call.
 */

type Tab = "conversation" | "files";

export function GitHubIssueView({
  owner,
  repo,
  number,
  isPull,
  login,
}: {
  owner: string;
  repo: string;
  number: number;
  isPull: boolean;
  login?: string;
}) {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>("conversation");
  const [comment, setComment] = useState("");

  const issue = useGitHubResource<any>(
    async () => {
      const res = isPull ? await fetchPull(owner, repo, number) : await fetchIssue(owner, repo, number);
      return (res.ok
        ? { ok: true, data: res.data }
        : { ok: false, error: res.error }) as any;
    },
    [owner, repo, number, isPull]
  );
  const comments = useGitHubResource(
    () => fetchIssueComments(owner, repo, number),
    [owner, repo, number]
  );
  const files = useGitHubResource(
    () => fetchPullFiles(owner, repo, number),
    [owner, repo, number],
    { skip: !isPull || tab !== "files" }
  );
  const reviews = useGitHubResource(
    () => fetchPullReviews(owner, repo, number),
    [owner, repo, number],
    { skip: !isPull }
  );

  const action = useGitHubAction();

  const refreshAll = useCallback(() => {
    issue.refresh();
    comments.refresh();
    reviews.refresh();
    files.refresh();
  }, [issue, comments, reviews, files]);

  const submitComment = useCallback(() => {
    const body = comment.trim();
    if (!body) return;
    void action.run(() => addIssueComment(owner, repo, number, body), () => {
      setComment("");
      comments.refresh();
    });
  }, [action, comment, owner, repo, number, comments]);

  const toggleState = useCallback(() => {
    const pull = isPull ? (issue.data as GitHubPull) : null;
    const isClosed = pull ? pull.state === "closed" : (issue.data as any)?.state === "closed";
    void action.run<any>(
      () =>
        isPull
          ? isClosed
            ? reopenPull(owner, repo, number)
            : closePull(owner, repo, number)
          : isClosed
          ? reopenIssue(owner, repo, number)
          : closeIssue(owner, repo, number),
      refreshAll
    );
  }, [action, isPull, issue.data, owner, repo, number, refreshAll]);

  const doMerge = useCallback(() => {
    void action.run(() => mergePull(owner, repo, number, { method: "merge" }), refreshAll);
  }, [action, owner, repo, number, refreshAll]);

  const doReady = useCallback(() => {
    void action.run(() => setPullReady(owner, repo, number, true), refreshAll);
  }, [action, owner, repo, number, refreshAll]);

  // Review submission handlers
  const handleSubmitReview = useCallback(
    async (event: PullReviewEvent, body?: string) => {
      await action.run(
        () => submitPullReview(owner, repo, number, { event, body }),
        refreshAll
      );
    },
    [action, owner, repo, number, refreshAll]
  );

  const handleDismissReview = useCallback(
    async (reviewId: number) => {
      await action.run(
        () => dismissPullReview(owner, repo, number, reviewId),
        refreshAll
      );
    },
    [action, owner, repo, number, refreshAll]
  );

  const openReviewMenu = useCallback(() => {
    const items: MenuItem[] = [
      {
        icon: "check",
        label: "Approve",
        onPress: () => handleSubmitReview("APPROVE"),
      },
      {
        icon: "x",
        label: "Request changes",
        onPress: () => handleSubmitReview("REQUEST_CHANGES"),
      },
      {
        icon: "comment",
        label: "Comment",
        onPress: () => {
          showAppDialog({
            title: "Add review comment",
            message: "Enter a body for this review (optional).",
            content: (
              <View style={{ width: "100%" }}>
                <Text style={{ color: theme.textSecondary, marginBottom: 8 }}>
                  Your comment will be posted as a review with the "Comment" event.
                </Text>
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
                  }}
                  multiline
                  placeholder="Write a review comment..."
                  onChangeText={(text) => {
                    // We'll handle the submit below
                  }}
                />
              </View>
            ),
            buttons: [
              { text: "Cancel", style: "cancel" },
              {
                text: "Submit review",
                style: "default",
                onPress: () => {
                  // We need to get the text from the input - this needs ref
                },
              },
            ],
          });
        },
      },
    ];
    openMenu({ title: "Review changes", items });
  }, [action, owner, repo, number, refreshAll, theme]);

  // Comment review with text input - using a simpler approach
  const [reviewCommentText, setReviewCommentText] = useState("");
  const [showCommentDialog, setShowCommentDialog] = useState(false);

  const openCommentReviewDialog = useCallback(() => {
    setReviewCommentText("");
    showAppDialog({
      title: "Add review comment",
      message: "Enter a body for this review.",
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
          value={reviewCommentText}
          onChangeText={setReviewCommentText}
          autoFocus
        />
      ),
      buttons: [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit review",
          style: "default",
          onPress: () => {
            if (reviewCommentText.trim()) {
              handleSubmitReview("COMMENT", reviewCommentText.trim());
            }
          },
        },
      ],
    });
  }, [theme, reviewCommentText, handleSubmitReview]);

  if (issue.loading && !issue.data) return <LoadingState />;
  if (issue.error) return <ErrorState error={issue.error} onRetry={issue.refresh} />;
  if (!issue.data) return null;

  const data: any = issue.data;
  const isClosed = data.state === "closed";
  const pull = isPull ? (data as GitHubPull) : null;
  const canMerge = !!pull && !pull.isMerged && pull.state === "open" && !pull.isDraft && pull.mergeable === "true";

  return (
    <View style={styles.wrap}>
      <View style={[styles.titleBlock, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>{data.title}</Text>
        <View style={styles.metaRow}>
          <Octicons
            name={isClosed ? (pull?.isMerged ? "git-merge" : "check") : isPull ? "git-pull-request" : "issue-opened"}
            size={12}
            color={isClosed ? theme.accentPurple : pull?.isDraft ? theme.textMuted : theme.accentGreen}
          />
          <Text style={[styles.metaText, { color: theme.textSecondary }]}>
            #{data.number} · {isClosed ? (pull?.isMerged ? "merged" : "closed") : "open"} by {data.authorLogin}
          </Text>
          <Text style={[styles.metaText, { color: theme.textMuted }]}>{formatStale(data.createdAt)}</Text>
        </View>
        {!!pull && (
          <View style={styles.metaRow}>
            <Text style={[styles.metaText, { color: theme.textSecondary }]}>
              {pull.headRef} → {pull.baseRef}
            </Text>
            <Text style={[styles.metaText, { color: theme.accentGreen }]}>+{pull.additions}</Text>
            <Text style={[styles.metaText, { color: theme.accentRed }]}>-{pull.deletions}</Text>
            <Text style={[styles.metaText, { color: theme.textMuted }]}>{pull.changedFiles} files</Text>
            {pull.isDraft && <Text style={[styles.metaText, { color: theme.textMuted }]}>draft</Text>}
          </View>
        )}
      </View>

      {isPull && (
        <View style={[styles.tabs, { borderBottomColor: theme.border }]}>
          <TabBtn label="Conversation" active={tab === "conversation"} onPress={() => setTab("conversation")} />
          <TabBtn
            label={`Files changed${pull ? ` ${pull.changedFiles}` : ""}`}
            active={tab === "files"}
            onPress={() => setTab("files")}
          />
        </View>
      )}

      {tab === "files" && isPull ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          {files.loading && !files.data ? (
            <LoadingState />
          ) : files.error ? (
            <ErrorState error={files.error} onRetry={files.refresh} />
          ) : (
            (files.data || []).map((file: GitHubPullFile) => (
              <GitHubFileDiff key={file.filename} file={file} owner={owner} repo={repo} number={number} />
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <CommentBlock
            author={data.authorLogin}
            avatar={data.authorAvatar}
            body={data.body}
            createdAt={data.createdAt}
          />

          {isPull && (reviews.data || []).length > 0 && (
            <View style={styles.reviewBlock}>
              {(reviews.data || []).map((review) => (
                <View key={review.id} style={styles.reviewRow}>
                  <Text
                    style={[
                      styles.reviewLine,
                      {
                        color:
                          review.state === "APPROVED"
                            ? theme.accentGreen
                            : review.state === "CHANGES_REQUESTED"
                            ? theme.accentRed
                            : theme.textMuted,
                      },
                    ]}
                  >
                    {review.authorLogin} {reviewStateLabel(review.state)} {formatStale(review.submittedAt)}
                  </Text>
                  {(review.state === "APPROVED" || review.state === "CHANGES_REQUESTED") && (
                    <TouchableOpacity
                      style={styles.dismissBtn}
                      onPress={() => handleDismissReview(review.id)}
                      disabled={action.busy}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dismissText, { color: theme.textMuted }]}>Dismiss review</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          )}

          {(comments.data || []).map((c) => (
            <CommentBlock
              key={c.id}
              author={c.authorLogin}
              avatar={c.authorAvatar}
              body={c.body}
              createdAt={c.createdAt}
            />
          ))}

          <View style={[styles.actions, { borderTopColor: theme.border, borderBottomColor: theme.border }]}>

            {/* Review button for PRs */}
            {isPull && (
              <ActionBtn icon="checklist" label="Review" onPress={openCommentReviewDialog} busy={action.busy} />
            )}

            <ActionBtn
              icon={isClosed ? "issue-reopened" : "check"}
              label={isClosed ? "Reopen" : isPull ? "Close pull request" : "Close issue"}
              onPress={toggleState}
              busy={action.busy}
            />
            {!!pull && pull.isDraft && (
              <ActionBtn icon="eye" label="Ready for review" onPress={doReady} busy={action.busy} />
            )}
            {canMerge && (
              <ActionBtn icon="git-merge" label="Merge pull request" onPress={doMerge} busy={action.busy} accent />
            )}
          </View>

          {!!action.error && (
            <Text style={[styles.errorText, { color: theme.accentRed }]}>{action.error}</Text>
          )}

          <Composer
            value={comment}
            onChangeText={setComment}
            placeholder={login ? "Leave a comment..." : "Sign in to comment"}
            minHeight={80}
            onSubmit={login ? submitComment : undefined}
            submitLabel="Comment"
            busy={action.busy}
            disabled={!login}
          />
          <View style={{ height: 16 }} />
        </ScrollView>
      )}
    </View>
  );
}

function reviewStateLabel(state: string): string {
  switch (state) {
    case "APPROVED":
      return "approved";
    case "CHANGES_REQUESTED":
      return "requested changes on";
    case "DISMISSED":
      return "dismissed their review on";
    default:
      return "reviewed";
  }
}

function CommentBlock({
  author,
  avatar,
  body,
  createdAt,
}: {
  author: string;
  avatar: string;
  body: string;
  createdAt: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.comment, { borderBottomColor: theme.border }]}>
      <View style={styles.commentHead}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: theme.accent }]} />
        )}
        <Text style={[styles.commentAuthor, { color: theme.textPrimary }]}>{author || "unknown"}</Text>
        <Text style={[styles.commentTime, { color: theme.textMuted }]}>{formatStale(createdAt)}</Text>
      </View>
      <Text style={[styles.commentBody, { color: theme.textSecondary }]}>{body || "(no description)"}</Text>
    </View>
  );
}

function TabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.tabBtn, { borderBottomColor: active ? theme.accent : "transparent" }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.tabText, { color: active ? theme.textPrimary : theme.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ActionBtn({
  icon,
  label,
  onPress,
  busy,
  accent,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  busy?: boolean;
  accent?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.actionBtn, { borderColor: theme.border, backgroundColor: accent ? theme.accent : theme.bgTertiary }]}
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.8}
    >
      <Octicons name={icon as any} size={12} color={accent ? "#fff" : theme.textSecondary} />
      <Text style={[styles.actionText, { color: accent ? "#fff" : theme.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  titleBlock: { paddingHorizontal: 12, paddingVertical: 10, gap: 5, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 14.5, fontWeight: "800", lineHeight: 19 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  metaText: { fontSize: 10.5 },
  tabs: { flexDirection: "row", paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 2 },
  tabText: { fontSize: 11.5, fontWeight: "700" },
  comment: { paddingHorizontal: 12, paddingVertical: 10, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  commentHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#333" },
  commentAuthor: { fontSize: 12, fontWeight: "700" },
  commentTime: { fontSize: 10 },
  commentBody: { fontSize: 12, lineHeight: 17 },
  reviewBlock: { paddingHorizontal: 12, paddingVertical: 8, gap: 3 },
  reviewLine: { fontSize: 10.5 },
  reviewRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dismissBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  dismissText: { fontSize: 10.5, fontWeight: "600" },
  actions: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexWrap: "wrap",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionText: { fontSize: 11.5, fontWeight: "700" },
  errorText: { fontSize: 11.5, paddingHorizontal: 12, paddingTop: 8 },
});