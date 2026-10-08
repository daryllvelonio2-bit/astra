import { RefObject, useCallback, useEffect, useRef } from "react";
import { XtermViewHandle } from "./XtermView";

/**
 * Keeps the xterm WebView(s) glued to the RN layout box. Whenever the
 * terminal viewport changes size — keyboard inset applied/removed, split
 * created or destroyed, rotation, quick-add remount — the pane(s) must be
 * told to recompute rows/cols and scroll the caret into view, otherwise the
 * terminal keeps painting to stale geometry and text lands off-screen.
 *
 * The template's own window.resize handler is best-effort; these explicit,
 * debounced calls run after our layout settles so the grid matches the real
 * box. All timers are cleared on unmount.
 */
export function useTerminalRefit(
  primary: RefObject<XtermViewHandle | null>,
  secondary: RefObject<XtermViewHandle | null>
) {
  const refsRef = useRef<Array<RefObject<XtermViewHandle | null>>>([primary, secondary]);
  refsRef.current = [primary, secondary];
  const lastHeightRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefit = useCallback((delay = 90) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      for (const r of refsRef.current) r.current?.refit();
    }, delay);
  }, []);

  /** onLayout for the box that actually wraps the terminal WebView(s). */
  const onBoxLayout = useCallback(
    (height: number) => {
      if (!height || height <= 0) return;
      if (Math.abs(height - lastHeightRef.current) < 2) return;
      lastHeightRef.current = height;
      scheduleRefit();
    },
    [scheduleRefit]
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return { scheduleRefit, onBoxLayout };
}
