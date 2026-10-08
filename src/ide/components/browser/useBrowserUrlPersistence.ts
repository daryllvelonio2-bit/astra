import { useEffect, useRef, useState } from "react";
import { loadBrowserUrl, saveBrowserUrl } from "../../services/configService";

/**
 * The browser's last address, restored on cold start and persisted (debounced)
 * as the user browses. Keeps the storage plumbing out of IDELayout.
 *
 * Returns [url, setUrl]; setUrl is a drop-in for the useState setter the shell
 * already passed around (address bar + IDE action bridge).
 */
export function useBrowserUrlPersistence() {
  const [url, setUrl] = useState<string>("");
  // Only start writing once the restore has run, so an in-flight restore can
  // never clobber an address the user opened before it resolved.
  const restoredRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadBrowserUrl()
      .then((saved) => {
        if (cancelled) return;
        restoredRef.current = true;
        if (saved) setUrl((prev) => prev || saved);
      })
      .catch(() => { restoredRef.current = true; });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!restoredRef.current || !url) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { saveBrowserUrl(url); }, 800);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [url]);

  return [url, setUrl] as const;
}
