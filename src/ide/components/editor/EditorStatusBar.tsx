import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const FONT_FAMILY = Platform.OS === "ios" ? "Menlo" : "monospace";

interface EditorStatusBarProps {
  isEditing: boolean;
  matchStatus?: string | null;
  matchKind?: string;
  currentLineDiag?: { line: number; message: string; severity?: string } | null;
  showProblems: boolean;
  onShowProblems: () => void;
  theme: any;
}

export function EditorStatusBar({
  isEditing,
  matchStatus,
  matchKind,
  currentLineDiag,
  showProblems,
  onShowProblems,
  theme,
}: EditorStatusBarProps) {
  if (!isEditing) return null;

  return (
    <>
      {/* Bracket partner status — solid elevated surface */}
      {matchStatus && (
        <View
          style={[
            styles.bracketBar,
            { backgroundColor: theme.bgElevated, borderColor: theme.border },
          ]}
        >
          <Text
            style={[
              styles.bracketBarText,
              { color: matchKind === "unmatched" ? theme.accentRed : theme.accent },
            ]}
          >
            {matchKind === "unmatched" ? "⚠ " : "{ }  "}
            {matchStatus}
          </Text>
        </View>
      )}

      {/* Current line diagnostic error (tap opens Problems panel) */}
      {!showProblems && currentLineDiag && (
        <TouchableOpacity
          style={[
            styles.errorBar,
            { backgroundColor: theme.bgElevated, borderColor: theme.border },
          ]}
          onPress={onShowProblems}
          activeOpacity={0.7}
        >
          <Ionicons
            name={currentLineDiag.severity === "error" ? "alert-circle" : "warning-outline"}
            size={13}
            color={currentLineDiag.severity === "error" ? theme.accentRed : theme.accentGold}
            style={{ marginRight: 6 }}
          />
          <Text
            style={[
              styles.errorBarText,
              { color: currentLineDiag.severity === "error" ? theme.accentRed : theme.accentGold },
            ]}
            numberOfLines={1}
          >
            Line {currentLineDiag.line}: {currentLineDiag.message}
          </Text>
          <Text style={[styles.errorBarHint, { color: theme.textMuted }]}>View all</Text>
        </TouchableOpacity>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  bracketBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  bracketBarText: {
    fontFamily: FONT_FAMILY,
    fontSize: 10.5,
    fontWeight: "600",
  },
  errorBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  errorBarText: {
    flex: 1,
    fontSize: 11,
    fontFamily: FONT_FAMILY,
    fontWeight: "600",
  },
  errorBarHint: {
    fontSize: 10,
    marginLeft: 8,
  },
});
