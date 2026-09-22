import { useCallback, useEffect, useRef, useState } from "react";
import {
  CommitAvatarMap,
  fetchCommitAvatars,
  getGitHubApiToken,
  parseGitHubRepo,
} from "../../services/gitAvatarService";
import {
  loadPersistedAvatars,
  savePersistedAvatars,
} from "../../services/gitAvatarCache";

const EMPTY_MAP: CommitAvatarMap = { bySha: {}, byEmail: {} };

function sameMap(a: CommitAvatarMap, b: CommitAvatarMap): boolean {
  const aSha = Object.keys(a.bySha);
  const bSha = Object.keys(b.bySha);
  if (aSha.length !== bSha.length) return false;
  for (const k of aSha) if (a.bySha[k] !== b.bySha[k]) return false;
  const aEm = Object.keys(a.byEmail);
  const bEm = Object.keys(b.byEmail);
  if (aEm.length !== bEm.length) return false;
  for (const k of aEm) if (a.byEmail[k] !== b.byEmail[k]) return false;
  return true;
}

/**
 * Stale-while-revalidate avatar store for one repo.
 * Lives in GitHubDesktopView (stays mounted) so History tab switches never
 * refetch: disk cache renders instantly, network revalidates in background.
 */
export function useCommitAvatars(remoteUrl?: string | null) {
  const [avatars, setAvatars] = useState<CommitAvatarMap>(EMPTY_MAP);
  const [brokenAvatars, setBrokenAvatars] = useState<Record<string, boolean>>({});
  const liveKey = useRef<string | null>(null);
  const avatarsRef = useRef(avatars);
  avatarsRef.current = avatars;
  const brokenRef = useRef(brokenAvatars);
  brokenRef.current = brokenAvatars;

  useEffect(() => {
    const ref = parseGitHubRepo(remoteUrl);
    if (!ref) {
      liveKey.current = null;
      setAvatars(EMPTY_MAP);
      setBrokenAvatars({});
      return;
    }
    const key = `${ref.owner}/${ref.repo}`.toLowerCase();
    if (liveKey.current === key) return;
    liveKey.current = key;
    let cancelled = false;

    // 1. Instant: disk L2 (no letter flash on reopen/restart).
    loadPersistedAvatars(ref.owner, ref.repo)
      .then((p) => {
        if (cancelled || !p) return;
        if (Object.keys(p.bySha).length > 0 || Object.keys(p.byEmail).length > 0) {
          setAvatars({ bySha: { ...p.bySha }, byEmail: { ...p.byEmail } });
        }
        if (Object.keys(p.broken).length > 0) setBrokenAvatars({ ...p.broken });
      })
      .catch(() => {});

    // 2. Background revalidate (failures stay silent, stale stays visible).
    getGitHubApiToken()
      .catch(() => null)
      .then((token) => fetchCommitAvatars(ref.owner, ref.repo, token || undefined))
      .then((map) => {
        if (cancelled) return;
        if (Object.keys(map.bySha).length === 0 && Object.keys(map.byEmail).length === 0) return;
        setAvatars((prev) => (sameMap(prev, map) ? prev : map));
        savePersistedAvatars(ref.owner, ref.repo, map).catch(() => {});
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [remoteUrl]);

  const markBroken = useCallback(
    (hash: string) => {
      if (!hash || brokenRef.current[hash]) return;
      const ref = parseGitHubRepo(remoteUrl);
      setBrokenAvatars((prev) => (prev[hash] ? prev : { ...prev, [hash]: true }));
      // Persist negative (Gravatar 404) so reopen skips the failing Image.
      if (ref) {
        savePersistedAvatars(ref.owner, ref.repo, avatarsRef.current, {
          [hash]: true,
        }).catch(() => {});
      }
    },
    [remoteUrl]
  );

  return { avatars, brokenAvatars, markBroken };
}
