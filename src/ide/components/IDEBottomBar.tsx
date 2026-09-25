import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../theme/themeContext";
import { BottomTabVisibility, DEFAULT_BOTTOM_TABS } from "../services/configService";

export type IDEBottomTab = "editor" | "terminal" | "browser" | "git";

interface IDEBottomBarProps {
  bottomTab: IDEBottomTab;
  onChangeTab: (tab: IDEBottomTab) => void;
  runningTaskCount?: number;
  compact?: boolean;
  visibleTabs?: BottomTabVisibility;
  bottomInset?: number;
  isLandscapeNavbarHidden?: boolean;
  onHideNavbar?: () => void;
  onShowNavbar?: () => void;
  keyboardMouseMode?: boolean;
}

function IDEBottomBarInner({
  bottomTab,
  onChangeTab,
  runningTaskCount = 0,
  compact = false,
  visibleTabs = DEFAULT_BOTTOM_TABS,
  bottomInset,
  isLandscapeNavbarHidden = false,
  onHideNavbar,
  onShowNavbar,
  keyboardMouseMode = false,
}: IDEBottomBarProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const isHidden = keyboardMouseMode
    ? isLandscapeNavbarHidden
    : (compact && isLandscapeNavbarHidden && bottomTab === "editor");
  const canOfferHide = (compact || keyboardMouseMode) && !!onHideNavbar;
  if (canOfferHide && isHidden) {
    return (
      <View style={[styles.collapsedBarContainer, { paddingBottom: Math.max(insets.bottom, 0) }]} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.showNavbarBtn}
          onPress={onShowNavbar}
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
          accessibilityLabel="Show bottom navigation bar"
        >
          <Ionicons name="chevron-up" size={16} color={theme.textMuted} />
        </TouchableOpacity>
      </View>
    );
  }

  // Always respect the live system bottom/side insets: 0 with gesture nav
  // (true fullscreen), the bar height with 3-button navigation — landscape
  // included. Never hard-zero per orientation.
  const bottomPad = bottomInset !== undefined ? bottomInset : Math.max(insets.bottom, 0);

  return (
    <View
      style={[
        styles.bottomBarContainer,
        {
          backgroundColor: theme.bgSecondary,
          borderTopColor: theme.border,
          paddingBottom: bottomPad,
          paddingLeft: insets.left || 0,
          paddingRight: insets.right || 0,
        },
      ]}
    >
      <View style={[styles.bottomBarRow, compact && styles.bottomBarRowCompact]}>
      {visibleTabs.editor && (
      <View style={styles.editorTabWrapper}>
        <TouchableOpacity
          style={[
            styles.bottomTabBtn,
            bottomTab === "editor" && { backgroundColor: theme.bgTertiary },
          ]}
          onPress={() => onChangeTab("editor")}
        >
          <Ionicons name="code-slash" size={16} color={bottomTab === "editor" ? theme.accent : theme.textMuted} />
          <Text
            style={[
              styles.bottomTabText,
              compact && styles.bottomTabTextCompact,
              { color: theme.textMuted },
              bottomTab === "editor" && { color: theme.accent, fontWeight: "700" },
            ]}
          >
            Editor
          </Text>
        </TouchableOpacity>
        {canOfferHide && (
          <TouchableOpacity
            style={styles.hideNavbarBtn}
            onPress={onHideNavbar}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Hide bottom navigation bar"
          >
            <Ionicons name="chevron-down" size={13} color={theme.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      )}

      {visibleTabs.terminal && (
      <TouchableOpacity
        style={[
          styles.bottomTabBtn,
          bottomTab === "terminal" && { backgroundColor: theme.bgTertiary },
        ]}
        onPress={() => onChangeTab("terminal")}
      >
        <View style={styles.terminalIconContainer}>
          <MaterialCommunityIcons name="console" size={16} color={bottomTab === "terminal" ? theme.accent : theme.textMuted} />
          {runningTaskCount > 0 && (
            <View style={[styles.taskBadge, { backgroundColor: theme.accentGreen, borderColor: theme.bgSecondary }]}>
              <View style={[styles.taskBadgeDot, { backgroundColor: theme.bubbleUserText }]} />
            </View>
          )}
        </View>
        <Text
          style={[
            styles.bottomTabText,
            compact && styles.bottomTabTextCompact,
            { color: theme.textMuted },
            bottomTab === "terminal" && { color: theme.accent, fontWeight: "700" },
          ]}
        >
          Terminal{runningTaskCount > 0 ? ` (${runningTaskCount})` : ""}
        </Text>
      </TouchableOpacity>
      )}

      {visibleTabs.browser && (
      <TouchableOpacity
        style={[
          styles.bottomTabBtn,
          bottomTab === "browser" && { backgroundColor: theme.bgTertiary },
        ]}
        onPress={() => onChangeTab("browser")}
      >
        <Ionicons name="globe-outline" size={16} color={bottomTab === "browser" ? theme.accent : theme.textMuted} />
        <Text
          style={[
            styles.bottomTabText,
            compact && styles.bottomTabTextCompact,
            { color: theme.textMuted },
            bottomTab === "browser" && { color: theme.accent, fontWeight: "700" },
          ]}
        >
          Browser
        </Text>
      </TouchableOpacity>
      )}

      {visibleTabs.git && (
      <TouchableOpacity
        style={[
          styles.bottomTabBtn,
          bottomTab === "git" && { backgroundColor: theme.bgTertiary },
        ]}
        onPress={() => onChangeTab("git")}
      >
        <Ionicons name="git-branch-outline" size={16} color={bottomTab === "git" ? theme.accent : theme.textMuted} />
        <Text
          style={[
            styles.bottomTabText,
            compact && styles.bottomTabTextCompact,
            { color: theme.textMuted },
            bottomTab === "git" && { color: theme.accent, fontWeight: "700" },
          ]}
        >
          Git
        </Text>
      </TouchableOpacity>
      )}

      </View>
    </View>
  );
}

export const IDEBottomBar = React.memo(IDEBottomBarInner);

const styles = StyleSheet.create({
  bottomBarContainer: {
    borderTopWidth: 1,
    width: "100%",
  },
  bottomBarRow: {
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  bottomBarRowCompact: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  bottomTabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
  },
  editorTabWrapper: {
    flexDirection: "row",
    alignItems: "center",
  },
  hideNavbarBtn: {
    backgroundColor: "transparent",
    paddingHorizontal: 3,
    paddingVertical: 4,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 1,
  },
  collapsedBarContainer: {
    position: "absolute",
    bottom: 2,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 90,
    backgroundColor: "transparent",
  },
  showNavbarBtn: {
    backgroundColor: "transparent",
    paddingHorizontal: 12,
    paddingVertical: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  bottomTabBtnActive: {},
  bottomTabText: {
    fontSize: 12,
    fontWeight: "500",
  },
  bottomTabTextCompact: {
    fontSize: 10.5,
  },
  bottomTabTextActive: {
    fontWeight: "700",
  },
  terminalIconContainer: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  taskBadge: {
    position: "absolute",
    top: -2,
    right: -4,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  taskBadgeDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
});
