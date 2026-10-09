/**
 * Resolve the project's folder AS THE GUEST SEES IT.
 *
 * The registry id is a slug while the folder on disk keeps its own name, and a project can
 * sit in a custom parent outside the app's private workspaces dir — in which case the guest
 * never sees that folder under /workspaces at all. Trusting the resolved path made composer
 * run in an empty directory ("To initialize a project, please create a composer.json file"),
 * which hung the prepare forever on "Getting your project ready".
 *
 * So prove the folder before using it, and heal:
 *   1. keep the resolved folder when it really holds composer.json;
 *   2. else look for a directory with that name anywhere in the guest;
 *   3. else take the first composer.json found under the guest's workspaces root.
 */
import { getWorkspaceDirPath } from "./workspaceService";

/** Runs one command in the guest and resolves with its output. */
export type GuestRunner = (command: string) => Promise<{ out: string }>;

const clean = (s: string): string => s.trim().split("\n").pop()?.trim() || "";

export async function resolveGuestProjectDir(
  workspaceId: string,
  run: GuestRunner,
  guestRoot = "/workspaces"
): Promise<string> {
  let guestDir = `${guestRoot}/${workspaceId}`;
  try {
    const hostDir = String(await getWorkspaceDirPath(workspaceId)).replace(/\/+$/, "");
    const folder = hostDir.split("/").pop();
    if (folder) guestDir = `${guestRoot}/${folder}`;

    // Always exits 0, so an absent marker cannot abort the search by throwing.
    const has = await run(`[ -f ${guestDir}/composer.json ] && echo YES || echo NO`);
    if (!has.out.includes("YES")) {
      if (folder) {
        const byName = await run(
          `find / -maxdepth 5 -type d -name ${folder} 2>/dev/null | head -1`
        );
        const hit = clean(byName.out);
        if (hit && hit.startsWith("/") && !hit.startsWith("/proc")) guestDir = hit;
      }
      const marker = await run(
        `find ${guestRoot} -maxdepth 3 -name composer.json -print -quit 2>/dev/null`
      );
      const m = marker.out.trim().split("\n")[0]?.trim() || "";
      if (m.endsWith("/composer.json")) guestDir = m.replace(/\/composer\.json$/, "");
    }
  } catch (_) {}
  return guestDir;
}
