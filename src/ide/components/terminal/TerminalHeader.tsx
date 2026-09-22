import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TerminalTab } from "./useTerminalSession";
import { TerminalDropdownModal } from "./TerminalDropdownModal";
import { TerminalActionMenuModal } from "./TerminalActionMenuModal";
import { useTheme } from "../../../theme/themeContext";

interface TerminalHeaderProps {
  sessions: TerminalTab[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onAddSession: () => void;
  onCloseSession: (id: string) => void;
  onRestartSession: () => void;
  onClearSession: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCopyOutput?: () => void;
  onPasteClipboard?: () => void;
  isSplit?: boolean;
  onToggleSplit?: () => void;
  splitSessionId?: string;
  focusedPane?: "primary" | "secondary";
  onSelectSplitSession?: (id: string) => void;
  onFocusPane?: (pane: "primary" | "secondary") => void;
}

export function TerminalHeader({
  sessions,
  activeSessionId,
  onSelectSession,
  onAddSession,
  onCloseSession,
  onRestartSession,
  onClearSession,
  onZoomIn,
  onZoomOut,
  onCopyOutput,
  onPasteClipboard,
  isSplit,
  onToggleSplit,
  splitSessionId,
  focusedPane = "primary",
  onSelectSplitSession,
  onFocusPane,
}: TerminalHeaderProps) {
  const { theme: appTheme } = useTheme();
  const [dropdownTarget, setDropdownTarget] = useState<"primary" | "secondary" | null>(null);
  const [showActionMenu, setShowActionMenu] = useState(false);

  const primaryTab = sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const secondaryTab = isSplit && splitSessionId
    ? sessions.find((s) => s.id === splitSessionId) || sessions[0]
    : undefined;

  return (
    <View
      style={[
        styles.topBar,
        { backgroundColor: appTheme.bgSecondary, borderBottomColor: appTheme.border },
      ]}
    >
      {/* Left Section: Session Selectors & Quick Add */}
      {isSplit && secondaryTab ? (
        <View style={styles.leftSection}>
          {/* Pane 1 Tab */}
          <TouchableOpacity
            style={[
              styles.paneTab,
              { backgroundColor: appTheme.bgTertiary, borderColor: appTheme.border },
              focusedPane === "primary" && {
                borderColor: appTheme.accent,
                backgroundColor: `${appTheme.accent}18`,
              },
            ]}
            onPress={() => {
              onFocusPane?.("primary");
              setDropdownTarget("primary");
            }}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: primaryTab?.isTask ? appTheme.accentGreen : appTheme.accent },
              ]}
            />
            <Text
              style={[
                styles.paneTabText,
                { color: focusedPane === "primary" ? appTheme.accent : appTheme.textPrimary },
              ]}
              numberOfLines={1}
            >
              {primaryTab?.name || "1: sh"}
            </Text>
            <Ionicons name="chevron-down" size={11} color={appTheme.textMuted} />
          </TouchableOpacity>

          {/* Pane 2 Tab */}
          <TouchableOpacity
            style={[
              styles.paneTab,
              { backgroundColor: appTheme.bgTertiary, borderColor: appTheme.border },
              focusedPane === "secondary" && {
                borderColor: appTheme.accent,
                backgroundColor: `${appTheme.accent}18`,
              },
            ]}
            onPress={() => {
              onFocusPane?.("secondary");
              setDropdownTarget("secondary");
            }}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: secondaryTab?.isTask ? appTheme.accentGreen : appTheme.accent },
              ]}
            />
            <Text
              style={[
                styles.paneTabText,
                { color: focusedPane === "secondary" ? appTheme.accent : appTheme.textPrimary },
              ]}
              numberOfLines={1}
            >
              {secondaryTab?.name || "2: sh"}
            </Text>
            <Ionicons name="chevron-down" size={11} color={appTheme.textMuted} />
          </TouchableOpacity>

          {/* Quick Add */}
          <TouchableOpacity
            style={[styles.addTabBtn, { backgroundColor: appTheme.bgTertiary, borderColor: appTheme.border }]}
            onPress={onAddSession}
            activeOpacity={0.7}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Ionicons name="add" size={13} color={appTheme.textSecondary} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.leftSection}>
          <TouchableOpacity
            style={[
              styles.dropdownBtn,
              { backgroundColor: appTheme.bgTertiary, borderColor: appTheme.border },
            ]}
            onPress={() => setDropdownTarget("primary")}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: primaryTab?.isTask ? appTheme.accentGreen : appTheme.accent },
              ]}
            />
            <Text
              style={[styles.dropdownBtnText, { color: appTheme.textPrimary }]}
              numberOfLines={1}
            >
              {primaryTab?.name || "Terminal"}
            </Text>
            <Ionicons name="chevron-down" size={12} color={appTheme.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.addTabBtn, { backgroundColor: appTheme.bgTertiary, borderColor: appTheme.border }]}
            onPress={onAddSession}
            activeOpacity={0.7}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Ionicons name="add" size={13} color={appTheme.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Right Section: Compact Action Controls */}
      <View style={styles.topActions}>
        {/* Split Terminal Toggle */}
        {onToggleSplit && (
          <TouchableOpacity
            style={[
              styles.actionBtn,
              isSplit && { backgroundColor: `${appTheme.accent}25`, borderRadius: 4 },
            ]}
            onPress={onToggleSplit}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons
              name={isSplit ? "grid" : "grid-outline"}
              size={14}
              color={isSplit ? appTheme.accent : appTheme.textSecondary}
            />
          </TouchableOpacity>
        )}

        {/* Restart Active */}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onRestartSession}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="refresh-outline" size={14} color={appTheme.textSecondary} />
        </TouchableOpacity>

        {/* Clear Active */}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onClearSession}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="trash-outline" size={14} color={appTheme.textSecondary} />
        </TouchableOpacity>

        {/* More Options Menu */}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => setShowActionMenu(true)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="ellipsis-horizontal" size={15} color={appTheme.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Terminal Dropdown Modal for Session Switching */}
      <TerminalDropdownModal
        visible={dropdownTarget !== null}
        onClose={() => setDropdownTarget(null)}
        sessions={sessions}
        activeSessionId={dropdownTarget === "secondary" ? (splitSessionId || "") : activeSessionId}
        onSelectSession={(id) => {
          if (dropdownTarget === "secondary") {
            onSelectSplitSession?.(id);
          } else {
            onSelectSession(id);
          }
          setDropdownTarget(null);
        }}
        onAddSession={onAddSession}
        onCloseSession={onCloseSession}
        theme={appTheme}
        title={
          isSplit
            ? dropdownTarget === "secondary"
              ? "Select Pane 2 Session"
              : "Select Pane 1 Session"
            : undefined
        }
      />

      {/* Terminal Overflow Action Menu */}
      <TerminalActionMenuModal
        visible={showActionMenu}
        onClose={() => setShowActionMenu(false)}
        theme={appTheme}
        onCopyOutput={onCopyOutput}
        onPasteClipboard={onPasteClipboard}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onRestartSession={onRestartSession}
        onClearSession={onClearSession}
        isSplit={isSplit}
        onToggleSplit={onToggleSplit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    paddingHorizontal: 8,
    height: 32,
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
  },
  dropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    gap: 5,
    maxWidth: 150,
  },
  paneTab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    gap: 5,
    maxWidth: 110,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dropdownBtnText: {
    fontSize: 11,
    fontFamily: "monospace",
    fontWeight: "600",
    flexShrink: 1,
  },
  paneTabText: {
    fontSize: 11,
    fontFamily: "monospace",
    fontWeight: "600",
    flexShrink: 1,
  },
  addTabBtn: {
    width: 22,
    height: 22,
    borderRadius: 5,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  actionBtn: {
    padding: 3,
  },
});
