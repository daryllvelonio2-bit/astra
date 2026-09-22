import React, {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { StyleSheet, Linking } from "react-native";
import { WebView } from "react-native-webview";
import {
  addTerminalDataListener,
  addTerminalExitListener,
  getSessionHistory,
  resizeTerminalSession,
  writeTerminalInput,
} from "../../../../modules/linux-runner/src";
import { buildXtermHtml } from "./xtermHtml.generated";
import { utf8ToB64 } from "./terminalEncoding";
import { TerminalTheme, getXtermTheme } from "./terminalThemes";
import { stripLeakedTerminalText } from "./terminalBuffer";

export interface XtermViewHandle {
  focusTerminal: () => void;
  requestSelection: () => Promise<string>;
  writeText: (text: string) => void;
}

interface XtermViewProps {
  sessionId: string;
  fontSize: number;
  theme?: TerminalTheme;
  background?: string;
  foreground?: string;
  cursor?: string;
  onRemoteResize?: (cols: number, rows: number) => void;
  onFontSizeChange?: (size: number) => void;
  /** Banner (title + build tag) painted above the replayed history. */
  banner?: string;
  /** WebView tapped: the soft keyboard lives on the RN catcher — raise it. */
  onRequestKeyboard?: () => void;
  /** Hidden tab: buffer incoming bytes, skip bridge flush until visible. */
  visible?: boolean;
  /** Keyboard visible: suppress xterm fit() so content stays in place. */
  isKeyboardVisible?: boolean;
  /** Approximate visible rows when keyboard is up (for cursor scroll). */
  visibleRows?: number;
}

interface GlueMessage {
  type: "ready" | "data" | "resize" | "selection" | "tap" | "link" | "fontSize";
  data?: string;
  cols?: number;
  rows?: number;
  text?: string;
  url?: string;
  size?: number;
}

// Max base64 chars per injected write; keeps injectJavaScript calls small.
const WRITE_SLICE = 65536;
// Max queued chunks (~2KB each). Beyond this on runaway floods we drop from
// the front rather than OOM; the native history still caps the true record.
const MAX_QUEUE = 512;

export const XtermView = memo(
  forwardRef<XtermViewHandle, XtermViewProps>(function XtermView(
    {
      sessionId,
      fontSize,
      theme,
      background,
      foreground,
      cursor,
      banner,
      onRemoteResize,
      onFontSizeChange,
      onRequestKeyboard,
      visible = true,
      isKeyboardVisible = false,
      visibleRows = 0,
    },
    ref
  ) {
  const webRef = useRef<WebView>(null);
  const bannerRef = useRef(banner || "");
  bannerRef.current = banner || "";
  const readyRef = useRef(false);
  const pageLoadedRef = useRef(false);
  const queueRef = useRef<string[]>([]);
  const selResolveRef = useRef<((text: string) => void) | null>(null);
  // Grid tracking for the blind-paint heal below. lastFit persists across
  // sessions (the page keeps its grid over a reset); paintFit records what
  // the grid was when this session's content last painted: undefined = not
  // yet painted, null = painted with no measurement (the 2-col wedge case).
  const lastFitRef = useRef<{ c: number; r: number } | null>(null);
  const paintFitRef = useRef<{ c: number; r: number } | null | undefined>(undefined);
  const healedRef = useRef(false);
  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;
  const isKeyboardVisibleRef = useRef(isKeyboardVisible);
  isKeyboardVisibleRef.current = isKeyboardVisible;
  const visibleRowsRef = useRef(visibleRows);
  visibleRowsRef.current = visibleRows;
  const resizeRef = useRef(onRemoteResize);
  resizeRef.current = onRemoteResize;
  const keyboardRef = useRef(onRequestKeyboard);
  keyboardRef.current = onRequestKeyboard;
  // Hidden tab: skip bridge writes (queue keeps latest per MAX_QUEUE cap).
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const activeBg = theme?.background || background || "#0d1117";
  const activeFg = theme?.foreground || foreground || "#f0f6fc";
  const activeCursor = theme?.cursor || cursor || "#58a6ff";
  const xtermTheme = useMemo(() => (theme ? getXtermTheme(theme) : undefined), [theme]);

  const html = useMemo(
    () =>
      buildXtermHtml({
        background: activeBg,
        foreground: activeFg,
        cursor: activeCursor,
        fontSize,
        theme: xtermTheme,
      }),
    [activeBg, activeFg, activeCursor, fontSize, xtermTheme]
  );

  const injectWrite = (b64: string) => {
    for (let i = 0; i < b64.length; i += WRITE_SLICE) {
      const piece = b64.slice(i, i + WRITE_SLICE);
      webRef.current?.injectJavaScript(`window.__astraWrite('${piece}');true;`);
    }
  };

  const enqueue = (b64: string) => {
    queueRef.current.push(b64);
    if (queueRef.current.length > MAX_QUEUE) {
      queueRef.current.splice(0, queueRef.current.length - MAX_QUEUE);
    }
  };

  const flushQueue = () => {
    if (!readyRef.current || queueRef.current.length === 0) return;
    const joined = queueRef.current.join("");
    queueRef.current = [];
    injectWrite(joined);
  };

  useImperativeHandle(ref, () => ({
    focusTerminal: () => {
      webRef.current?.injectJavaScript("window.__astraFocus&&window.__astraFocus();true;");
    },
    requestSelection: () => {
      return new Promise<string>((resolve) => {
        selResolveRef.current = resolve;
        webRef.current?.injectJavaScript(
          "window.__astraGetSelection&&window.__astraGetSelection();true;"
        );
        setTimeout(() => {
          if (selResolveRef.current) {
            selResolveRef.current = null;
            resolve("");
          }
        }, 1500);
      });
    },
    writeText: (text: string) => {
      if (!text) return;
      enqueue(utf8ToB64(text));
      flushQueue();
    },
  }));

  // Reset + paint the native history snapshot for `id`. Atomic by
  // construction: the ready gate stays closed until the snapshot lands, so a
  // live byte can neither duplicate (snapshot + queue) nor slip through.
  // Native appends to history before emitting, so dropped pre-ready bytes
  // are always inside the snapshot.
  const replaySession = async (id: string) => {
    try {
      webRef.current?.injectJavaScript("window.__astraReset&&window.__astraReset();true;");
      const hist = await getSessionHistory(id);
      if (sessionRef.current !== id) return; // switched away mid-flight
      // Banner first: native history never contains it (legacy renderer kept
      // its own copy), and reset wiped the grid so it paints exactly once.
      const cleanHist = stripLeakedTerminalText(hist || "");
      injectWrite(utf8ToB64(bannerRef.current + cleanHist));
      paintFitRef.current = lastFitRef.current ? { ...lastFitRef.current } : null;
      if (!isKeyboardVisibleRef.current) {
        webRef.current?.injectJavaScript("window.__astraFit&&window.__astraFit();true;");
      }
    } catch (_) {}
  };

  // Session lifecycle: subscribe to the native stream; paint the new session
  // on switch. Pre-ready bytes are dropped (covered by the replay snapshot).
  useEffect(() => {
    readyRef.current = false;
    queueRef.current = [];
    healedRef.current = false;
    paintFitRef.current = undefined;
    // New PTY starts at default 80x24: force the next resize through even
    // if the grid matches the previous session (dedupe would skip it).
    lastFitRef.current = null;

    const dataSub = addTerminalDataListener(sessionId, (chunk: string) => {
      if (!readyRef.current) return;
      const cleanChunk = stripLeakedTerminalText(chunk);
      if (!cleanChunk) return;
      enqueue(utf8ToB64(cleanChunk));
      if (!visibleRef.current) return;
      // Adaptive flush: interactive typing (short queue) paints immediately;
      // floods batch into the 80ms safety net instead of one bridge call
      // per chunk. Keeps WRITE_SLICE/MAX_QUEUE semantics unchanged.
      if (queueRef.current.length > 4) return;
      // Paint immediately: the 80ms interval below is only a safety net.
      // Gating every update on a timer added up to ~1s of visible lag when
      // the JS thread was busy (measured on-device).
      flushQueue();
    });

    const exitSub = addTerminalExitListener(sessionId, (code: number) => {
      enqueue(utf8ToB64(`\r\n[Process completed: exit ${code}]\r\n`));
      if (visibleRef.current) flushQueue();
    });

    // Tab switch onto an already-loaded page: paint before latching ready.
    // First mount waits for the page 'ready' message instead (see below).
    if (pageLoadedRef.current) {
      replaySession(sessionId).then(() => {
        if (sessionRef.current === sessionId) {
          readyRef.current = true;
          flushQueue();
        }
      });
    }

    const flusher = setInterval(() => {
      if (visibleRef.current) flushQueue();
    }, 80);
    return () => {
      clearInterval(flusher);
      dataSub.remove();
      exitSub.remove();
    };
  }, [sessionId]);

  // Tab switch back: paint everything buffered while hidden and refit viewport.
  useEffect(() => {
    if (visible && readyRef.current) {
      flushQueue();
      webRef.current?.injectJavaScript("window.__astraFit&&window.__astraFit();true;");
    }
  }, [visible]);

  // Font zoom follows the terminal fontSize setting.
  useEffect(() => {
    if (readyRef.current) {
      webRef.current?.injectJavaScript(
        `window.__astraSetFontSize&&window.__astraSetFontSize(${fontSize});true;`
      );
    }
  }, [fontSize]);

  // Dynamic theme update
  useEffect(() => {
    if (readyRef.current && xtermTheme) {
      webRef.current?.injectJavaScript(
        `window.__astraSetTheme&&window.__astraSetTheme(${JSON.stringify(xtermTheme)});true;`
      );
    }
  }, [xtermTheme]);

  // Notify xterm to suppress fit() while keyboard is up, and optionally
  // scroll the cursor into view if it's below the visible clip.
  useEffect(() => {
    if (!readyRef.current) return;
    webRef.current?.injectJavaScript(
      `window.__astraSetKeyboardVisible&&window.__astraSetKeyboardVisible(${isKeyboardVisible},${visibleRows});true;`
    );
  }, [isKeyboardVisible, visibleRows]);

  const handleReady = async () => {
    pageLoadedRef.current = true;
    readyRef.current = false;
    await replaySession(sessionRef.current);
    readyRef.current = true;
    flushQueue();
    if (isKeyboardVisibleRef.current) {
      webRef.current?.injectJavaScript(
        `window.__astraSetKeyboardVisible&&window.__astraSetKeyboardVisible(true,${visibleRowsRef.current});true;`
      );
    }
  };

  const handleMessage = (e: any) => {
    let msg: GlueMessage;
    try {
      msg = JSON.parse(e?.nativeEvent?.data || "{}");
    } catch (_) {
      return;
    }
    if (msg.type === "ready") {
      handleReady();
    } else if (msg.type === "data" && typeof msg.data === "string") {
      // Drop automated escape sequence responses (Cursor Position Report ^[[...R,
      // Device Attributes ^[[?...c, Status reports ^[[...n) so they never leak into
      // the shell's stdin or echo as raw control characters on screen.
      if (/^\x1b\[\??[0-9;]*[Rrcnt]$/.test(msg.data)) {
        return;
      }
      writeTerminalInput(sessionRef.current, msg.data);
    } else if (
      msg.type === "resize" &&
      typeof msg.cols === "number" &&
      typeof msg.rows === "number"
    ) {
      // Dedupe: same grid as last measurement needs no TIOCSWINSZ/SIGWINCH.
      const last = lastFitRef.current;
      if (last && last.c === msg.cols && last.r === msg.rows) return;
      resizeTerminalSession(sessionRef.current, msg.cols, msg.rows);
      resizeRef.current?.(msg.cols, msg.rows);
      lastFitRef.current = { c: msg.cols, r: msg.rows };
      // Blind-paint heal: this session's content painted before any real
      // measurement (wedged wraps that never rejoin). Now that the true grid
      // is known, replay once so the paint matches it. Skipped when the
      // paint already had a fit — normal resizes (keyboard, rotation) don't
      // need it and must not flicker.
      if (!healedRef.current && paintFitRef.current === null) {
        healedRef.current = true;
        replaySession(sessionRef.current);
      }
    } else if (msg.type === "selection") {
      selResolveRef.current?.(msg.text || "");
      selResolveRef.current = null;
    } else if (msg.type === "tap") {
      keyboardRef.current?.();
    } else if (msg.type === "fontSize" && typeof msg.size === "number") {
      onFontSizeChange?.(msg.size);
    } else if (msg.type === "link" && typeof msg.url === "string") {
      // CLI login links (and any terminal URL): open the system browser so
      // the real Google/ChatGPT session + passkeys are available. http(s)
      // only; anything else is ignored.
      const url = msg.url.trim();
      if (/^https?:\/\//i.test(url)) {
        Linking.openURL(url).catch(() => {});
      }
    }
  };

  return (
    <WebView
      ref={webRef}
      source={{ html }}
      style={styles.web}
      // The wrapper View defaults to wrap-content: without its own flex the
      // WebView never fills the column, fit measures a short viewport, and
      // the shell inherits a too-small grid (early scroll + wrap mismatch).
      containerStyle={styles.webContainer}
      originWhitelist={["*"]}
      javaScriptEnabled
      domStorageEnabled={false}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      overScrollMode="never"
      androidLayerType="hardware"
      onMessage={handleMessage}
    />
  );
  })
);

const styles = StyleSheet.create({
  web: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    backgroundColor: "transparent",
  },
  webContainer: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
});
