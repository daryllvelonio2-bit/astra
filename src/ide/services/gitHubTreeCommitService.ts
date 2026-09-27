import { ghGraphQL, GitHubResult } from "./gitHubApi";
import { GitHubTreeCommit } from "./gitHubTypes";

/**
 * "Last commit touching each path" for a whole folder, the way github.com's
 * file list shows a message + age per row.
 *
 * REST would need one request per row (`/commits?path=`); GraphQL exposes
 * `Commit.history(first: 1, path:)`, so every path in a folder is fetched in
 * ONE aliased query. Results are memoized per repo/ref/path so walking back
 * out of a folder is instant and free.
 */

const CACHE_TTL_MS = 120_000;
const CACHE_MAX_ENTRIES = 600;
/** Aliases per request — keeps the query body small and under node limits. */
const PATHS_PER_QUERY = 40;
/**
 * Mobile guard rails: a repo root can hold 1000 entries, and one aliased
 * query per row would hammer the network. Rows past the cap simply show no
 * commit line instead of firing dozens of requests.
 */
const MAX_PATHS = 160;
const MAX_PARALLEL_REQUESTS = 4;

const cache = new Map<string, { at: number; value: GitHubTreeCommit | null }>();

function cacheKey(owner: string, repo: string, ref: string, path: string): string {
  return `${owner}/${repo}@${ref}:${path}`;
}

function readCache(key: string): GitHubTreeCommit | null | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function writeCache(key: string, value: GitHubTreeCommit | null): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value });
}

/** Drop memoized entries (call after a commit so the list can re-read). */
export function invalidateTreeCommitCache(): void {
  cache.clear();
}

function buildQuery(count: number): string {
  const aliases: string[] = [];
  for (let i = 0; i < count; i++) {
    aliases.push(
      `  p${i}: object(expression: $ref) {
    ... on Commit {
      history(first: 1, path: $path${i}) {
        nodes {
          oid
          messageHeadline
          committedDate
          author { name user { login avatarUrl } }
        }
      }
    }
  }`
    );
  }
  const vars = ["$owner: String!", "$name: String!", "$ref: String!"];
  for (let i = 0; i < count; i++) vars.push(`$path${i}: String!`);
  return `query TreeCommits(${vars.join(", ")}) {
  repository(owner: $owner, name: $name) {
${aliases.join("\n")}
  }
}`;
}

function mapNode(node: any, oid: string): GitHubTreeCommit | null {
  if (!node) return null;
  const author = node.author || {};
  return {
    messageHeadline: node.messageHeadline || "",
    committedDate: node.committedDate || "",
    oid: node.oid || oid,
    authorLogin: author.user?.login || "",
    authorAvatar: author.user?.avatarUrl || "",
    authorName: author.name || "",
  };
}

interface GraphQLPayload {
  data?: { repository?: Record<string, any> | null } | null;
  errors?: Array<{ message?: string }>;
}

/** Latest commit for each path; paths with no history map to null. */
export async function fetchTreeCommits(
  owner: string,
  repo: string,
  ref: string,
  paths: string[]
): Promise<GitHubResult<Record<string, GitHubTreeCommit | null>>> {
  const unique = Array.from(new Set(paths.filter((p) => typeof p === "string" && p.length > 0))).slice(
    0,
    MAX_PATHS
  );
  const out: Record<string, GitHubTreeCommit | null> = {};
  const missing: string[] = [];

  for (const path of unique) {
    const hit = readCache(cacheKey(owner, repo, ref, path));
    if (hit === undefined) missing.push(path);
    else out[path] = hit;
  }
  if (missing.length === 0) return { ok: true, data: out };

  const chunks: string[][] = [];
  for (let i = 0; i < missing.length; i += PATHS_PER_QUERY) {
    chunks.push(missing.slice(i, i + PATHS_PER_QUERY));
  }

  const runChunk = (chunk: string[]) => {
    const variables: Record<string, unknown> = { owner, name: repo, ref };
    chunk.forEach((path, i) => {
      variables[`path${i}`] = path;
    });
    return ghGraphQL<GraphQLPayload>(buildQuery(chunk.length), variables);
  };

  const responses: Array<Awaited<ReturnType<typeof runChunk>>> = [];
  for (let i = 0; i < chunks.length; i += MAX_PARALLEL_REQUESTS) {
    const batch = chunks.slice(i, i + MAX_PARALLEL_REQUESTS);
    responses.push(...(await Promise.all(batch.map(runChunk))));
  }

  const failed = responses.find((res) => !res.ok);
  if (failed && !failed.ok) return { ok: false, error: failed.error };

  for (let c = 0; c < chunks.length; c++) {
    const res = responses[c];
    if (!res.ok) continue;
    const repository = res.data?.data?.repository;
    if (!repository) continue;
    chunks[c].forEach((path, i) => {
      const nodes = repository[`p${i}`]?.history?.nodes;
      const info = Array.isArray(nodes) ? mapNode(nodes[0], "") : null;
      out[path] = info;
      writeCache(cacheKey(owner, repo, ref, path), info);
    });
  }

  return { ok: true, data: out };
}
