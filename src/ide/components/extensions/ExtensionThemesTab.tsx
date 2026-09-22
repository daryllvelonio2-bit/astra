import React from "react";
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";

export interface ExtensionThemeItem {
  id: string;
  label: string;
}

interface ExtensionThemesTabProps {
  themes: ExtensionThemeItem[];
  activeThemeId: string;
  theme: ThemeColors;
  onApplyTheme: (themeId: string, label: string) => void;
}

export function ExtensionThemesTab({
  themes,
  activeThemeId,
  theme,
  onApplyTheme,
}: ExtensionThemesTabProps) {
  return (
    <FlatList
      data={themes}
      keyExtractor={(item) => item.id}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={5}
      removeClippedSubviews={Platform.OS === "android"}
      contentContainerStyle={styles.listContent}
      ListEmptyComponent={
        <View style={styles.emptyView}>
          <Ionicons name="color-palette-outline" size={36} color={theme.textMuted} />
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No Theme Extensions Installed</Text>
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>
            Search the Marketplace for themes like GitHub Dark, Dracula, or One Dark Pro to install them.
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        const isSelected = activeThemeId === item.id;
        return (
          <TouchableOpacity
            style={[
              styles.themeCard,
              {
                backgroundColor: theme.bgTertiary,
                borderColor: isSelected ? theme.accent : theme.border,
              },
              isSelected && { borderWidth: 1.5 },
            ]}
            onPress={() => onApplyTheme(item.id, item.label)}
            activeOpacity={0.7}
          >
            <View style={styles.themeLeft}>
              <View
                style={[
                  styles.iconBox,
                  { backgroundColor: isSelected ? `${theme.accent}25` : `${theme.borderLight}40` },
                ]}
              >
                <Ionicons
                  name="color-palette"
                  size={18}
                  color={isSelected ? theme.accent : theme.textSecondary}
                />
              </View>
              <View style={styles.themeInfo}>
                <Text style={[styles.themeLabel, { color: theme.textPrimary }]} numberOfLines={1}>
                  {item.label}
                </Text>
                <Text style={[styles.themeSub, { color: theme.textMuted }]} numberOfLines={1}>
                  {isSelected ? "Currently Active Theme" : "Tap to apply theme"}
                </Text>
              </View>
            </View>

            {isSelected ? (
              <View style={[styles.activeBadge, { backgroundColor: `${theme.accentGreen}18`, borderColor: `${theme.accentGreen}40` }]}>
                <Ionicons name="checkmark-circle" size={13} color={theme.accentGreen} />
                <Text style={[styles.activeBadgeText, { color: theme.accentGreen }]}>Active</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.applyBtn, { backgroundColor: theme.accent }]}
                onPress={() => onApplyTheme(item.id, item.label)}
                activeOpacity={0.7}
              >
                <Text style={styles.applyBtnText}>Apply</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  listContent: { padding: 16, gap: 10 },
  emptyView: { alignItems: "center", justifyContent: "center", paddingVertical: 48, gap: 10 },
  emptyTitle: { fontSize: 14, fontWeight: "700" },
  emptyText: { fontSize: 12, textAlign: "center", paddingHorizontal: 24, lineHeight: 17 },
  themeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 12,
  },
  themeLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  themeInfo: { flex: 1, gap: 2 },
  themeLabel: { fontSize: 13, fontWeight: "700" },
  themeSub: { fontSize: 11 },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  activeBadgeText: { fontSize: 11, fontWeight: "700" },
  applyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  applyBtnText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
});
