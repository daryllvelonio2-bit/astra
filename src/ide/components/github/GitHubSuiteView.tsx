import React, { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, Modal, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useGitHubNavigation, routeTitle, GitHubRoute } from "./useGitHubNavigation";
import { GitHubHomeView } from "./GitHubHomeView";
import { GitHubSearchView } from "./GitHubSearchView";
import { GitHubRepoListView } from "./GitHubRepoListView";
import { GitHubProfileView } from "./GitHubProfileView";
import { GitHubRepoView } from "./GitHubRepoView";
import { GitHubIssueView } from "./GitHubIssueView";
import { GitHubIssueListView } from "./GitHubIssueListView";
import { GitHubNotificationsView } from "./GitHubNotificationsView";
import { GitHubGistsView, GitHubContributorsView } from "./GitHubGistViews";
import { GitHubCommitsView, GitHubCommitDetailView, GitHubBranchesView } from "./GitHubHistoryViews";
import { GitHubReleasesView, GitHubReleaseDetailView } from "./GitHubReleasesView";
import { GitHubFileView } from "./GitHubFileView";
import { GitHubFileEditorSheet, commitFileEdit } from "./GitHubFileEditor";
import { GitHubNewRepoView } from "./GitHubNewRepoView";
import { GitHubNewIssueView, GitHubNewPullView, GitHubNewReleaseView } from "./GitHubCreateForms";
import { GitHubRepoSettingsView } from "./GitHubRepoSettingsView";
import { GitHubActionsView } from "./GitHubActionsView";
import { UserRow } from "./GitHubRow";
import { EmptyState, LoadingState } from "./GitHubStates";
import { startRepoClone } from "../../services/repoCloneCoordinator";
import { fetchMyOrgs } from "../../services/gitHubAccountService";
import { invalidateGitHubTokenCache } from "../../services/gitHubApi";
import { showAppDialog } from "../../services/appDialog";
import { GitHubSession, logoutGitHub } from "../../services/gitService";
import { useGitHubResource } from "./useGitHubResource";

/**
 * The full GitHub client surface, opened from the profile popup's "Open
 * GitHub" action or the header avatar. A route stack + bottom tabs, one
 * renderer (this file) that maps every GitHubRoute to its view. Drill-in
 * and back behave like the github.com app; clone stays a one-tap that
 * reports progress through the global indicator.
 */

/**
 * Global top bar height. Kept equal to the Git tab's header bar (40) so the
 * two headers read as one system; the editor sheet offsets from it.
 */
const TOP_BAR_HEIGHT = 40;

interface GitHubSuiteViewProps {
  visible: boolean;
  session: GitHubSession | null;
  workspaceId?: string;
  /** Entry route applied every time the suite opens (e.g. avatar → own profile). */
  initialRoute?: GitHubRoute;
  onClose: () => void;
  onSignedOut?: () => void;
}

type EditorState = { owner: string; repo: string; path: string; ref: string; text: string; sha: string } | null;

export function GitHubSuiteView({ visible, session, workspaceId, initialRoute, onClose, onSignedOut }: GitHubSuiteViewProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useGitHubNavigation();
  // Fresh entry stack on every open: popToRoot + replace collapses to
  // [initialRoute], so the avatar lands on the profile, not a stale drill-in.
  const initialRef = React.useRef(initialRoute);
  initialRef.current = initialRoute;
  const wasVisibleRef = React.useRef(visible);
  React.useEffect(() => {
    if (visible && !wasVisibleRef.current && initialRef.current) {
      nav.popToRoot();
      nav.replace(initialRef.current);
    }
    wasVisibleRef.current = visible;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const [editor, setEditor] = useState<EditorState>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const login = session?.username;

  const onCloneRepo = useCallback(
    (fullName: string) => {
      void startRepoClone({ fullName }, workspaceId);
    },
    [workspaceId]
  );

  const route = nav.route;
  const showTabs = route.name === "home" || route.name === "search" || route.name === "notifications" || route.name === "profile";

  const goTab = useCallback(
    (tab: GitHubRoute) => {
      // Home must reset the stack explicitly: the entry route may be the
      // profile (avatar entry), where popToRoot alone would strand us.
      if (tab.name === "home") {
        nav.popToRoot();
        nav.replace({ name: "home" });
        return;
      }
      nav.popToRoot();
      nav.push(tab);
    },
    [nav]
  );

  const closeEditor = () => setEditor(null);

  const signOut = useCallback(() => {
    showAppDialog({
      title: "Sign out of GitHub?",
      message: "The saved token and git credentials are removed from this device.",
      buttons: [
        { text: "Stay signed in", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => {
            void logoutGitHub().then(() => {
              invalidateGitHubTokenCache();
              onSignedOut?.();
              onClose();
            });
          },
        },
      ],
    });
  }, [onClose, onSignedOut]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => (nav.canGoBack ? nav.pop() : onClose())} statusBarTranslucent>
      <View style={[styles.screen, { backgroundColor: theme.bgPrimary, paddingTop: insets.top }]}>
        {/* Top bar: back / title — same height as the Git tab's header bar */}
        <View style={[styles.topBar, { borderBottomColor: theme.border, backgroundColor: theme.bgSecondary }]}>
          {nav.canGoBack ? (
            <TouchableOpacity style={styles.topBtn} onPress={nav.pop} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Octicons name="chevron-left" size={14} color={theme.textPrimary} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.topBtn} onPress={onClose} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Octicons name="x" size={14} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
          <Text style={[styles.topTitle, { color: theme.textPrimary }]} numberOfLines={1}>
            {routeTitle(route)}
          </Text>
        </View>

        {/* Active route */}
        <View style={styles.content}>
          {renderRoute(route, nav, { login, onCloneRepo, session, workspaceId, onSignedOut, closeAll: onClose, openEditor: setEditor, signOut })}
        </View>

        {/* Bottom tabs */}
        {showTabs && !editor && (
          <View style={[styles.tabBar, { borderTopColor: theme.border, backgroundColor: theme.bgSecondary, paddingBottom: Math.max(7, insets.bottom) }]}>
            <BottomTab icon="home" label="Home" active={route.name === "home"} onPress={() => goTab({ name: "home" })} />
            <BottomTab icon="bell" label="Inbox" active={route.name === "notifications"} onPress={() => goTab({ name: "notifications" })} />
            <BottomTab
              icon="person"
              label="You"
              active={route.name === "profile" && login === session?.username}
              onPress={() => login && goTab({ name: "profile", login })}
            />
          </View>
        )}

        {/* File editor sheet covers the whole content area */}
        {editor && (
          <View style={[styles.editorSheet, { top: TOP_BAR_HEIGHT + insets.top }]}>
            <GitHubFileEditorSheet
              path={editor.path}
              initialText={editor.text}
              sha={editor.sha}
              branch={editor.ref}
              busy={editorBusy}
              error={editorError}
              onCancel={closeEditor}
              onCommit={async (payload) => {
                setEditorBusy(true);
                setEditorError(null);
                const res = await commitFileEdit(editor.owner, editor.repo, editor.path, {
                  ...payload,
                  sha: editor.sha,
                  branch: editor.ref,
                });
                setEditorBusy(false);
                if (res.ok) closeEditor();
                else setEditorError(res.error.message);
              }}
            />
          </View>
        )}
      </View>
    </Modal>
  );
}

interface RenderCtx {
  login?: string;
  session: GitHubSession | null;
  workspaceId?: string;
  onCloneRepo: (fullName: string) => void;
  onSignedOut?: () => void;
  closeAll: () => void;
  openEditor: (state: { owner: string; repo: string; path: string; ref: string; text: string; sha: string }) => void;
  signOut: () => void;
}

function renderRoute(route: GitHubRoute, nav: ReturnType<typeof useGitHubNavigation>, ctx: RenderCtx): React.ReactNode {
  switch (route.name) {
    case "home":
      return (
        <GitHubHomeView
          nav={nav}
          login={ctx.login}
          signedIn={!!ctx.session}
          onSignOut={ctx.signOut}
          onCloneRepo={ctx.onCloneRepo}
        />
      );
    case "search":
      return (
        <GitHubSearchView
          nav={nav}
          initialQuery={route.query}
          initialScope={route.scope}
          onCloneRepo={ctx.onCloneRepo}
        />
      );
    case "myRepos":
      return <GitHubRepoListView nav={nav} mode="mine" onCloneRepo={ctx.onCloneRepo} />;
    case "starred":
      return <GitHubRepoListView nav={nav} mode="starred" onCloneRepo={ctx.onCloneRepo} />;
    case "notifications":
      return <GitHubNotificationsView nav={nav} login={ctx.login} />;
    case "gists":
      return <GitHubGistsView nav={nav} />;
    case "orgs":
      return <OrgsList nav={nav} />;
    case "profile":
      return (
        <GitHubProfileView
          login={route.login}
          nav={nav}
          onCloneRepo={ctx.onCloneRepo}
          initialTab={route.tab}
        />
      );
    case "followers":
      return (
        <GitHubProfileView
          login={route.login || ctx.login || ""}
          nav={nav}
          onCloneRepo={ctx.onCloneRepo}
          initialTab="followers"
        />
      );
    case "following":
      return (
        <GitHubProfileView
          login={route.login || ctx.login || ""}
          nav={nav}
          onCloneRepo={ctx.onCloneRepo}
          initialTab="following"
        />
      );
    case "activity":
      return (
        <GitHubProfileView login={route.login} nav={nav} onCloneRepo={ctx.onCloneRepo} initialTab="activity" />
      );
    case "repo":
      return (
        <GitHubRepoView
          owner={route.owner}
          repo={route.repo}
          nav={nav}
          login={ctx.login}
          onCloneRepo={ctx.onCloneRepo}
          onOpenBranches={() => nav.push({ name: "branches", owner: route.owner, repo: route.repo })}
        />
      );
    case "file":
      return (
        <FileRoute
          owner={route.owner}
          repo={route.repo}
          path={route.path}
          refName={route.ref || "HEAD"}
          openEditor={ctx.openEditor}
          nav={nav}
        />
      );
    case "commits":
      return <GitHubCommitsView owner={route.owner} repo={route.repo} ref={route.ref} path={route.path} nav={nav} />;
    case "commit":
      return <GitHubCommitDetailView owner={route.owner} repo={route.repo} sha={route.sha} />;
    case "branches":
      return (
        <GitHubBranchesView
          owner={route.owner}
          repo={route.repo}
          current="main"
          onPick={(branch) => nav.replace({ name: "commits", owner: route.owner, repo: route.repo, ref: branch })}
        />
      );
    case "contributors":
      return <GitHubContributorsView owner={route.owner} repo={route.repo} nav={nav} />;
    case "releases":
      return <GitHubReleasesView owner={route.owner} repo={route.repo} nav={nav} />;
    case "release":
      return <GitHubReleaseDetailView owner={route.owner} repo={route.repo} tag={route.tag} />;
    case "actions":
      return <GitHubActionsView owner={route.owner} repo={route.repo} />;
    case "issues":
      return <GitHubIssueListView owner={route.owner} repo={route.repo} nav={nav} login={ctx.login} initialMode={route.mode} />;
    case "pulls":
      return <GitHubIssueListView owner={route.owner} repo={route.repo} nav={nav} login={ctx.login} isPull initialMode={route.filter === "closed" ? "closed" : "open"} />;
    case "issue":
      return <GitHubIssueView owner={route.owner} repo={route.repo} number={route.number} isPull={route.isPull} login={ctx.login} />;
    case "newIssue":
      return <GitHubNewIssueView owner={route.owner} repo={route.repo} nav={nav} />;
    case "newPull":
      return <GitHubNewPullView owner={route.owner} repo={route.repo} nav={nav} />;
    case "newRepo":
      return <GitHubNewRepoView nav={nav} onCreated={() => {}} />;
    case "createRelease":
      return <GitHubNewReleaseView owner={route.owner} repo={route.repo} nav={nav} />;
    case "newGist":
      return (
        <EmptyState
          text="Gists are created on github.com"
          hint="Your existing gists (public and secret) show up in the Gists tab."
        />
      );
    case "repoSettings":
      return <GitHubRepoSettingsView owner={route.owner} repo={route.repo} nav={nav} />;
    default:
      return <EmptyState text="Not available yet." />;
  }
}

function OrgsList({ nav }: { nav: ReturnType<typeof useGitHubNavigation> }) {
  const orgs = useGitHubResource(() => fetchMyOrgs(), []);
  if (orgs.loading && !orgs.data) return <LoadingState />;
  if ((orgs.data || []).length === 0) return <EmptyState text="You are not a member of any organization." />;
  return (
    <View>
      {(orgs.data || []).map((org) => (
        <UserRow key={org.login} user={org} onPress={() => nav.push({ name: "profile", login: org.login })} />
      ))}
    </View>
  );
}

function FileRoute({
  owner,
  repo,
  path,
  refName,
  openEditor,
  nav,
}: {
  owner: string;
  repo: string;
  path: string;
  refName: string;
  openEditor: RenderCtx["openEditor"];
  nav: ReturnType<typeof useGitHubNavigation>;
}) {
  const handleEdit = (text: string, sha: string) => openEditor({ owner, repo, path, ref: refName, text, sha });
  return (
    <GitHubFileView
      owner={owner}
      repo={repo}
      path={path}
      refName={refName}
      onEdit={handleEdit}
      onOpenCommits={() => nav.push({ name: "commits", owner, repo, ref: refName, path })}
    />
  );
}

function BottomTab({
  icon,
  label,
  active,
  onPress,
}: {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity style={styles.tabBtn} onPress={onPress} activeOpacity={0.7} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      <Octicons name={icon as any} size={15} color={active ? theme.accent : theme.textMuted} />
      <Text style={[styles.tabLabel, { color: active ? theme.accent : theme.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, height: TOP_BAR_HEIGHT, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  topBtn: { padding: 6 },
  topTitle: { flex: 1, fontSize: 12.5, fontWeight: "700" },
  content: { flex: 1 },
  tabBar: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 7 },
  tabBtn: { flex: 1, alignItems: "center", gap: 2 },
  tabLabel: { fontSize: 9.5, fontWeight: "700" },
  editorSheet: { position: "absolute", top: TOP_BAR_HEIGHT, left: 0, right: 0, bottom: 0 },
});
