import React from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { CompletionItem } from "../../services/completionService";
import { ThemeColors } from "../../../theme/themeContext";

interface CompletionBarProps {
  items: CompletionItem[];
  onSelect: (item: CompletionItem) => void;
  theme: ThemeColors;
  bottomOffset?: number;
}

type AccentColorKey = "accent" | "accentGreen" | "accentGold" | "accentRed";

function getBadgeSymbol(kind: CompletionItem["kind"]): { letter: string; colorKey: AccentColorKey } {
  switch (kind) {
    case "function":
      return { letter: "ƒ", colorKey: "accent" };
    case "class":
      return { letter: "C", colorKey: "accentGreen" };
    case "type":
      return { letter: "T", colorKey: "accentGold" };
    case "module":
      return { letter: "m", colorKey: "accent" };
    case "keyword":
      return { letter: "k", colorKey: "accentRed" };
    case "snippet":
      return { letter: "⎘", colorKey: "accentGold" };
    case "property":
      return { letter: "p", colorKey: "accent" };
    case "variable":
    default:
      return { letter: "v", colorKey: "accentGreen" };
  }
}

export function CompletionBar({ items, onSelect, theme, bottomOffset = 28 }: CompletionBarProps) {
  if (!items || items.length === 0) return null;

  return (
    <View
      style={[
        styles.container,
        { bottom: bottomOffset },
      ]}
      pointerEvents="box-none"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={styles.scrollContent}
      >
        {items.map((item, idx) => {
          const badge = getBadgeSymbol(item.kind);
          const badgeColor = theme[badge.colorKey] || theme.accent;

          return (
            <TouchableOpacity
              key={`${item.label}-${idx}`}
              style={[
                styles.itemBtn,
                {
                  backgroundColor: `${theme.bgSecondary}F2`,
                  borderColor: theme.border,
                },
              ]}
              onPress={() => onSelect(item)}
              activeOpacity={0.6}
            >
              <View style={[styles.badge, { backgroundColor: `${badgeColor}25` }]}>
                <Text style={[styles.badgeLetter, { color: badgeColor }]}>{badge.letter}</Text>
              </View>
              <Text style={[styles.itemLabel, { color: theme.textPrimary }]}>{item.label}</Text>
              {item.detail && item.detail !== "local" && (
                <Text
                  style={[styles.itemDetail, { color: theme.textMuted }]}
                  numberOfLines={1}
                >
                  {item.detail.length > 16 ? `${item.detail.slice(0, 16)}…` : item.detail}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 8,
    maxWidth: "88%",
    zIndex: 90,
    backgroundColor: "transparent",
  },
  scrollContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  itemBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  badge: {
    width: 14,
    height: 14,
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeLetter: {
    fontSize: 9,
    fontWeight: "800",
    fontFamily: "monospace",
  },
  itemLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  itemDetail: {
    fontSize: 9.5,
    fontFamily: "monospace",
    opacity: 0.75,
  },
});
