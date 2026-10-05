import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";

export type SettingsTabId = "general" | "editor" | "notifications" | "environment" | "shortcuts";

interface SettingsTab {
  id: SettingsTabId;
  /** Label kept for accessibility only — the bar renders icons, no text. */
  title: string;
  icon: any;
}

const TABS: SettingsTab[] = [
  { id: "general", title: "General", icon: "options-outline" },
  { id: "editor", title: "Editor", icon: "code-slash-outline" },
  { id: "notifications", title: "Alerts", icon: "notifications-outline" },
  { id: "environment", title: "Linux", icon: "cube-outline" },
  { id: "shortcuts", title: "Keys", icon: "key-outline" },
];

interface SettingsTabBarProps {
  activeTab: SettingsTabId;
  onSelectTab: (tab: SettingsTabId) => void;
  theme: ThemeColors;
}

export function SettingsTabBar({ activeTab, onSelectTab, theme }: SettingsTabBarProps) {
  return (
    <View style={[styles.tabBar, { borderColor: theme.border }]}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.tab,
              isActive && {
                backgroundColor: `${theme.accent}22`,
                borderColor: `${theme.accent}55`,
              },
            ]}
            onPress={() => onSelectTab(tab.id)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityLabel={tab.title}
            accessibilityState={{ selected: isActive }}
          >
            <Ionicons
              name={tab.icon}
              size={21}
              color={isActive ? theme.accent : theme.textMuted}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
});
