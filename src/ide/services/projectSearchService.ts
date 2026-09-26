import { executeCommand } from "../../../modules/linux-runner/src";

/**
 * Project-wide search executed in the Debian guest (PRoot). Prefers ripgrep
 * (Optional Extras r-ripgrep); falls back to GNU grep with the same
 * path:line:content output format so parsing is shared.
 */

export interface SearchOptions {
  query: string;
  caseSensitive?: boolean;
  regex?: boolean;
  /** Glob filter, e.g. "*.tsx" or "src/** / *.py" (rg --glob syntax). */
  include?: string;
}

export interface SearchMatch {
  /** Workspace-relative file path. */
  path: string;
  line: number;
  /** Matched line content (trimmed, capped). */
  text: string;
}

export interface SearchResult {
  matches: SearchMatch[];
  truncated: boolean;
  error?: string;
}

const MAX_MATCHES = 400;
const MAX_TEXT = 240;

/** Escape a string for safe single-quoted POSIX shell embedding. */
function sq(s: string): string {
  return `'${(s || "").replace(/'/g, `'\\''`)}'`;
}

function normalizeRelPath(p: string): string {
  let r = (p || "").trim();
  if (r.startsWith("./")) r = r.slice(2);
  if (r.startsWith("/")) r = r.replace(/^\/+/, "");
  return r;
}

/** Parse `path:line:content` output lines (rg and grep -rn share this). */
export function parseSearchLines(stdout: string): SearchMatch[] {
  const out: SearchMatch[] = [];
  for (const raw of stdout.split("\n")) {
    if (!raw) continue;
    const first = raw.indexOf(":");
    if (first <= 0) continue;
    const second = raw.indexOf(":", first + 1);
    if (second <= first) continue;
    const line = parseInt(raw.slice(first + 1, second), 10);
    if (!Number.isFinite(line) || line <= 0) continue;
    const path = normalizeRelPath(raw.slice(0, first));
    if (!path) continue;
    out.push({ path, line, text: raw.slice(second + 1).trim().slice(0, MAX_TEXT) });
    if (out.length >= MAX_MATCHES) break;
  }
  return out;
}

/**
 * Run a search for the workspace root in the guest. Binary dirs are always
 * skipped; query is shell-quoted, never interpolated raw.
 */
export async function searchProject(
  workspaceId: string,
  opts: SearchOptions
): Promise<SearchResult> {
  const q = (opts.query || "").trim();
  if (!q) return { matches: [], truncated: false };

  const caseFlag = opts.caseSensitive ? "" : " -i";
  const fixedFlag = opts.regex ? "" : "F";
  const glob = (opts.include || "").trim();

  const skip =
    "--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist " +
    "--exclude-dir=build --exclude-dir=.expo --exclude-dir=android/build";

  // rg: fixed-string (-F) vs regex (default); -M caps column width.
  const rgGlobs =
    (glob ? ` --glob ${sq(glob)}` : "") +
    " --glob !package-lock.json --glob !*.lock --glob !yarn.lock";
  const rgCmd =
    `rg -n --no-heading --color never -M ${MAX_TEXT}${caseFlag}` +
    `${fixedFlag ? ` -${fixedFlag}` : ""}${rgGlobs} -- ${sq(q)} .`;

  // grep -rn: -F fixed, -E regex, -I skips binary files.
  const modeFlag = opts.regex ? "-E" : `-${fixedFlag || "F"}`;
  const grepIncl = glob ? ` --include=${sq(glob)}` : "";
  const grepCmd =
    `grep -rnI ${modeFlag}${caseFlag}${grepIncl} ${skip} -- ${sq(q)} .`;

  const cmd =
    `if command -v rg >/dev/null 2>&1; then ${rgCmd}; ` +
    `else ${grepCmd}; fi 2>/dev/null | head -n ${MAX_MATCHES}`;

  let res;
  try {
    res = await executeCommand(cmd, workspaceId);
  } catch (e: any) {
    return { matches: [], truncated: false, error: e?.message || "Search failed" };
  }

  const stdout = res.stdout || "";
  if (res.exitCode !== 0 && res.exitCode !== 1 && !stdout) {
    // exit 1 = no matches (both rg and grep). Anything else is a real error.
    return {
      matches: [],
      truncated: false,
      error: stdout.trim().slice(0, 200) || `Search exited with code ${res.exitCode}`,
    };
  }
  const matches = parseSearchLines(stdout);
  return { matches, truncated: matches.length >= MAX_MATCHES };
}
