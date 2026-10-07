import type { WorkspaceMeta } from "./workspaceService";

/**
 * Collapse workspace metas so one project renders as ONE card.
 *
 * `listWorkspaces()` unions the directories on disk with the registry keys, so a
 * project whose folder is not already a slug ("Teachers-Day" on disk vs
 * "teachers-day" in the registry) arrives from BOTH sources and was drawn twice
 * in the picker.
 *
 * The comparison is by directory path and MUST be case-insensitive: the two
 * entries describe the same folder, and one of the paths is derived from the
 * lowercased registry id. A case-sensitive compare merges nothing — which is
 * exactly how the duplicates survived the first attempt at this fix.
 *
 * When one path has both entries the REGISTRY one wins: it carries the real
 * display name and the true directory path.
 */
export function collapseWorkspaceMetas(
  metas: WorkspaceMeta[],
  registry: Record<string, unknown>
): WorkspaceMeta[] {
  const byDir = new Map<string, WorkspaceMeta>();
  for (const meta of metas) {
    const key = (meta.dirPath || meta.id).replace(/\/+$/, "").toLowerCase();
    const prev = byDir.get(key);
    const metaRegistered = !!registry[meta.id];
    const prevRegistered = prev ? !!registry[prev.id] : false;
    if (!prev || (metaRegistered && !prevRegistered)) byDir.set(key, meta);
  }
  return Array.from(byDir.values());
}
