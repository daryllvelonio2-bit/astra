import { useCallback, useEffect, useRef, useState } from "react";

const MAX_LOG_LINES = 200;
const FLUSH_MS = 100;

/**
 * Batched log lines for install/start streaming output. Native provisions
 * push one line per callback — flushing each via setState re-renders the
 * log view per line. Batches into one setState per ~100ms. Same final log.
 */
export function useBatchedLog() {
  const [log, setLog] = useState<string[]>([]);
  const pendingRef = useRef<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    timerRef.current = null;
    const batch = pendingRef.current;
    pendingRef.current = [];
    if (!batch.length) return;
    setLog((prev) => {
      const next = prev.length ? [...prev, ...batch] : batch;
      return next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next;
    });
  }, []);

  const pushLog = useCallback(
    (line: string) => {
      pendingRef.current.push(line);
      if (!timerRef.current) {
        timerRef.current = setTimeout(flush, FLUSH_MS);
      }
    },
    [flush]
  );

  const clearLog = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = [];
    setLog([]);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return { log, pushLog, clearLog };
}
