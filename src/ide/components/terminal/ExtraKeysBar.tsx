import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, Vibration } from "react-native";
import { useTheme } from "../../../theme/themeContext";

interface ExtraKeysBarProps {
  ctrlActive: boolean;
  altActive: boolean;
  onToggleCtrl: () => void;
  onToggleAlt: () => void;
  /** Printable char: caller appends to the local echo buffer. */
  onPrintable: (ch: string) => void;
  /** Raw bytes straight to the shell (esc sequences, tab, ctrl combos). */
  onRaw: (data: string) => void;
  /** Submit the current line (same as Enter). */
  onEnter: () => void;
  disabled?: boolean;
}

/** Outer height of the shortcut strip (in-flow slot + floating spacer). */
export const EXTRA_KEYS_BAR_HEIGHT = 44;

interface KeyDef {
  label: string;
  a11y: string;
  run: () => void;
  active?: boolean;
  repeat?: boolean;
}

const SYMBOL_KEYS = [
  "|", "~", "/", "\\", "-", "_", ":", ";", '"', "'",
  "`", "$", "(", ")", "{", "}", "[", "]", "<",
  ">", "+", "=", "*", "?", "!", "&", "^", "%",
  "#", ".", ",",
];

function buzz() {
  try {
    if (Platform.OS === "android") Vibration.vibrate(10);
  } catch {
    // Haptics are best-effort; never break key input.
  }
}

export function ExtraKeysBar({
  ctrlActive,
  altActive,
  onToggleCtrl,
  onToggleAlt,
  onPrintable,
  onRaw,
  onEnter,
  disabled,
}: ExtraKeysBarProps) {
  const { theme: appTheme } = useTheme();
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRepeat = () => {
    if (repeatRef.current) {
      clearInterval(repeatRef.current);
      repeatRef.current = null;
    }
  };

  useEffect(() => {
    return stopRepeat;
  }, []);

  const fire = (fn: () => void, repeat?: boolean) => {
    if (disabled) return;
    buzz();
    fn();
    if (repeat) {
      stopRepeat();
      repeatRef.current = setInterval(fn, 70);
    }
  };

  // Zone 1 (pinned): control keys that must never scroll out of reach.
  const pinnedKeys: KeyDef[] = [
    { label: "ESC", a11y: "Escape", run: () => onRaw("\x1b") },
    { label: "TAB", a11y: "Tab", run: () => onRaw("\t") },
    { label: "CTRL", a11y: "Toggle control", run: onToggleCtrl, active: ctrlActive },
    { label: "ALT", a11y: "Toggle alt", run: onToggleAlt, active: altActive },
    { label: "←", a11y: "Arrow left", run: () => onRaw("\x1b[D"), repeat: true },
    { label: "↑", a11y: "Arrow up", run: () => onRaw("\x1b[A"), repeat: true },
    { label: "↓", a11y: "Arrow down", run: () => onRaw("\x1b[B"), repeat: true },
    { label: "→", a11y: "Arrow right", run: () => onRaw("\x1b[C"), repeat: true },
    { label: "⏎", a11y: "Enter", run: onEnter },
  ];

  // Zone 2 (scrollable): symbol keys for code-heavy typing.
  const symbolKeys: KeyDef[] = SYMBOL_KEYS.map((ch): KeyDef => ({
    label: ch,
    a11y: `Symbol ${ch}`,
    run: () => onPrintable(ch),
  }));

  const renderKey = (k: KeyDef) => (
    <Pressable
      key={k.a11y}
      accessibilityLabel={k.a11y}
      accessibilityState={{ selected: !!k.active }}
      disabled={disabled}
      onPress={() => fire(k.run, k.repeat)}
      onLongPress={() => k.repeat && fire(k.run, true)}
      onPressOut={stopRepeat}
      style={[
        styles.key,
        { backgroundColor: appTheme.bgTertiary, borderColor: appTheme.border },
        k.active && {
          backgroundColor: appTheme.accent,
          borderColor: appTheme.accent,
        },
      ]}
    >
      <Text
        style={[
          styles.keyLabel,
          { color: appTheme.textPrimary },
          k.active && styles.keyLabelArmed,
        ]}
      >
        {k.label}
      </Text>
    </Pressable>
  );

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: appTheme.bgSecondary, borderTopColor: appTheme.border },
        disabled && styles.disabled,
      ]}
    >
      {/* Pinned control zone — always visible */}
      <View style={[styles.pinned, { borderRightColor: appTheme.border }]}>
        {pinnedKeys.map(renderKey)}
      </View>
      {/* Scrollable symbol zone */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {symbolKeys.map(renderKey)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: EXTRA_KEYS_BAR_HEIGHT,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "stretch",
    borderTopWidth: 1,
    paddingVertical: 6,
  },
  disabled: {
    opacity: 0.4,
  },
  pinned: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 6,
    borderRightWidth: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 6,
  },
  key: {
    minWidth: 42,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 1,
  },
  keyLabel: {
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontWeight: "700",
  },
  keyLabelArmed: {
    color: "#fff",
    fontWeight: "800",
  },
});
