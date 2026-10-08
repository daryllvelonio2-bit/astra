import React, { memo } from "react";
import { View, Text, Pressable, StyleSheet, ViewStyle } from "react-native";
import { useTheme } from "../../../theme/themeContext";

interface TerminalPaneHeaderProps {
  /** Session name shown in the strip (falls back to a generic label). */
  label: string;
  /** Task session: green status dot instead of the accent dot. */
  isTask?: boolean;
  /** Focused pane: accent text + accent edge indicator. */
  active: boolean;
  /** Which edge of the pane to pin the active indicator to. */
  side: "start" | "end";
  /** Split direction: stacked (column) pins a vertical bar, row a horizontal one. */
  orientation: "column" | "row";
  /** Tap the strip to focus this pane and raise the keyboard. */
  onPress: () => void;
}

/**
 * Slim per-pane header shown in split mode. It lives IN FLOW above the
 * terminal WebView, so by construction it cannot overlap or swallow taps
 * meant for the terminal — only this strip is tappable. Makes the active
 * pane obvious and gives a direct focus target. All colors from useTheme().
 */
export const TerminalPaneHeader = memo(function TerminalPaneHeader({
  label,
  isTask,
  active,
  side,
  orientation,
  onPress,
}: TerminalPaneHeaderProps) {
  const { theme } = useTheme();
  const edge = side === "start";
  const indicatorStyle: ViewStyle =
    orientation === "column"
      ? { top: 0, bottom: 0, width: 3, ...(edge ? { left: 0 } : { right: 0 }) }
      : { left: 0, right: 0, height: 3, ...(edge ? { top: 0 } : { bottom: 0 }) };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.header,
        {
          backgroundColor: active ? theme.bgTertiary : theme.bgSecondary,
          borderBottomColor: theme.border,
        },
      ]}
    >
      {active && (
        <View
          pointerEvents="none"
          style={[styles.indicator, indicatorStyle, { backgroundColor: theme.accent }]}
        />
      )}
      <View
        pointerEvents="none"
        style={[styles.dot, { backgroundColor: isTask ? theme.accentGreen : theme.accent }]}
      />
      <Text
        pointerEvents="none"
        numberOfLines={1}
        style={[styles.label, { color: active ? theme.accent : theme.textMuted }]}
      >
        {label}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  header: {
    height: 20,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  indicator: {
    position: "absolute",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 10,
    fontFamily: "monospace",
    fontWeight: "700",
    flexShrink: 1,
  },
});
