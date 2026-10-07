import type { WorkspaceMeta } from "./workspaceService";

/**
 * Identity of a workspace by the directory it points at.
 *
 * The two sources that `listWorkspaces()` unions describe the same folder
 * differently, so a naive string compare never matches:
 *
 *   - the entry derived from a directory on disk builds its path from
 *     WORKSPACES_DIR, which is a `file://` URI  -> file:///data/user/0/.../ws/X/
 *   - the registry entry stores a plain path     -> /data/user/0/.../ws/X/
 *
 * So strip the scheme and a trailing slash and fold case. Verified against the
 * live device: the duplicate cards were exactly this pair, while a folder whose
 * name was already a slug (no id/path disagreement) appeared only once.
 */
export function workspacePathKey(dirPath?: string, fallbackId?: string): string {
  const raw = (dirPath && dirPath.trim()) || fallbackId || "";
  return raw
    .replace(/^file:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

/**
 * Collapse workspace metas so one project renders as ONE card.
 *
 * `listWorkspaces()` unions the directories on disk with the registry keys, so a
 * project whose folder is not already a slug ("Teachers-Day" on disk vs
 * "teachers-day" in the registry) arrives from BOTH sources and was drawn twice
 * in the picker.
 *
 * When one directory has both entries the REGISTRY one wins: it carries the real
 * display name and a usable path.
 */
export function collapseWorkspaceMetas(
  metas: WorkspaceMeta[],
  registry: Record<string, unknown>
): WorkspaceMeta[] {
  const byDir = new Map<string, WorkspaceMeta>();
  for (const meta of metas) {
    const key = workspacePathKey(meta.dirPath, meta.id);
    const prev = byDir.get(key);
    const metaRegistered = !!registry[meta.id];
    const prevRegistered = prev ? !!registry[prev.id] : false;
    if (!prev || (metaRegistered && !prevRegistered)) byDir.set(key, meta);
  }
  return Array.from(byDir.values());
}
