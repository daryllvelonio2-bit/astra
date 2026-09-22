import React from "react";
import { View, TextInput, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useKeyboardMouseMode } from "../../context/KeyboardMouseContext";

interface WebBrowserNavBarProps {
  url: string;
  inputUrl: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  hasError: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
  onInputChange: (text: string) => void;
  onSubmit: () => void;
  onClearInput: () => void;
  onOpenExternal: () => void;
}

export function WebBrowserNavBar({
  url,
  inputUrl,
  loading,
  canGoBack,
  canGoForward,
  hasError,
  onGoBack,
  onGoForward,
  onReload,
  onInputChange,
  onSubmit,
  onClearInput,
  onOpenExternal,
}: WebBrowserNavBarProps) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();

  return (
    <View style={[styles.navBar, { backgroundColor: theme.bgSecondary, borderBottomColor: theme.border }]}>
      <View style={styles.navControls}>
        <TouchableOpacity
          onPress={onGoBack}
          disabled={!canGoBack}
          style={[styles.navBtn, { backgroundColor: theme.bgTertiary }, !canGoBack && styles.navBtnDisabled]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={16} color={canGoBack ? theme.textPrimary : theme.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onGoForward}
          disabled={!canGoForward}
          style={[styles.navBtn, { backgroundColor: theme.bgTertiary }, !canGoForward && styles.navBtnDisabled]}
          accessibilityLabel="Forward"
        >
          <Ionicons name="chevron-forward" size={16} color={canGoForward ? theme.textPrimary : theme.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onReload}
          style={[styles.navBtn, { backgroundColor: theme.bgTertiary }]}
          accessibilityLabel="Reload"
        >
          <Ionicons name={loading ? "close" : "reload"} size={14} color={theme.accent} />
        </TouchableOpacity>
      </View>

      {/* Address Input Bar */}
      <View style={[styles.urlInputBox, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
        <Ionicons
          name={url.startsWith("https") ? "lock-closed" : url.startsWith("file") ? "document-text-outline" : "globe-outline"}
          size={13}
          color={hasError ? theme.accentRed : url.startsWith("https") ? theme.accentGreen : theme.accent}
          style={{ marginRight: 6 }}
        />
        <TextInput
          style={[styles.urlInput, { color: theme.textPrimary }]}
          value={inputUrl}
          onChangeText={onInputChange}
          onSubmitEditing={onSubmit}
          autoCapitalize="none"
          autoCorrect={false}
          showSoftInputOnFocus={!keyboardMouseMode}
          keyboardType="url"
          returnKeyType="go"
          placeholder="http://127.0.0.1:8000"
          placeholderTextColor={theme.textMuted}
          selectTextOnFocus
        />
        {inputUrl ? (
          <TouchableOpacity onPress={onClearInput} style={styles.clearBtn}>
            <Ionicons name="close-circle" size={13} color={theme.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Open in External Browser Button */}
      <TouchableOpacity onPress={onOpenExternal} style={[styles.externalBtn, { backgroundColor: theme.bgTertiary }]} accessibilityLabel="Open in External Browser">
        <Ionicons name="open-outline" size={15} color={theme.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    gap: 6,
  },
  navControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  navBtn: {
    padding: 6,
    borderRadius: 6,
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  urlInputBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  urlInput: {
    flex: 1,
    fontSize: 12,
    paddingVertical: 0,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  clearBtn: {
    padding: 2,
    marginLeft: 4,
  },
  externalBtn: {
    padding: 7,
    borderRadius: 6,
  },
});
