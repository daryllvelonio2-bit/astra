import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Keyboard,
  Platform,
} from "react-native";
import { terminalViewStyles as styles } from "./terminal/terminalViewStyles";
import { useTerminalSession } from "./terminal/useTerminalSession";
import { useTerminalKeyboardPad } from "./terminal/useTerminalKeyboardPad";
import { AnsiRenderer } from "./terminal/AnsiRenderer";
import { TerminalHeader } from "./terminal/TerminalHeader";
import { ExtraKeysBar, EXTRA_KEYS_BAR_HEIGHT } from "./terminal/ExtraKeysBar";
import { XtermPane } from "./terminal/XtermPane";
import { XtermViewHandle } from "./terminal/XtermView";
import { useTerminalRefit } from "./terminal/useTerminalRefit";
import { getBannerPath } from "./terminal/terminalBuffer";
import { PTY_XTERM_ENABLED } from "./terminal/ptyConfig";
import { useTerminalInput } from "./terminal/useTerminalInput";
import { useSplitTerminal, TerminalPane } from "./terminal/useSplitTerminal";
import {
  estimateTerminalGrid,
  buildViewportExport,
  sameGrid,
  TerminalGrid,
} from "./terminal/terminalGeometry";
import { useKeyboardMouseMode } from "../context/KeyboardMouseContext";
import { useTheme } from "../../theme/themeContext";
import { useOrientation } from "../../theme/useOrientation";

interface TerminalViewProps {
  workspaceId?: string;
  /**
   * Native shell id this instance owns. Defaults to "session-1" (the Terminal
   * tab). The Host tab's embedded terminal passes its own id so it cannot alias
   * the Terminal tab's PTY. See useTerminalSession.
   */
  initialSessionId?: string;
  /** Hidden tab: pause xterm bridge flush until visible. Sessions keep running. */
  visible?: boolean;
}

export function TerminalView({ workspaceId, initialSessionId, visible = true }: TerminalViewProps) {
  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    activeOutput,
    fontSize,
    theme,
    isReady,
    zoomIn,
    zoomOut,
    copyActiveOutput,
    copyXtermSelection,
    pasteFromClipboard,
    sendInput,
    runCommandDirectly,
    clearActiveSession,
    addNewSession,
    closeSession,
    restartActiveSession,
    toastMessage,
    scrollRef,
    navigateHistory,
    isCtrlActive,
    isAltActive,
    setIsCtrlActive,
    setIsAltActive,
  } = useTerminalSession({
    workspaceId,
    initialSessionId,
  });
  const isTaskTab = !!sessions.find((s) => s.id === activeSessionId)?.isTask;
  const isXterm = PTY_XTERM_ENABLED && !isTaskTab;
  const { theme: appTheme } = useTheme();
  const { width: windowWidth, height: windowHeight, isLandscape } = useOrientation();
  const xtermRef = useRef<XtermViewHandle>(null);
  const xtermRefSecondary = useRef<XtermViewHandle>(null);

  const {
    isSplit,
    splitSessionId,
    setSplitSessionId,
    focusedPane,
    setFocusedPane,
    toggleSplit,
    closeSplit,
  } = useSplitTerminal({
    sessions,
    activeSessionId,
    onAddSession: addNewSession,
  });

  const currentTargetSessionId =
    isSplit && focusedPane === "secondary" && splitSessionId
      ? splitSessionId
      : activeSessionId;

  const sendInputToTarget = useCallback(
    (inputData: string) => {
      sendInput(inputData, currentTargetSessionId);
    },
    [sendInput, currentTargetSessionId]
  );

  const runCommandToTarget = useCallback(
    (cmd: string) => {
      runCommandDirectly(cmd, currentTargetSessionId);
    },
    [runCommandDirectly, currentTargetSessionId]
  );

  const { keyboardMouseMode } = useKeyboardMouseMode();

  const {
    isKeyboardVisible,
    visibleRows,
    keyboardPad,
    closedContainerHeight,
    onContainerLayout,
  } = useTerminalKeyboardPad(visible);
  const viewportSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const sentGridRef = useRef<Record<string, TerminalGrid>>({});

  const {
    currentInput,
    isFocused,
    setIsFocused,
    inputRef,
    handleFocusTerminal,
    handleDoubleTap,
    handleDirectInput,
    handleKeyPress,
    sendEnter,
    handleExtraPrintable,
    handleExtraRaw,
    handleExtraEnter,
    clearInput,
  } = useTerminalInput({
    isXterm,
    sendInput: sendInputToTarget,
    runCommandDirectly: runCommandToTarget,
    navigateHistory,
    isCtrlActive,
    isAltActive,
    setIsCtrlActive,
    setIsAltActive,
    activeSessionId: currentTargetSessionId,
    keyboardMouseMode,
  });

  // Stable handlers for the memoized XtermView panes. Inline arrows here
  // would be recreated on every TerminalView render and defeat its memo.
  const handleRequestKeyboardPrimary = useCallback(() => {
    if (isSplit) {
      setFocusedPane("primary");
      xtermRef.current?.focusTerminal();
    }
    handleFocusTerminal();
  }, [isSplit, setFocusedPane, handleFocusTerminal]);

  const handleRequestKeyboardSecondary = useCallback(() => {
    setFocusedPane("secondary");
    xtermRefSecondary.current?.focusTerminal();
    handleFocusTerminal();
  }, [setFocusedPane, handleFocusTerminal]);

  // Split focus routing. A tap on the terminal area switches the input target
  // and the WebView focus but deliberately does NOT raise the IME — that keeps
  // drag/scroll gestures working. Raising the keyboard is the existing
  // double-tap (or a pane-header tap) affordance.
  const focusPane = useCallback(
    (pane: TerminalPane) => {
      setFocusedPane(pane);
      (pane === "secondary" ? xtermRefSecondary : xtermRef).current?.focusTerminal();
    },
    [setFocusedPane]
  );
  const handleActivatePrimary = useCallback(() => focusPane("primary"), [focusPane]);
  const handleActivateSecondary = useCallback(() => focusPane("secondary"), [focusPane]);

  const secondaryTab = isSplit && splitSessionId
    ? sessions.find((s) => s.id === splitSessionId)
    : undefined;
  const primaryTabName = sessions.find((s) => s.id === activeSessionId)?.name || "1: sh";
  const secondaryTabName = secondaryTab?.name || "2: sh";

  // Keyboard inset applied once to the whole pane region (see render): the
  // pane area shrinks above the IME/bars so every pane — single or split,
  // upper or lower — stays on screen with its caret line visible. On Android
  // with edge-to-edge (gradle edgeToEdgeEnabled) the window does NOT resize
  // for the IME, so this explicit inset is what actually lifts the content.
  const paneAreaInset = isKeyboardVisible ? keyboardPad + EXTRA_KEYS_BAR_HEIGHT : 0;

  // Re-glue xterm to the box whenever the resolved geometry changes: keyboard
  // inset applied/removed, split created/destroyed, rotation, font zoom.
  const { scheduleRefit, onBoxLayout } = useTerminalRefit(xtermRef, xtermRefSecondary);
  useEffect(() => {
    scheduleRefit(120);
  }, [isKeyboardVisible, keyboardPad, isSplit, isLandscape, fontSize, scheduleRefit]);

  // Publish COLUMNS/LINES once the native session is ready and whenever the
  // viewport grid changes (rotation, font zoom). Skipped in PTY mode: the
  // kernel window size (TIOCSWINSZ from xterm's fit) is authoritative there.
  useEffect(() => {
    if (!isReady || isTaskTab || isXterm) return;
    const { w, h } = viewportSizeRef.current;
    if (w <= 0 || h <= 0) return;
    const grid = estimateTerminalGrid(w, h, fontSize);
    if (sameGrid(sentGridRef.current[activeSessionId] || null, grid)) return;
    sentGridRef.current[activeSessionId] = grid;
    const timer = setTimeout(() => {
      sendInput(buildViewportExport(grid));
    }, 350);
    return () => clearTimeout(timer);
  }, [isReady, isTaskTab, isXterm, windowWidth, windowHeight, fontSize, activeSessionId, sendInput]);

  // Stray CTRL/ALT taps must not poison later typing (e.g. armed CTRL + "s"
  // = XOFF freeze). Disarm after a few idle seconds.
  useEffect(() => {
    if (!isCtrlActive && !isAltActive) return;
    const t = setTimeout(() => {
      setIsCtrlActive(false);
      setIsAltActive(false);
    }, 6000);
    return () => clearTimeout(t);
  }, [isCtrlActive, isAltActive, setIsCtrlActive, setIsAltActive]);

  // Focus re-assertion on tab return and blur on tab leave.
  // Serialized handoff: the editor dismisses the IME on hide in the same
  // commit, so focusing immediately races the dismiss — the IME stays open
  // without a fresh show/resize transition and the shortcut strip stays
  // buried. Refocus only when the keyboard was up before leaving, delayed
  // past the dismiss so the show + window-shrink transition refires.
  const wasKeyboardVisibleRef = useRef(false);
  useEffect(() => {
    if (!visible) {
      wasKeyboardVisibleRef.current = isKeyboardVisible;
      inputRef.current?.blur();
      setIsFocused(false);
      return;
    }
    if (keyboardMouseMode || !wasKeyboardVisibleRef.current) return;
    wasKeyboardVisibleRef.current = false;
    let rafId: number | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    rafId = requestAnimationFrame(() => {
      timerId = setTimeout(() => {
        handleFocusTerminal();
      }, 200);
    });

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (timerId !== null) clearTimeout(timerId);
    };
  }, [visible, keyboardMouseMode, isKeyboardVisible, handleFocusTerminal, inputRef, setIsFocused]);

  const handleToggleSplit = useCallback(() => {
    Keyboard.dismiss();
    inputRef.current?.blur();
    setIsFocused(false);
    toggleSplit();
  }, [toggleSplit, inputRef, setIsFocused]);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: appTheme.bgPrimary },
      ]}
      onLayout={onContainerLayout}
    >
      {/* Terminal Header Bar */}
      <TerminalHeader
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onAddSession={addNewSession}
        onCloseSession={closeSession}
        onRestartSession={restartActiveSession}
        onClearSession={() => {
          clearInput();
          if (isXterm) {
            // ^U (kill-line) first: discards any half-typed garbage on the
            // current line at the kernel/readline level without killing
            // running processes, so `clear` always runs on a fresh line.
            sendInputToTarget("\x15clear\r");
            return;
          }
          clearActiveSession();
        }}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onCopyOutput={
          isXterm
            ? () => {
                const targetRef = isSplit && focusedPane === "secondary" ? xtermRefSecondary : xtermRef;
                copyXtermSelection(() =>
                  targetRef.current?.requestSelection().then((t) => t || "") ||
                  Promise.resolve("")
                );
              }
            : copyActiveOutput
        }
        onPasteClipboard={pasteFromClipboard}
        isSplit={isSplit}
        onToggleSplit={handleToggleSplit}
        splitSessionId={splitSessionId}
        focusedPane={focusedPane}
        onSelectSplitSession={setSplitSessionId}
        onFocusPane={setFocusedPane}
      />

      {/* Terminal viewport host: the keyboard inset is applied ONCE here so the
          whole pane region shrinks above the IME and both panes of a split stay
          fully on screen — the lower pane's caret line included. */}
      <View
        style={[
          styles.viewportHost,
          paneAreaInset > 0 ? { paddingBottom: paneAreaInset } : undefined,
        ]}
        onLayout={(e) => onBoxLayout(e.nativeEvent.layout.height)}
      >
        {isXterm ? (
          <View
            style={
              isSplit && splitSessionId
                ? [styles.splitWrapper, isLandscape ? styles.splitRow : styles.splitCol]
                : styles.viewport
            }
          >
            {/* Primary Pane: mount-stable across split/unsplit so a full-screen
                TUI keeps its state; its keyed children preserve the WebView. */}
            <XtermPane
              ref={xtermRef}
              sessionId={activeSessionId}
              fontSize={fontSize}
              theme={theme}
              background={theme.background}
              foreground={theme.foreground}
              cursor={theme.cursor}
              banner={getBannerPath(workspaceId)}
              onRequestKeyboard={handleRequestKeyboardPrimary}
              onActivate={handleActivatePrimary}
              visible={visible}
              isSplit={!!(isSplit && splitSessionId)}
              active={focusedPane === "primary"}
              paneLabel={primaryTabName}
              isTask={isTaskTab}
              side="start"
              orientation={isLandscape ? "row" : "column"}
              isKeyboardVisible={isSplit ? focusedPane === "primary" && isKeyboardVisible : isKeyboardVisible}
              visibleRows={isSplit ? (focusedPane === "primary" ? visibleRows : 0) : visibleRows}
            />

            {/* Divider & Secondary Pane (only present when split is active) */}
            {isSplit && splitSessionId && (
              <>
                <View
                  pointerEvents="none"
                  style={[
                    isLandscape ? styles.dividerVertical : styles.dividerHorizontal,
                    { backgroundColor: appTheme.border },
                  ]}
                />
                <XtermPane
                  ref={xtermRefSecondary}
                  sessionId={splitSessionId}
                  fontSize={fontSize}
                  theme={theme}
                  background={theme.background}
                  foreground={theme.foreground}
                  cursor={theme.cursor}
                  banner={getBannerPath(workspaceId)}
                  onRequestKeyboard={handleRequestKeyboardSecondary}
                  onActivate={handleActivateSecondary}
                  visible={visible}
                  isSplit
                  active={focusedPane === "secondary"}
                  paneLabel={secondaryTabName}
                  isTask={!!secondaryTab?.isTask}
                  side="end"
                  orientation={isLandscape ? "row" : "column"}
                  isKeyboardVisible={focusedPane === "secondary" && isKeyboardVisible}
                  visibleRows={focusedPane === "secondary" ? visibleRows : 0}
                />
              </>
            )}
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={[styles.viewport, { backgroundColor: theme.background }]}
            contentContainerStyle={styles.viewportContent}
            keyboardShouldPersistTaps="handled"
            onLayout={(e) => {
              viewportSizeRef.current = {
                w: e.nativeEvent.layout.width,
                h: e.nativeEvent.layout.height,
              };
            }}
          >
            <Pressable onPress={handleDoubleTap} style={styles.viewportInner}>
              <AnsiRenderer
                rawText={activeOutput + currentInput}
                isFocused={isFocused}
                fontSize={fontSize}
                theme={theme}
              />
            </Pressable>
          </ScrollView>
        )}
      </View>

      {/* Termux-style extra keys row (hidden for read-only task tabs or in keyboard & mouse mode) */}
      {!keyboardMouseMode && (
        <View
          style={
            isKeyboardVisible
              ? [styles.floatingBar, { bottom: keyboardPad }]
              : undefined
          }
        >
          <ExtraKeysBar
            ctrlActive={isCtrlActive}
            altActive={isAltActive}
            onToggleCtrl={() => setIsCtrlActive((v) => !v)}
            onToggleAlt={() => setIsAltActive((v) => !v)}
            onPrintable={handleExtraPrintable}
            onRaw={handleExtraRaw}
            onEnter={handleExtraEnter}
            disabled={isTaskTab}
          />
        </View>
      )}

      {/* Toast Feedback Notification */}
      {toastMessage && (
        <View
          style={[
            styles.toastContainer,
            { backgroundColor: appTheme.bgElevated, borderColor: appTheme.border },
          ]}
        >
          <Text style={[styles.toastText, { color: appTheme.textPrimary }]}>
            {toastMessage}
          </Text>
        </View>
      )}

      {/* Invisible Direct Terminal Input Catcher */}
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        defaultValue=" "
        showSoftInputOnFocus={!keyboardMouseMode}
        inputMode={keyboardMouseMode ? "none" : undefined}
        onChangeText={handleDirectInput}
        onKeyPress={handleKeyPress}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        keyboardType="visible-password"
        spellCheck={false}
        multiline={false}
        blurOnSubmit={false}
        disableFullscreenUI={true}
        caretHidden={true}
        importantForAutofill="no"
        returnKeyType={keyboardMouseMode ? "none" : "send"}
        onSubmitEditing={sendEnter}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
    </View>
  );
}
