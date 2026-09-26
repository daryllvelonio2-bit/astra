/**
 * Shared GitHub entity shapes. One vocabulary for every service and view so
 * raw snake_case API payloads are mapped exactly once, at the edge.
 */

export interface GitHubUserSummary {
  login: string;
  name: string;
  avatarUrl: string;
  htmlUrl: string;
  /** "User" | "Organization" */
  kind: string;
}

export interface GitHubUserDetail extends GitHubUserSummary {
  bio: string;
  company: string;
  location: string;
  blog: string;
  twitterUsername: string;
  email: string;
  publicRepos: number;
  publicGists: number;
  followers: number;
  following: number;
  createdAt: string;
  isOrganization: boolean;
}

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  ownerAvatar: string;
  description: string;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  language: string;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  topics: string[];
  license: string;
  homepage: string;
  visibility: string;
  defaultBranch: string;
  updatedAt: string;
  pushedAt: string;
  htmlUrl: string;
  cloneUrl: string;
  sizeKb: number;
}

export interface GitHubContentEntry {
  name: string;
  path: string;
  /** "file" | "dir" | "symlink" | "submodule" */
  type: string;
  size: number;
  htmlUrl: string;
  downloadUrl: string;
}

export interface GitHubFileText {
  path: string;
  name: string;
  size: number;
  text: string;
  truncated: boolean;
  htmlUrl: string;
}

export interface GitHubBranchInfo {
  name: string;
  sha: string;
  isProtected: boolean;
}

export interface GitHubCommitSummary {
  sha: string;
  shortSha: string;
  message: string;
  authorName: string;
  authorLogin: string;
  authorAvatar: string;
  date: string;
  htmlUrl: string;
}

export interface GitHubRelease {
  id: number;
  tagName: string;
  name: string;
  body: string;
  isDraft: boolean;
  isPrerelease: boolean;
  createdAt: string;
  publishedAt: string;
  htmlUrl: string;
  authorLogin: string;
  authorAvatar: string;
}

export interface GitHubLabel {
  name: string;
  /** 6-digit hex, no leading '#'. */
  color: string;
  description: string;
}

export interface GitHubMilestone {
  number: number;
  title: string;
  state: string;
  dueOn: string;
  openIssues: number;
  closedIssues: number;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  /** "open" | "closed" */
  state: string;
  stateReason: string;
  isPullRequest: boolean;
  authorLogin: string;
  authorAvatar: string;
  labels: GitHubLabel[];
  assigneeLogins: string[];
  milestone: string;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string;
  htmlUrl: string;
  repoFullName: string;
}

export interface GitHubComment {
  id: number;
  body: string;
  authorLogin: string;
  authorAvatar: string;
  authorAssociation: string;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
}

export interface GitHubPullFile {
  filename: string;
  /** "added" | "modified" | "removed" | "renamed" */
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch: string;
}

export interface GitHubPullReview {
  id: number;
  authorLogin: string;
  authorAvatar: string;
  /** "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" */
  state: string;
  body: string;
  submittedAt: string;
}

export interface GitHubPull {
  number: number;
  title: string;
  body: string;
  /** "open" | "closed" */
  state: string;
  isDraft: boolean;
  isMerged: boolean;
  mergeable: string;
  mergedByLogin: string;
  authorLogin: string;
  authorAvatar: string;
  labels: GitHubLabel[];
  baseRef: string;
  headRef: string;
  requestedReviewers: string[];
  comments: number;
  reviewComments: number;
  commits: number;
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: string;
  updatedAt: string;
  mergedAt: string;
  htmlUrl: string;
  repoFullName: string;
}

export interface GitHubNotification {
  id: string;
  unread: boolean;
  reason: string;
  updatedAt: string;
  /** "Issue" | "PullRequest" | "Release" | "Discussion" | "Commit" | ... */
  subjectType: string;
  subjectTitle: string;
  subjectApiUrl: string;
  repoFullName: string;
  repoHtmlUrl: string;
  /** Web URL when derivable from the subject API URL. */
  webUrl: string;
}

export interface GitHubGistFile {
  name: string;
  language: string;
  size: number;
  content?: string;
}

export interface GitHubGist {
  id: number | string;
  description: string;
  isPublic: boolean;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  files: GitHubGistFile[];
  ownerLogin: string;
  ownerAvatar: string;
  commentCount: number;
}

export interface GitHubCodeSearchItem {
  path: string;
  repoFullName: string;
  repoId: number;
  htmlUrl: string;
  fragments: string[];
}

export interface GitHubWorkflowRun {
  id: number;
  name: string;
  event: string;
  /** "queued" | "in_progress" | "completed" */
  status: string;
  /** "success" | "failure" | "cancelled" | "skipped" | null while running */
  conclusion: string;
  branch: string;
  commitMessage: string;
  runNumber: number;
  attempt: number;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
  actorLogin: string;
  actorAvatar: string;
}

export interface GitHubEvent {
  id: string;
  /** e.g. "PushEvent", "PullRequestEvent" */
  type: string;
  repoFullName: string;
  createdAt: string;
  /** Short human sentence, e.g. "pushed 3 commits to main". */
  summary: string;
  actorLogin: string;
  actorAvatar: string;
}

/** Sign-in scopes Astra requests; used to explain 403s to the user. */
export const GITHUB_SCOPES = "repo read:user user:email notifications gist workflow";

/** One day cell of the contributions calendar (colors come from GitHub itself). */
export interface ContribDay {
  date: string;
  count: number;
  color: string;
}

/** Full-year contributions calendar: weeks of day cells + yearly total. */
export interface ContribCalendar {
  total: number;
  weeks: ContribDay[][];
}