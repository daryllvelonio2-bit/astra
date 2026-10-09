import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";

export type SettingsTabId = "general" | "editor" | "environment" | "shortcuts" | "feedback" | "support";

interface SettingsTab {
  id: SettingsTabId;
  /** Label shown under the icon — also the accessibility name. */
  title: string;
  icon: any;
}

// Same ids, order and icons as before — only the presentation changed.
const TABS: SettingsTab[] = [
  { id: "general", title: "General", icon: "options-outline" },
  { id: "editor", title: "Editor", icon: "code-slash-outline" },
  { id: "environment", title: "Linux", icon: "cube-outline" },
  { id: "shortcuts", title: "Keys", icon: "key-outline" },
  { id: "feedback", title: "Feedback", icon: "mail-outline" },
  { id: "support", title: "Support", icon: "wallet-outline" },
];

interface SettingsTabBarProps {
  activeTab: SettingsTabId;
  onSelectTab: (tab: SettingsTabId) => void;
  theme: ThemeColors;
}

/**
 * Reference tab row: icon with its label beneath it, the active tab tinted with
 * the accent. Six fixed columns at flex:1; each label is a single clipped line
 * (ellipsizeMode "tail") so a long one truncates inside its own column instead
 * of pushing the row off the edge on a narrow screen.
 */
export function SettingsTabBar({ activeTab, onSelectTab, theme }: SettingsTabBarProps) {
  return (
    <View style={[styles.tabBar, { borderColor: theme.border }]}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            style={styles.tab}
            onPress={() => onSelectTab(tab.id)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityLabel={tab.title}
            accessibilityState={{ selected: isActive }}
          >
            <View style={[styles.iconWrap, isActive && { backgroundColor: `${theme.accent}1F` }]}>
              <Ionicons name={tab.icon} size={20} color={isActive ? theme.accent : theme.textMuted} />
            </View>
            <Text
              style={[styles.label, { color: isActive ? theme.accent : theme.textMuted }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {tab.title}
            </Text>
            {isActive && <View style={[styles.underline, { backgroundColor: theme.accent }]} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingTop: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingBottom: 8,
    gap: 3,
  },
  iconWrap: {
    width: 38,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 9.5,
    fontWeight: "600",
    maxWidth: "100%",
  },
  underline: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 0,
    height: 2,
    borderRadius: 1,
  },
});
