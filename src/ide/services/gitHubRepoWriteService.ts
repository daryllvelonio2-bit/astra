import { ghDelete, ghGet, ghList, ghPatch, ghPost, GitHubResult } from "./gitHubApi";
import { GitHubWorkflowRun } from "./gitHubTypes";

/**
 * Write operations on repositories plus the Actions surface that belongs to
 * a repo. Kept separate from gitHubRepoService so read paths stay pure and
 * every mutation is easy to audit in one file.
 */

export interface CreateRepoOptions {
  name: string;
  description?: string;
  isPrivate?: boolean;
  autoInit?: boolean;
  gitignoreTemplate?: string;
  licenseTemplate?: string;
  homepage?: string;
  topics?: string[];
}

export async function createRepo(options: CreateRepoOptions): Promise<GitHubResult<{ fullName: string; htmlUrl: string }>> {
  const res = await ghPost<any>("/user/repos", {
    name: options.name,
    description: options.description || "",
    private: !!options.isPrivate,
    auto_init: !!options.autoInit,
    ...(options.gitignoreTemplate ? { gitignore_template: options.gitignoreTemplate } : {}),
    ...(options.licenseTemplate ? { license_template: options.licenseTemplate } : {}),
    ...(options.homepage ? { homepage: options.homepage } : {}),
  });
  if (!res.ok) return { ok: false, error: res.error };
  const full = res.data?.full_name || options.name;
  if (options.topics?.length && full) {
    await ghPatch(`/repos/${full}`, { topics: options.topics });
  }
  return { ok: true, data: { fullName: full, htmlUrl: res.data?.html_url || "" } };
}

export async function updateRepo(
  owner: string,
  repo: string,
  patch: {
    name?: string;
    description?: string;
    private?: boolean;
    homepage?: string;
    topics?: string[];
    archived?: boolean;
    has_issues?: boolean;
    has_wiki?: boolean;
    default_branch?: string;
  }
): Promise<GitHubResult<unknown>> {
  return ghPatch(`/repos/${owner}/${repo}`, patch);
}

/**
 * GitHub returns 403 "Must have admin rights to Repository." when the token
 * lacks the `delete_repo` scope — even for a true owner/admin, so the raw
 * message is misleading. Translate it into the actionable fix: re-signing in
 * grants the new scope (existing tokens predate it).
 */
export async function deleteRepo(owner: string, repo: string): Promise<GitHubResult<unknown>> {
  const res = await ghDelete(`/repos/${owner}/${repo}`);
  if (!res.ok && res.error.status === 403 && /must have admin rights/i.test(res.error.message)) {
    return {
      ok: false,
      error: {
        ...res.error,
        scopeMissing: true,
        message: "GitHub needs the delete-repository permission on your token. Sign out and sign in again to grant it, then retry.",
      },
    };
  }
  return res;
}

export function transferRepo(owner: string, repo: string, newOwner: string): Promise<GitHubResult<unknown>> {
  return ghPost(`/repos/${owner}/${repo}/transfer`, { new_owner: newOwner });
}

export function createBranch(
  owner: string,
  repo: string,
  branch: string,
  fromSha: string
): Promise<GitHubResult<unknown>> {
  return ghPost(`/repos/${owner}/${repo}/git/refs`, {
    ref: `refs/heads/${branch}`,
    sha: fromSha,
  });
}

export function deleteBranch(owner: string, repo: string, branch: string): Promise<GitHubResult<unknown>> {
  return ghDelete(`/repos/${owner}/${repo}/git/refs/heads/${branch}`);
}

export function createRelease(
  owner: string,
  repo: string,
  payload: {
    tag_name: string;
    name?: string;
    body?: string;
    draft?: boolean;
    prerelease?: boolean;
    target_commitish?: string;
  }
): Promise<GitHubResult<{ htmlUrl: string; tagName: string }>> {
  return ghPost<any>(`/repos/${owner}/${repo}/releases`, payload).then((res) => {
    if (!res.ok) return { ok: false as const, error: res.error };
    return {
      ok: true as const,
      data: { htmlUrl: res.data?.html_url || "", tagName: res.data?.tag_name || payload.tag_name },
    };
  });
}

export async function fetchWorkflowRuns(
  owner: string,
  repo: string,
  options?: { branch?: string; limit?: number }
): Promise<GitHubResult<GitHubWorkflowRun[]>> {
  const res = await ghGet<{ workflow_runs?: any[] }>(`/repos/${owner}/${repo}/actions/runs`, {
    params: {
      branch: options?.branch,
      per_page: Math.min(100, Math.max(1, options?.limit ?? 30)),
    },
  });
  if (!res.ok) return { ok: false, error: res.error };
  const runs = Array.isArray(res.data?.workflow_runs) ? res.data!.workflow_runs! : [];
  return {
    ok: true,
    data: runs.map((json: any) => ({
      id: json?.id ?? 0,
      name: json?.name || json?.display_title || "Workflow",
      event: json?.event || "",
      status: json?.status || "",
      conclusion: json?.conclusion || "",
      branch: json?.head_branch || "",
      commitMessage: (json?.head_commit?.message || "").split("\n")[0],
      runNumber: json?.run_number ?? 0,
      attempt: json?.run_attempt ?? 1,
      createdAt: json?.created_at || "",
      updatedAt: json?.updated_at || "",
      htmlUrl: json?.html_url || "",
      actorLogin: json?.actor?.login || "",
      actorAvatar: json?.actor?.avatar_url || "",
    })),
  };
}

export function rerunWorkflow(owner: string, repo: string, runId: number): Promise<GitHubResult<unknown>> {
  return ghPost(`/repos/${owner}/${repo}/actions/runs/${runId}/rerun`);
}

export function cancelWorkflowRun(owner: string, repo: string, runId: number): Promise<GitHubResult<unknown>> {
  return ghPost(`/repos/${owner}/${repo}/actions/runs/${runId}/cancel`);
}

/** Collaborators (people with access), used by the repo Settings sheet. */
export async function fetchCollaborators(
  owner: string,
  repo: string,
  limit = 60
): Promise<GitHubResult<Array<{ login: string; avatarUrl: string; role: string }>>> {
  const res = await ghList<any>(`/repos/${owner}/${repo}/collaborators`, {
    per_page: Math.min(100, Math.max(1, limit)),
  });
  if (!res.ok) return res;
  return {
    ok: true,
    data: res.data.map((json) => ({
      login: json?.login || "",
      avatarUrl: json?.avatar_url || "",
      role: json?.role_name || (json?.permissions?.admin ? "admin" : json?.permissions?.push ? "write" : "read"),
    })),
  };
}