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
import { StyleSheet, View, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { buildCodeMirrorHtml } from "./codemirrorHtml.generated";
import { buildCmThemeObj } from "./codemirrorThemeObj";
import { createEchoGate, EchoGate } from "./echoGate";

// Module-level cache: avoids replaceAll over the 500+ KB blob on every mount.
// Key = bgPrimary + "|" + isDark.  The blob string itself is already cached
// inside codemirrorHtml.generated (cachedBlob), so we only cache the result
// of the two .replaceAll() calls on top of it.
const _htmlCache = new Map<string, string>();

export interface CodeMirrorEditorHandle {
  jumpToLine: (line: number) => void;
  undo: () => void;
  redo: () => void;
  focus: () => void;
  blur: () => void;
  openFind: () => void;
  closeFind: () => void;
  /** Select the cursor's current line (new). */
  selectLine: () => void;
  /** Select the entire document (new). */
  selectAll: () => void;
  /** Copy the current selection (cursor's line when empty) to the system clipboard. */
  copy: () => void;
  /** Cut the current selection (cursor's line when empty) to the system clipboard. */
  cut: () => void;
  /** Paste the system clipboard at the caret (replaces selection). */
  paste: () => void;
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
  /** Jump-to-line request; applied once the WebView is ready (file switch safe). */
  jumpSignal?: { line: number; nonce: number } | null;
  onJumpConsumed?: () => void;
  isSidebarOpen?: boolean;
  onPullStart?: () => void;
  onPullMove?: (dx: number) => void;
  onPullEnd?: (vx: number) => void;
}

// Phase 1 anti-echo: CodeMirror is source-of-truth while typing. React
// renders lag behind WebView postMessage bursts ("a" -> "ab"), so an
// intermediate render must never be injected back (it would clobber newer
// keystrokes and reset the cursor). Only file switches and true external
// edits (format / disk reload) may push content into the WebView.
// (Gate implementation lives in echoGate.ts.)

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
        jumpSignal,
        onJumpConsumed,
        isSidebarOpen,
        onPullStart,
        onPullMove,
        onPullEnd,
      },
      ref
    ) {
      const webViewRef = useRef<WebView>(null);
      const isReadyRef = useRef(false);
      const [isReady, setIsReady] = useState(false);
      const lastEmittedTextRef = useRef(content);
      const lastPropContentRef = useRef(content);
      const currentFileNameRef = useRef(fileName);
      // Anti-echo gate (see echoGate.ts).
      const echo = useRef<EchoGate>(createEchoGate());

      const html = useRef((() => {
        const bg = theme.bgPrimary || "#1e1e1e";
        const dark = theme.isDark !== false;
        const cacheKey = bg + "|" + dark;
        let cached = _htmlCache.get(cacheKey);
        if (!cached) {
          cached = buildCodeMirrorHtml({ background: bg, isDark: dark });
          _htmlCache.set(cacheKey, cached);
        }
        return cached;
      })()).current;
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
            // Engine exposes no direct undo command (verified: bundle exposes
            // no __cmUndo). Route via the editor's own keymap instead: a
            // synthetic Ctrl+Z keydown on .cm-content runs historyKeymap.undo
            // and the doc change posts back through the normal change channel.
            // Modifiers MUST be in the KeyboardEventInit dict (ctrlKey is a
            // readonly IDL prop after construction).
            inject(
              `try{var c=document.querySelector('.cm-content');if(c){var e=new KeyboardEvent('keydown',{key:'z',code:'KeyZ',keyCode:90,which:90,cancelable:true,bubbles:true,ctrlKey:true,altKey:false,metaKey:false,shiftKey:false});c.dispatchEvent(e);}}catch(_){}`
            );
          },
          redo: () => {
            // Android keymap: historyKeymap redo binds Ctrl-Shift-z on Linux.
            inject(
              `try{var c=document.querySelector('.cm-content');if(c){var e=new KeyboardEvent('keydown',{key:'z',code:'KeyZ',keyCode:90,which:90,cancelable:true,bubbles:true,ctrlKey:true,altKey:false,metaKey:false,shiftKey:true});c.dispatchEvent(e);}}catch(_){}`
            );
          },
          focus: () => {
            inject(`window.__cmFocus && window.__cmFocus()`);
          },
          openFind: () => {
            inject(`window.__cmOpenFind && window.__cmOpenFind()`);
          },
          closeFind: () => {
            inject(`window.__cmCloseFind && window.__cmCloseFind()`);
          },
          selectLine: () => {
            // Engine exposes no editor instance (it stays in the entry
            // closure); reach the live view through the DOM instead —
            // @codemirror/view tiles (.cm-content) carry cmTile -> root.view.
            inject(
              `try{var c=document.querySelector('.cm-content');var t=c&&c.cmTile;var v=t&&t.root&&t.root.view;if(v){var s=v.state.selection.main,l=v.state.doc.lineAt(s.head);v.dispatch({selection:{anchor:l.from,head:l.to},scrollIntoView:true});}}catch(_){}`
            );
          },
          selectAll: () => {
            // Selection commands need the view; the tile route reaches it for
            // the CURRENT editor instance (each WebView hosts exactly one).
            inject(
              `try{var c=document.querySelector('.cm-content');var t=c&&c.cmTile;var v=t&&t.root&&t.root.view;if(v){v.dispatch({selection:{anchor:0,head:v.state.doc.length},scrollIntoView:true});}}catch(_){}`
            );
          },
          // Clipboard: the engine exposes __cmCopy/__cmCut/__cmPaste
          // (codemirror-clipboard.js). Copy/cut of an empty selection fall
          // back to the cursor's line inside the bridge; paste is async
          // (navigator.clipboard.readText, synthetic Ctrl+V fallback).
          copy: () => {
            inject(`window.__cmCopy && window.__cmCopy()`);
          },
          cut: () => {
            inject(`window.__cmCut && window.__cmCut()`);
          },
          paste: () => {
            inject(`window.__cmPaste && window.__cmPaste()`);
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
              inject(`window.__cmSetTheme && window.__cmSetTheme(${buildCmThemeObj(theme)})`);
              inject(`window.__cmSetKeyboardMouseMode && window.__cmSetKeyboardMouseMode(${!!keyboardMouseMode})`);
              inject(`window.__cmSetReadOnly && window.__cmSetReadOnly(${!isEditing})`);
              inject(`window.__cmSetSidebarPullEnabled && window.__cmSetSidebarPullEnabled(${!isSidebarOpen && !isEditing})`);
            } else if (data.type === "change") {
              // Incremental patch (normal typing) or full text (paste /
              // multi-cursor). The patch is applied to the last text we know
              // CodeMirror holds, so RN's baseline converges to the exact
              // WebView document without transferring it whole every keystroke.
              let text: string | null = null;
              if (typeof data.text === "string") {
                text = data.text;
              } else if (
                data.patch &&
                typeof data.patch.from === "number" &&
                typeof data.patch.to === "number"
              ) {
                const base = lastEmittedTextRef.current || "";
                text =
                  base.slice(0, data.patch.from) +
                  (typeof data.patch.insert === "string" ? data.patch.insert : "") +
                  base.slice(data.patch.to);
              }
              if (text !== null) {
                lastEmittedTextRef.current = text;
                try {
                  echo.current.rememberEmitted(text);
                } catch (_) {}
                onChangeContent(text);
              }
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
            } else if (data.type === "editorPullStart") {
              onPullStart?.();
            } else if (data.type === "editorPullMove") {
              onPullMove?.(data.dx || 0);
            } else if (data.type === "editorPullEnd") {
              onPullEnd?.(data.vx || 0);
            }
          } catch (_) {}
        },
        [
          inject,
          fontSize,
          lineHeight,
          theme.isDark,
          theme.bgPrimary,
          theme.bgSecondary,
          theme.textPrimary,
          theme.textMuted,
          theme.accent,
          theme.accentCyan,
          theme.accentPurple,
          theme.accentGold,
          theme.accentGreen,
          theme.accentRed,
          theme.tokenColors,
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
          onPullStart,
          onPullMove,
          onPullEnd,
        ]
      );

      // Sync sidebar pull enabled state
      useEffect(() => {
        if (!isReady) return;
        inject(
          `window.__cmSetSidebarPullEnabled && window.__cmSetSidebarPullEnabled(${!isSidebarOpen && !isEditing})`
        );
      }, [inject, isReady, isSidebarOpen, isEditing]);

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
            echo.current.clear();
          } catch (_) {}
          lastEmittedTextRef.current = content;
          try {
            echo.current.rememberEmitted(content || "");
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
          if (echo.current.isStaleEcho(content || "")) return;
        } catch (_) {
          return;
        }

        // True external edit: push into CM and adopt as new baseline.
        lastEmittedTextRef.current = content;
        try {
          echo.current.clear();
          echo.current.rememberEmitted(content || "");
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
        inject(`window.__cmSetTheme && window.__cmSetTheme(${buildCmThemeObj(theme)})`);
      }, [
        theme.isDark,
        theme.bgPrimary,
        theme.bgSecondary,
        theme.textPrimary,
        theme.textMuted,
        theme.accent,
        theme.accentCyan,
        theme.accentPurple,
        theme.accentGold,
        theme.accentGreen,
        theme.accentRed,
        theme.tokenColors,
        inject,
      ]);

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

      // Search-result jump-to-line. Declared AFTER the content-sync effect so
      // in a shared commit the content injection queues before the jump;
      // ready-gating covers the WebView still booting when the tap lands.
      const appliedJumpNonceRef = useRef(0);
      useEffect(() => {
        if (!jumpSignal || !isReadyRef.current) return;
        if (appliedJumpNonceRef.current === jumpSignal.nonce) return;
        appliedJumpNonceRef.current = jumpSignal.nonce;
        const line = Math.max(1, Math.floor(jumpSignal.line) || 1);
        inject(`window.__cmJumpToLine && window.__cmJumpToLine(${line})`);
        onJumpConsumed?.();
      }, [jumpSignal, isReady, inject, onJumpConsumed]);

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
          {/* Boot cover: Chromium surfaces a blank panel while the CM blob
              parses/evals. The editor's chrome above/below renders instantly;
              this keeps the center from reading as dead until 'ready'. */}
          {!isReady && (
            <View style={[styles.bootCover, { backgroundColor: theme.bgPrimary }]} pointerEvents="none">
              <ActivityIndicator size="small" color={theme.accent} />
            </View>
          )}
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
  bootCover: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
