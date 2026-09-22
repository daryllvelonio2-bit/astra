import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";

export type SettingsTabId = "general" | "editor" | "environment";

interface SettingsTab {
  id: SettingsTabId;
  title: string;
  icon: any;
}

const TABS: SettingsTab[] = [
  { id: "general", title: "General", icon: "options-outline" },
  { id: "editor", title: "Editor", icon: "code-slash-outline" },
  { id: "environment", title: "Linux", icon: "cube-outline" },
];

interface SettingsTabBarProps {
  activeTab: SettingsTabId;
  onSelectTab: (tab: SettingsTabId) => void;
  theme: ThemeColors;
}

export function SettingsTabBar({ activeTab, onSelectTab, theme }: SettingsTabBarProps) {
  return (
    <View style={[styles.tabBar, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const color = isActive ? theme.accent : theme.textMuted;
        return (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.tab,
              { borderBottomColor: isActive ? theme.accent : "transparent" },
            ]}
            onPress={() => onSelectTab(tab.id)}
            activeOpacity={0.7}
          >
            <Ionicons name={tab.icon} size={18} color={color} />
            <Text style={[styles.tabText, { color }]}>
              {tab.title}
            </Text>
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
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
