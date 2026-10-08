import React, { forwardRef, memo, useCallback, useImperativeHandle, useRef } from "react";
import { View } from "react-native";
import { TerminalPaneHeader } from "./TerminalPaneHeader";
import { XtermView, XtermViewHandle } from "./XtermView";
import { TerminalTheme } from "./terminalThemes";
import { terminalViewStyles as styles } from "./terminalViewStyles";
import { useTheme } from "../../../theme/themeContext";

interface XtermPaneProps {
  sessionId: string;
  fontSize: number;
  theme?: TerminalTheme;
  background?: string;
  foreground?: string;
  cursor?: string;
  banner?: string;
  visible?: boolean;
  isKeyboardVisible: boolean;
  visibleRows: number;
  /** Split layout: draw the pane frame + header and honour `active`. */
  isSplit: boolean;
  active: boolean;
  paneLabel: string;
  isTask?: boolean;
  side: "start" | "end";
  orientation: "column" | "row";
  /** Double-tap / header tap: raise the IME and take focus. */
  onRequestKeyboard: () => void;
  /** Terminal-area tap: switch focus WITHOUT raising the IME (scroll-safe). */
  onActivate: () => void;
}

/**
 * One terminal pane: optional split frame + slim header, then the xterm
 * WebView. In single mode it is just the bare viewport. The header lives in
 * flow above the WebView, so it cannot overlap or swallow terminal taps; the
 * terminal area only switches focus on tap and never eats the gesture.
 *
 * Memoized and mount-stable: this element keeps its identity across
 * split/unsplit (its keyed children preserve the WebView), so a full-screen
 * TUI in the primary pane is not reset when a split is toggled.
 */
export const XtermPane = memo(
  forwardRef<XtermViewHandle, XtermPaneProps>(function XtermPane(
    {
      sessionId,
      fontSize,
      theme,
      background,
      foreground,
      cursor,
      banner,
      visible,
      isKeyboardVisible,
      visibleRows,
      isSplit,
      active,
      paneLabel,
      isTask,
      side,
      orientation,
      onRequestKeyboard,
      onActivate,
    },
    ref
  ) {
    const { theme: appTheme } = useTheme();
    const innerRef = useRef<XtermViewHandle>(null);

    useImperativeHandle(
      ref,
      () => ({
        focusTerminal: () => innerRef.current?.focusTerminal(),
        requestSelection: () => innerRef.current?.requestSelection() ?? Promise.resolve(""),
        writeText: (text: string) => innerRef.current?.writeText(text),
        refit: () => innerRef.current?.refit(),
      }),
      []
    );

    // Only the framed (split) pane switches focus on a bare area tap; in
    // single mode there is nothing to switch. Returning false lets the touch
    // reach the WebView (tap/drag/scroll) unchanged.
    const handleCapture = useCallback(() => {
      if (isSplit && !active) onActivate();
      return false;
    }, [isSplit, active, onActivate]);

    const containerStyle = isSplit
      ? [
          styles.paneContainer,
          {
            borderColor: active ? appTheme.accent : appTheme.border,
            borderWidth: 1,
          },
        ]
      : styles.viewport;

    return (
      <View style={containerStyle} onStartShouldSetResponderCapture={handleCapture}>
        {isSplit && (
          <TerminalPaneHeader
            key="pane-header"
            label={paneLabel}
            isTask={isTask}
            active={active}
            side={side}
            orientation={orientation}
            onPress={onRequestKeyboard}
          />
        )}
        <View key="pane-viewport" style={styles.paneViewport}>
          <XtermView
            ref={innerRef}
            sessionId={sessionId}
            fontSize={fontSize}
            theme={theme}
            background={background}
            foreground={foreground}
            cursor={cursor}
            banner={banner}
            onRequestKeyboard={onRequestKeyboard}
            visible={visible}
            isKeyboardVisible={isKeyboardVisible}
            visibleRows={visibleRows}
          />
        </View>
      </View>
    );
  })
);
