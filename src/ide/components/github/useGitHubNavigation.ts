import { useCallback, useState } from "react";

/**
 * Navigation for the GitHub surface. One route per screen instead of a pile
 * of booleans: push a route to drill in, pop to go back, so PR -> file ->
 * comment -> back returns exactly where the user was.
 */

export type GitHubRoute =
  | { name: "home" }
  | { name: "search"; query?: string; scope?: "repos" | "code" | "users" | "issues" }
  | { name: "myRepos" }
  | { name: "starred" }
  | { name: "notifications" }
  | { name: "gists" }
  | { name: "profile"; login: string }
  | { name: "followers"; login?: string }
  | { name: "following"; login?: string }
  | { name: "activity"; login: string }
  | { name: "orgs" }
  | { name: "repo"; owner: string; repo: string; tab?: RepoTab; branch?: string }
  | { name: "file"; owner: string; repo: string; path: string; ref?: string }
  | { name: "commits"; owner: string; repo: string; ref?: string; path?: string }
  | { name: "commit"; owner: string; repo: string; sha: string }
  | { name: "releases"; owner: string; repo: string }
  | { name: "release"; owner: string; repo: string; tag: string }
  | { name: "branches"; owner: string; repo: string }
  | { name: "contributors"; owner: string; repo: string }
  | { name: "actions"; owner: string; repo: string }
  | { name: "issues"; owner: string; repo: string; mode: IssueMode }
  | { name: "issue"; owner: string; repo: string; number: number; isPull: boolean }
  | { name: "newIssue"; owner: string; repo: string; isPull: boolean }
  | { name: "pulls"; owner: string; repo: string; filter: PullFilter }
  | { name: "newPull"; owner: string; repo: string }
  | { name: "repoSettings"; owner: string; repo: string }
  | { name: "newRepo" }
  | { name: "createRelease"; owner: string; repo: string }
  | { name: "newGist" };

export type RepoTab = "code" | "issues" | "pulls" | "actions";

export type IssueMode = "open" | "closed" | "mine" | "assigned" | "mentioned";

export type PullFilter = "open" | "closed" | "mine" | "review" | "all";

export interface GitHubNavigation {
  route: GitHubRoute;
  /** Full stack, oldest first; the last entry equals `route`. */
  stack: GitHubRoute[];
  push: (route: GitHubRoute) => void;
  /** Replace the current route (used by tab switches and search). */
  replace: (route: GitHubRoute) => void;
  pop: () => void;
  popToRoot: () => void;
  canGoBack: boolean;
}

export function useGitHubNavigation(initial?: GitHubRoute): GitHubNavigation {
  const [stack, setStack] = useState<GitHubRoute[]>([initial || { name: "home" }]);

  const push = useCallback((route: GitHubRoute) => {
    setStack((prev) => [...prev, route]);
  }, []);

  const replace = useCallback((route: GitHubRoute) => {
    setStack((prev) => [...prev.slice(0, -1), route]);
  }, []);

  const pop = useCallback(() => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  const popToRoot = useCallback(() => {
    setStack((prev) => prev.slice(0, 1));
  }, []);

  return {
    route: stack[stack.length - 1],
    stack,
    push,
    replace,
    pop,
    popToRoot,
    canGoBack: stack.length > 1,
  };
}

/** Breadcrumb text for the header: "owner/repo > pulls > #42". */
export function routeTitle(route: GitHubRoute): string {
  switch (route.name) {
    case "home":
      return "GitHub";
    case "myRepos":
      return "My repositories";
    case "starred":
      return "Starred";
    case "notifications":
      return "Notifications";
    case "gists":
      return "Gists";
    case "orgs":
      return "Organizations";
    case "search":
      return route.query ? `Search: ${route.query}` : "Search";
    case "profile":
      return route.login;
    case "followers":
      return route.login ? `${route.login} · followers` : "Followers";
    case "following":
      return route.login ? `${route.login} · following` : "Following";
    case "activity":
      return `${route.login} · activity`;
    case "repo":
      return `${route.owner}/${route.repo}`;
    case "file":
      return route.path.split("/").pop() || route.path;
    case "commits":
      return "Commits";
    case "commit":
      return `Commit ${route.sha.slice(0, 7)}`;
    case "releases":
      return "Releases";
    case "release":
      return route.tag;
    case "branches":
      return "Branches";
    case "contributors":
      return "Contributors";
    case "actions":
      return "Actions";
    case "issues":
      return "Issues";
    case "pulls":
      return "Pull requests";
    case "issue":
      return `${route.isPull ? "PR" : "Issue"} #${route.number}`;
    case "newIssue":
      return route.isPull ? "New pull request" : "New issue";
    case "newPull":
      return "New pull request";
    case "repoSettings":
      return "Repository settings";
    case "newRepo":
      return "New repository";
    case "createRelease":
      return "New release";
    case "newGist":
      return "New gist";
    default:
      return "GitHub";
  }
}