import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  memo,
} from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { buildCodeMirrorHtml } from "./codemirrorHtml.generated";

export interface CodeMirrorEditorHandle {
  jumpToLine: (line: number) => void;
  undo: () => void;
  redo: () => void;
  focus: () => void;
  blur: () => void;
}

interface CodeMirrorEditorViewProps {
  content: string;
  fileName?: string;
  onChangeContent: (text: string) => void;
  theme: any;
  fontSize: number;
  lineHeight: number;
  isEditing: boolean;
  keyboardMouseMode?: boolean;
  onCursorChange?: (line: number, col: number) => void;
  onEnterEditMode?: () => void;
  onPinchStart?: (dist: number, absDx: number) => void;
  onPinchMove?: (dist: number, absDx: number) => void;
  onPinchEnd?: () => void;
  onZoomIn?: (step?: number) => void;
  onZoomOut?: (step?: number) => void;
  onZoomReset?: () => void;
  visible?: boolean;
}

// Phase 1 anti-echo: CodeMirror is source-of-truth while typing. React
// renders lag behind WebView postMessage bursts ("a" -> "ab"), so an
// intermediate render must never be injected back (it would clobber newer
// keystrokes and reset the cursor). Only file switches and true external
// edits (format / disk reload) may push content into the WebView.
const ECHO_HISTORY_MAX = 30;
const ECHO_HISTORY_TTL_MS = 3000;

function hashText(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return ((h * 33) ^ s.length) | 0;
}

export const CodeMirrorEditorView = memo(
  forwardRef<CodeMirrorEditorHandle, CodeMirrorEditorViewProps>(
    function CodeMirrorEditorView(
      {
        content,
        fileName,
        onChangeContent,
        theme,
        fontSize,
        lineHeight,
        isEditing,
        keyboardMouseMode = false,
        onCursorChange,
        onEnterEditMode,
        onPinchStart,
        onPinchMove,
        onPinchEnd,
        onZoomIn,
        onZoomOut,
        onZoomReset,
        visible = true,
      },
      ref
    ) {
      const webViewRef = useRef<WebView>(null);
      const isReadyRef = useRef(false);
      const [, setIsReady] = useState(false);
      const lastEmittedTextRef = useRef(content);
      const lastPropContentRef = useRef(content);
      const currentFileNameRef = useRef(fileName);
      // Recent typing emissions (hash + timestamp). A content prop whose
      // hash is in here is a stale intermediate echo, not an external edit.
      const echoHashesRef = useRef<Set<number>>(new Set());
      const echoQueueRef = useRef<Array<{ h: number; t: number }>>([]);

      const rememberEmitted = (text: string) => {
        const h = hashText(text || "");
        const now = Date.now();
        if (!echoHashesRef.current.has(h)) {
          echoHashesRef.current.add(h);
          echoQueueRef.current.push({ h, t: now });
        } else {
          // Refresh timestamp so live undo/redo back-and-forth stays recognized.
          const q = echoQueueRef.current;
          for (let i = 0; i < q.length; i++) {
            if (q[i].h === h) {
              q[i].t = now;
              break;
            }
          }
        }
        // Prune by TTL and cap: keeps disk-reload-after-pause from
        // false-matching an old typing state.
        const cutoff = now - ECHO_HISTORY_TTL_MS;
        const q = echoQueueRef.current;
        while (q.length > 0 && (q[0].t < cutoff || q.length > ECHO_HISTORY_MAX)) {
          const old = q.shift();
          if (old && !q.some((e) => e.h === old.h)) echoHashesRef.current.delete(old.h);
        }
      };

      const isStaleEcho = (text: string): boolean => {
        const now = Date.now();
        const cutoff = now - ECHO_HISTORY_TTL_MS;
        const q = echoQueueRef.current;
        while (q.length > 0 && (q[0].t < cutoff || q.length > ECHO_HISTORY_MAX)) {
          const old = q.shift();
          if (old && !q.some((e) => e.h === old.h)) echoHashesRef.current.delete(old.h);
        }
        return echoHashesRef.current.has(hashText(text || ""));
      };

      const clearEchoHistory = () => {
        echoHashesRef.current.clear();
        echoQueueRef.current = [];
      };

      const html = useRef(
        buildCodeMirrorHtml({
          background: theme.bgPrimary || "#1e1e1e",
          isDark: theme.isDark !== false,
        })
      ).current;
      const source = useMemo(() => ({ html }), [html]);

      const inject = useCallback((js: string) => {
        try {
          webViewRef.current?.injectJavaScript(`${js};true;`);
        } catch (_) {}
      }, []);

      const triggerBlur = useCallback(() => {
        inject(
          `try{if(document.activeElement&&document.activeElement.blur){document.activeElement.blur();}var el=document.querySelector('.cm-content');if(el&&el.blur){el.blur();}}catch(_){}`
        );
      }, [inject]);

      useImperativeHandle(
        ref,
        () => ({
          jumpToLine: (line: number) => {
            inject(`window.__cmJumpToLine && window.__cmJumpToLine(${line})`);
          },
          undo: () => {
            inject(`window.__cmUndo && window.__cmUndo()`);
          },
          redo: () => {
            inject(`window.__cmRedo && window.__cmRedo()`);
          },
          focus: () => {
            inject(`window.__cmFocus && window.__cmFocus()`);
          },
          blur: triggerBlur,
        }),
        [inject, triggerBlur]
      );

      // Trigger blur when hidden so CodeMirror releases IME focus
      useEffect(() => {
        if (!visible) {
          triggerBlur();
        }
      }, [visible, triggerBlur]);

      // Handle message from CodeMirror inside WebView
      const handleMessage = useCallback(
        (event: any) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (!data || typeof data.type !== "string") return;

            if (data.type === "ready") {
              isReadyRef.current = true;
              setIsReady(true);
              // Push initial state
              const safeText = JSON.stringify(lastPropContentRef.current || "");
              const safeName = JSON.stringify(currentFileNameRef.current || "");
              inject(`window.__cmSetContent && window.__cmSetContent(${safeText}, ${safeName})`);
              inject(`window.__cmSetFontSize && window.__cmSetFontSize(${fontSize}, ${lineHeight})`);
              inject(`window.__cmSetTheme && window.__cmSetTheme(${theme.isDark !== false}, ${JSON.stringify(theme.bgPrimary || "")})`);
              inject(`window.__cmSetKeyboardMouseMode && window.__cmSetKeyboardMouseMode(${!!keyboardMouseMode})`);
              inject(`window.__cmSetReadOnly && window.__cmSetReadOnly(${!isEditing})`);
            } else if (data.type === "change" && typeof data.text === "string") {
              lastEmittedTextRef.current = data.text;
              try {
                rememberEmitted(data.text);
              } catch (_) {}
              onChangeContent(data.text);
            } else if (data.type === "cursor") {
              onCursorChange?.(data.line || 1, data.col || 1);
            } else if (data.type === "doubleTap") {
              onEnterEditMode?.();
            } else if (data.type === "gestureTouchStart") {
              onPinchStart?.(data.dist || 0, data.absDx || 0);
            } else if (data.type === "gestureTouchMove") {
              onPinchMove?.(data.dist || 0, data.absDx || 0);
            } else if (data.type === "gestureTouchEnd") {
              onPinchEnd?.();
            } else if (data.type === "zoomIn") {
              onZoomIn?.(data.step || 1);
            } else if (data.type === "zoomOut") {
              onZoomOut?.(data.step || 1);
            } else if (data.type === "zoomReset") {
              onZoomReset?.();
            }
          } catch (_) {}
        },
        [
          inject,
          fontSize,
          lineHeight,
          theme.isDark,
          theme.bgPrimary,
          isEditing,
          keyboardMouseMode,
          onChangeContent,
          onCursorChange,
          onEnterEditMode,
          onPinchStart,
          onPinchMove,
          onPinchEnd,
          onZoomIn,
          onZoomOut,
          onZoomReset,
        ]
      );

      // Sync content when changed from outside (file switched, format,
      // disk reload). Typing echoes — including stale intermediate renders
      // lagging behind the latest postMessage — are NEVER injected back.
      useEffect(() => {
        const fileChanged = fileName !== currentFileNameRef.current;
        lastPropContentRef.current = content;
        currentFileNameRef.current = fileName;
        if (!isReadyRef.current) return;

        if (fileChanged) {
          try {
            clearEchoHistory();
          } catch (_) {}
          lastEmittedTextRef.current = content;
          try {
            rememberEmitted(content || "");
          } catch (_) {}
          const safeText = JSON.stringify(content || "");
          const safeName = JSON.stringify(fileName || "");
          inject(`window.__cmSetContent && window.__cmSetContent(${safeText}, ${safeName})`);
          return;
        }

        // Steady state: RN has caught up to the latest keystroke.
        if (content === lastEmittedTextRef.current) return;

        // Stale intermediate render (e.g. "a" arriving after CM already
        // emitted "ab"): skip — CM is already ahead. Crucially, do NOT
        // overwrite lastEmittedTextRef here.
        try {
          if (isStaleEcho(content || "")) return;
        } catch (_) {
          return;
        }

        // True external edit: push into CM and adopt as new baseline.
        lastEmittedTextRef.current = content;
        try {
          clearEchoHistory();
          rememberEmitted(content || "");
        } catch (_) {}
        const safeText = JSON.stringify(content || "");
        const safeName = JSON.stringify(fileName || "");
        inject(`window.__cmSetContent && window.__cmSetContent(${safeText}, ${safeName})`);
      }, [content, fileName, inject]);

      // Sync font size and line height
      useEffect(() => {
        if (!isReadyRef.current) return;
        inject(`window.__cmSetFontSize && window.__cmSetFontSize(${fontSize}, ${lineHeight})`);
      }, [fontSize, lineHeight, inject]);

      // Sync dark / light theme
      useEffect(() => {
        if (!isReadyRef.current) return;
        inject(`window.__cmSetTheme && window.__cmSetTheme(${theme.isDark !== false}, ${JSON.stringify(theme.bgPrimary || "")})`);
      }, [theme.isDark, theme.bgPrimary, inject]);

      // Sync read-only / lock mode
      useEffect(() => {
        if (!isReadyRef.current) return;
        inject(`window.__cmSetReadOnly && window.__cmSetReadOnly(${!isEditing})`);
        if (isEditing) {
          inject(`window.__cmFocus && window.__cmFocus()`);
        }
      }, [isEditing, inject]);

      // Sync keyboard & mouse mode
      useEffect(() => {
        if (!isReadyRef.current) return;
        inject(`window.__cmSetKeyboardMouseMode && window.__cmSetKeyboardMouseMode(${!!keyboardMouseMode})`);
      }, [keyboardMouseMode, inject]);

      return (
        <View style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
          <WebView
            ref={webViewRef}
            source={source}
            originWhitelist={["*"]}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            overScrollMode="never"
            androidLayerType="none"
            onMessage={handleMessage}
            style={styles.webView}
            containerStyle={{ backgroundColor: theme.bgPrimary }}
          />
        </View>
      );
    }
  )
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
  },
  webView: {
    flex: 1,
    backgroundColor: "transparent",
  },
});
