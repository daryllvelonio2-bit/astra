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
import { XtermView, XtermViewHandle } from "./terminal/XtermView";
import { getBannerTitle } from "./terminal/terminalBuffer";
import { PTY_XTERM_ENABLED } from "./terminal/ptyConfig";
import { useTerminalInput } from "./terminal/useTerminalInput";
import { useSplitTerminal } from "./terminal/useSplitTerminal";
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
  /** Hidden tab: pause xterm bridge flush until visible. Sessions keep running. */
  visible?: boolean;
}

export function TerminalView({ workspaceId, visible = true }: TerminalViewProps) {
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
            sendInputToTarget("clear\n");
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
        onToggleSplit={toggleSplit}
        splitSessionId={splitSessionId}
        focusedPane={focusedPane}
        onSelectSplitSession={setSplitSessionId}
        onFocusPane={setFocusedPane}
      />

      {/* Terminal Viewport: Split mode (2 panes) or Single mode */}
      {isSplit && splitSessionId ? (
        <View
          style={[
            styles.splitWrapper,
            isLandscape ? styles.splitRow : styles.splitCol,
            !isLandscape && closedContainerHeight > 0
              ? { height: closedContainerHeight - EXTRA_KEYS_BAR_HEIGHT, flex: 0 }
              : undefined,
          ]}
        >
          {/* Primary Pane */}
          <View
            style={[
              styles.paneContainer,
              {
                borderColor: focusedPane === "primary" ? appTheme.accent : appTheme.border,
                borderWidth: 1,
              },
              isLandscape ? { width: 0 } : { height: 0 },
            ]}
            onStartShouldSetResponderCapture={() => {
              if (focusedPane !== "primary") {
                setFocusedPane("primary");
                xtermRef.current?.focusTerminal();
              }
              handleFocusTerminal();
              return false;
            }}
          >
            <View
              style={[
                styles.paneViewport,
                isLandscape && isKeyboardVisible
                  ? { paddingBottom: keyboardPad + EXTRA_KEYS_BAR_HEIGHT }
                  : undefined,
              ]}
            >
              <XtermView
                ref={xtermRef}
                sessionId={activeSessionId}
                fontSize={fontSize}
                theme={theme}
                background={theme.background}
                foreground={theme.foreground}
                cursor={theme.cursor}
                banner={getBannerTitle(workspaceId, theme.id !== "light")}
                onRequestKeyboard={() => {
                  setFocusedPane("primary");
                  xtermRef.current?.focusTerminal();
                  handleFocusTerminal();
                }}
                visible={visible}
                isKeyboardVisible={focusedPane === "primary" && isKeyboardVisible}
                visibleRows={focusedPane === "primary" ? visibleRows : 0}
              />
            </View>
          </View>

          {/* Divider */}
          <View
            style={[
              isLandscape ? styles.dividerVertical : styles.dividerHorizontal,
              { backgroundColor: appTheme.border },
            ]}
          />

          {/* Secondary Pane */}
          <View
            style={[
              styles.paneContainer,
              {
                borderColor: focusedPane === "secondary" ? appTheme.accent : appTheme.border,
                borderWidth: 1,
              },
              isLandscape ? { width: 0 } : { height: 0 },
            ]}
            onStartShouldSetResponderCapture={() => {
              if (focusedPane !== "secondary") {
                setFocusedPane("secondary");
                xtermRefSecondary.current?.focusTerminal();
              }
              handleFocusTerminal();
              return false;
            }}
          >
            <View
              style={[
                styles.paneViewport,
                isLandscape && isKeyboardVisible
                  ? { paddingBottom: keyboardPad + EXTRA_KEYS_BAR_HEIGHT }
                  : (!isLandscape && focusedPane === "secondary" && isKeyboardVisible
                      ? { paddingBottom: keyboardPad }
                      : undefined),
              ]}
            >
              <XtermView
                ref={xtermRefSecondary}
                sessionId={splitSessionId}
                fontSize={fontSize}
                theme={theme}
                background={theme.background}
                foreground={theme.foreground}
                cursor={theme.cursor}
                banner={getBannerTitle(workspaceId, theme.id !== "light")}
                onRequestKeyboard={() => {
                  setFocusedPane("secondary");
                  xtermRefSecondary.current?.focusTerminal();
                  handleFocusTerminal();
                }}
                visible={visible}
                isKeyboardVisible={focusedPane === "secondary" && isKeyboardVisible}
                visibleRows={focusedPane === "secondary" ? visibleRows : 0}
              />
            </View>
          </View>
        </View>
      ) : isXterm ? (
        <View
          style={[
            styles.viewport,
            isKeyboardVisible
              ? { paddingBottom: keyboardPad + EXTRA_KEYS_BAR_HEIGHT }
              : undefined,
          ]}
        >
          <XtermView
            ref={xtermRef}
            sessionId={activeSessionId}
            fontSize={fontSize}
            theme={theme}
            background={theme.background}
            foreground={theme.foreground}
            cursor={theme.cursor}
            banner={getBannerTitle(workspaceId, theme.id !== "light")}
            onRequestKeyboard={handleFocusTerminal}
            visible={visible}
            isKeyboardVisible={isKeyboardVisible}
            visibleRows={visibleRows}
          />
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
