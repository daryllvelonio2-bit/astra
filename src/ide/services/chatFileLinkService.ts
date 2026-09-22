/**
 * Resolves agent-emitted file paths (Linux PRoot, file:// URLs, relative)
 * into workspace-relative paths suitable for `readFileContent`.
 * Single responsibility: chat file-link path normalization.
 */

export function resolveChatPathToRelative(rawPath: string, workspaceId?: string): string {
  if (!rawPath) return "";
  let p = rawPath.trim().replace(/^['"`]+|['"`]+$/g, "").trim();
  if (!p) return "";
  p = p.replace(/^file:\/\//i, "").replace(/\/+/g, "/");
  p = p.replace(/:(\d+)(:\d+)?$/, "");
  p = p.replace(/[),.;:]+$/, "");
  if (!p) return "";

  let m = p.match(/^\/workspaces\/[^/]+\/(.*)$/);
  if (m) return (m[1] || "").replace(/^\/+/, "");
  m = p.match(/^\/workspace\/(.*)$/);
  if (m) return (m[1] || "").replace(/^\/+/, "");
  if (p === "/workspace" || p === "/workspaces") return "";

  if (workspaceId) {
    const esc = workspaceId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    m = p.match(new RegExp(`^/${esc}/(.*)$`));
    if (m) return (m[1] || "").replace(/^\/+/, "");
  }

  if (p.startsWith("./")) p = p.slice(2);
  if (p.startsWith("/sdcard") || p.startsWith("/storage") || p.startsWith("/data")) return p;

  p = p.replace(/^\/+/, "");
  m = p.match(/^workspaces\/[^/]+\/(.*)$/);
  if (m) return m[1] || "";
  m = p.match(/^workspace\/(.*)$/);
  if (m) return m[1] || "";
  return p;
}
export function isOpenableFileTarget(target: string): boolean {
  const t = target.trim();
  if (!t || /\s/.test(t)) return false;
  if (/^https?:\/\//i.test(t)) return false;
  const clean = t.replace(/^file:\/\//i, "").replace(/[),.;:]+$/, "");
  if (/^\/workspace(s)?\//.test(clean)) return true;
  if (/^file:\/\//i.test(t)) return true;
  if (/[\w.\-~]+(?:\/[\w.\-~]+)+\.\w{1,5}(?::\d+)?$/.test(clean)) return true;
  if (/^[\w.\-~]+\.\w{1,5}(?::\d+)?$/.test(clean)) return true;
  return false;
}

/**
 * Short display label for a raw agent path: strips internal app storage
 * prefixes (/data/user/.../files/workspaces/<id>/) down to a relative path,
 * then keeps at most the last 2 segments so buttons never overflow.
 */
export function prettyChatPath(rawPath: string, workspaceId?: string, maxLen = 34): string {
  if (!rawPath) return "";
  const p = rawPath.trim();
  const internal = p.match(/^\/data\/user\/\d+\/[^/]+\/files\/workspaces\/[^/]+\/?(.*)$/);
  let rel = internal ? internal[1] || "" : resolveChatPathToRelative(p, workspaceId);
  if (!rel) return workspaceId || "workspace";
  if (rel.length > maxLen) {
    const segs = rel.split("/").filter(Boolean);
    rel = segs.length > 1 ? `…/${segs.slice(-2).join("/")}` : rel;
  }
  if (rel.length > maxLen) rel = `…${rel.slice(rel.length - maxLen + 1)}`;
  return rel;
}
