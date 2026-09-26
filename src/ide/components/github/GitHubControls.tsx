import React from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useKeyboardMouseMode } from "../../context/KeyboardMouseContext";

/**
 * Search input used by every GitHub screen. Debouncing and request ordering
 * stay in the caller; this file only owns the field's behaviour (focus,
 * clear, submit) so typing never triggers heavy work here.
 */

export function GitHubSearchBar({
  value,
  onChangeText,
  onSubmit,
  placeholder,
  autoFocus,
  trailing,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  trailing?: React.ReactNode;
}) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();

  return (
    <View style={[barStyles.wrap, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
      <Octicons name="search" size={13} color={theme.textMuted} />
      <TextInput
        style={[barStyles.input, { color: theme.textPrimary }]}
        placeholder={placeholder || "Search GitHub..."}
        placeholderTextColor={theme.textMuted}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={() => onSubmit?.(value)}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        showSoftInputOnFocus={!keyboardMouseMode}
        returnKeyType="search"
        accessibilityLabel={placeholder || "Search GitHub"}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Octicons name="x" size={13} color={theme.textMuted} />
        </TouchableOpacity>
      )}
      {trailing}
    </View>
  );
}

/** Horizontal filter/scope strip (open / closed / mine ...). */
export function FilterStrip<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ key: T; label: string; count?: number }>;
  value: T;
  onChange: (key: T) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={[barStyles.strip, { borderBottomColor: theme.border }]}>
      {options.map((option) => {
        const active = option.key === value;
        const label = option.count !== undefined ? `${option.label} ${option.count}` : option.label;
        return (
          <TouchableOpacity
            key={option.key}
            style={[barStyles.stripBtn, { borderBottomColor: active ? theme.accent : "transparent" }]}
            onPress={() => onChange(option.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[barStyles.stripText, { color: active ? theme.textPrimary : theme.textSecondary }]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Multi-line composer with a submit row — issue/PR bodies, comments, gists. */
export function Composer({
  value,
  onChangeText,
  placeholder,
  minHeight = 90,
  onSubmit,
  submitLabel = "Submit",
  busy,
  disabled,
  error,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  minHeight?: number;
  onSubmit?: () => void;
  submitLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  error?: string | null;
}) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const blocked = disabled || busy;

  return (
    <View style={composerStyles.wrap}>
      <TextInput
        style={[
          composerStyles.input,
          { minHeight, color: theme.textPrimary, backgroundColor: theme.bgInput, borderColor: theme.border },
        ]}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        value={value}
        onChangeText={onChangeText}
        multiline
        textAlignVertical="top"
        showSoftInputOnFocus={!keyboardMouseMode}
        autoCapitalize="sentences"
      />
      {!!error && <Text style={[composerStyles.error, { color: theme.accentRed }]}>{error}</Text>}
      {onSubmit && (
        <View style={composerStyles.row}>
          <TouchableOpacity
            style={[
              composerStyles.submit,
              { backgroundColor: blocked ? theme.bgTertiary : theme.accent, borderColor: theme.border },
            ]}
            onPress={onSubmit}
            disabled={blocked}
            activeOpacity={0.8}
          >
            <Text style={[composerStyles.submitText, { color: blocked ? theme.textMuted : "#fff" }]}>
              {busy ? "Working..." : submitLabel}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export const barStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 4,
    height: 34,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontSize: 12.5, paddingVertical: 0 },
  strip: { flexDirection: "row", gap: 2, paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  stripBtn: { paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 2 },
  stripText: { fontSize: 11.5, fontWeight: "700" },
});

export const composerStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  input: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12.5,
    lineHeight: 18,
  },
  error: { fontSize: 11.5 },
  row: { flexDirection: "row", justifyContent: "flex-end" },
  submit: {
    paddingHorizontal: 16,
    height: 32,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  submitText: { fontSize: 12, fontWeight: "700" },
});