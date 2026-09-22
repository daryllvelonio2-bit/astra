import * as FileSystem from "expo-file-system/legacy";
import { getFileInfo, readFileText, writeFileText } from "./nativeFs";
import type { CommitAvatarMap } from "./gitAvatarService";

export interface PersistedAvatars {
  bySha: Record<string, string>;
  byEmail: Record<string, string>;
  broken: Record<string, boolean>;
  savedAt: number;
}

export const AVATAR_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const EMPTY: PersistedAvatars = { bySha: {}, byEmail: {}, broken: {}, savedAt: 0 };

function sanitizeSegment(s: string): string {
  return (s || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 80) || "x";
}

function cacheFileFor(owner: string, repo: string): string | null {
  const base = FileSystem.documentDirectory;
  if (!base) return null;
  return `${base}git-avatars/${sanitizeSegment(owner)}__${sanitizeSegment(repo)}.json`;
}

function isRecord(v: unknown): v is Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every((x) => typeof x === "string");
}

export function repoCacheKey(owner: string, repo: string): string {
  return `${owner}/${repo}`.toLowerCase();
}

/** Disk L2: returns null on miss/corrupt — never throws. */
export async function loadPersistedAvatars(
  owner: string,
  repo: string
): Promise<PersistedAvatars | null> {
  try {
    const file = cacheFileFor(owner, repo);
    if (!file) return null;
    const info = await getFileInfo(file);
    if (!info.exists) return null;
    const raw = await readFileText(file);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedAvatars>;
    if (!isRecord(parsed.bySha) || !isRecord(parsed.byEmail)) return null;
    const broken =
      parsed.broken && typeof parsed.broken === "object" && !Array.isArray(parsed.broken)
        ? (parsed.broken as Record<string, boolean>)
        : {};
    return {
      bySha: parsed.bySha as Record<string, string>,
      byEmail: parsed.byEmail as Record<string, string>,
      broken,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
    };
  } catch (_) {
    return null;
  }
}

/** Disk L2 write-through — fire-and-forget, never throws. */
export async function savePersistedAvatars(
  owner: string,
  repo: string,
  map: CommitAvatarMap,
  broken?: Record<string, boolean>
): Promise<void> {
  try {
    const file = cacheFileFor(owner, repo);
    if (!file) return;
    const prev = await loadPersistedAvatars(owner, repo).catch(() => null);
    const merged: PersistedAvatars = {
      bySha: { ...(prev?.bySha || {}), ...map.bySha },
      byEmail: { ...(prev?.byEmail || {}), ...map.byEmail },
      broken: { ...(prev?.broken || {}), ...(broken || {}) },
      savedAt: Date.now(),
    };
    // Cap growth: history lists cover ~200 commits; keep newest 500 entries.
    for (const k of ["bySha", "byEmail"] as const) {
      const keys = Object.keys(merged[k]);
      if (keys.length > 500) {
        const keep = keys.slice(keys.length - 500);
        const next: Record<string, string> = {};
        for (const key of keep) next[key] = merged[k][key];
        merged[k] = next;
      }
    }
    const brokenKeys = Object.keys(merged.broken);
    if (brokenKeys.length > 500) {
      const keep = brokenKeys.slice(brokenKeys.length - 500);
      const next: Record<string, boolean> = {};
      for (const key of keep) next[key] = true;
      merged.broken = next;
    }
    await writeFileText(file, JSON.stringify(merged));
  } catch (_) {}
}

export function isStale(savedAt: number, now = Date.now()): boolean {
  if (!savedAt) return true;
  return now - savedAt > AVATAR_CACHE_TTL_MS;
}

export function toMap(p: PersistedAvatars | null): CommitAvatarMap {
  if (!p) return { bySha: {}, byEmail: {} };
  return { bySha: p.bySha, byEmail: p.byEmail };
}

export { EMPTY as EMPTY_PERSISTED_AVATARS };
