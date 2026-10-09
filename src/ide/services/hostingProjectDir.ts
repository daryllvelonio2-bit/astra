/**
 * Resolve the project's folder AS THE GUEST SEES IT.
 *
 * The registry id is a slug while the folder on disk keeps its own name, and a project can
 * sit in a custom parent outside the app's private workspaces dir — in which case the guest
 * never sees that folder under /workspaces at all. Trusting the resolved path made composer
 * run in an empty directory ("To initialize a project, please create a composer.json file"),
 * which hung the prepare forever on "Getting your project ready".
 *
 * So prove the folder before using it, and heal — BUT ONLY WHEN THE PLAN ASKS FOR A MARKER.
 * `marker` is the file a plan genuinely requires (Laravel: composer.json). A static-site or
 * Node plan passes no marker, so it can never be redirected to some unrelated composer.json
 * elsewhere in the guest: it uses the folder the workspace actually resolved to.
 *   1. no marker -> the resolved folder, done (no search);
 *   2. resolved folder already holds the marker -> keep it;
 *   3. else a directory with that name anywhere in the guest;
 *   4. else the first matching marker found under the guest's workspaces root.
 */
import { getWorkspaceDirPath } from "./workspaceService";

/** Runs one command in the guest and resolves with its output. */
export type GuestRunner = (command: string) => Promise<{ out: string }>;

export interface ResolveOptions {
  /** File the plan requires in the project root, e.g. "composer.json". */
  marker?: string;
  guestRoot?: string;
}

const clean = (s: string): string => s.trim().split("\n").pop()?.trim() || "";

export async function resolveGuestProjectDir(
  workspaceId: string,
  run: GuestRunner,
  opts: ResolveOptions = {}
): Promise<string> {
  const { marker, guestRoot = "/workspaces" } = opts;
  let guestDir = `${guestRoot}/${workspaceId}`;
  try {
    const hostDir = String(await getWorkspaceDirPath(workspaceId)).replace(/\/+$/, "");
    const folder = hostDir.split("/").pop();
    if (folder) guestDir = `${guestRoot}/${folder}`;

    // No marker to satisfy: this plan does not need the folder discovered, so
    // never move it. (A static site must not be pointed at another folder's
    // composer.json.)
    if (!marker) return guestDir;

    // Always exits 0, so an absent marker cannot abort the search by throwing.
    const has = await run(`[ -f ${guestDir}/${marker} ] && echo YES || echo NO`);
    if (!has.out.includes("YES")) {
      if (folder) {
        const byName = await run(
          `find / -maxdepth 5 -type d -name ${folder} 2>/dev/null | head -1`
        );
        const hit = clean(byName.out);
        if (hit && hit.startsWith("/") && !hit.startsWith("/proc")) guestDir = hit;
      }
      const found = await run(
        `find ${guestRoot} -maxdepth 3 -name ${marker} -print -quit 2>/dev/null`
      );
      const m = found.out.trim().split("\n")[0]?.trim() || "";
      if (m.endsWith("/" + marker)) guestDir = m.slice(0, -(marker.length + 1));
    }
  } catch (_) {}
  return guestDir;
}
