import { useCallback, useEffect, useRef, useState } from "react";
import { GitHubApiError, GitHubResult } from "../../services/gitHubApi";

/**
 * One loader for every GitHub view: runs the fetcher, tracks
 * loading/error/data, ignores stale resolutions, and exposes refresh().
 * Keeps each view file about layout instead of plumbing.
 */

export interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: GitHubApiError | null;
  refresh: () => void;
}

export function useGitHubResource<T>(
  fetcher: () => Promise<GitHubResult<T>>,
  deps: unknown[],
  options?: { enabled?: boolean; skip?: boolean }
): ResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<GitHubApiError | null>(null);
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (options?.enabled === false || options?.skip) return;
    const current = ++seq.current;
    setLoading(true);
    setError(null);

    fetcher()
      .then((res) => {
        if (!mounted.current || current !== seq.current) return;
        if (res.ok) {
          setData(res.data);
          setError(null);
        } else {
          setError(res.error);
        }
        setLoading(false);
      })
      .catch((e: any) => {
        if (!mounted.current || current !== seq.current) return;
        setError({
          status: 0,
          rateLimited: false,
          scopeMissing: false,
          message: e?.message || "Request failed.",
        });
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, options?.enabled, options?.skip]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, refresh };
}

/** Run a mutation with busy + error text, auto-clearing the error on retry. */
export function useGitHubAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async <T,>(
      fn: () => Promise<GitHubResult<T>>,
      onSuccess?: (data: T) => void
    ): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const res = await fn();
        if (!mounted.current) return false;
        if (res.ok) {
          setBusy(false);
          onSuccess?.(res.data);
          return true;
        }
        setError(res.error.message);
        setBusy(false);
        return false;
      } catch (e: any) {
        if (mounted.current) {
          setError(e?.message || "Action failed.");
          setBusy(false);
        }
        return false;
      }
    },
    []
  );

  return { busy, error, setError, run };
}