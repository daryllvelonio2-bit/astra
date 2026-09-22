import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppTheme } from "../../ide/services/configService";
import { ThemeColors, THEMES } from "../../theme/themeContext";

interface ThemeOption {
  id: AppTheme;
  title: string;
  subtitle: string;
  description: string;
  icon: any;
  swatches: string[];
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "dark",
    title: "Dark Onyx",
    subtitle: "Recommended for low-light coding",
    description: "Deep obsidian tones with soft slate borders and clean blue accents.",
    icon: "moon",
    swatches: ["#131314", "#16171b", "#8ab4f8", "#34d399"],
  },
  {
    id: "light",
    title: "Light Clean",
    subtitle: "High clarity in daylight",
    description: "Crisp white porcelain layout with vibrant royal blue highlights.",
    icon: "sunny",
    swatches: ["#f8fafc", "#f1f5f9", "#2563eb", "#059669"],
  },
  {
    id: "midnight",
    title: "Midnight Glow",
    subtitle: "Vibrant neon aesthetic",
    description: "Cosmic deep slate background with luminous cyan and purple glow.",
    icon: "planet",
    swatches: ["#0b0f19", "#0e1424", "#38bdf8", "#a855f7"],
  },
];

interface ThemeSelectionStepProps {
  selectedTheme: AppTheme;
  onSelectTheme: (theme: AppTheme) => void;
  theme: ThemeColors;
  isLandscape?: boolean;
}

export function ThemeSelectionStep({
  selectedTheme,
  onSelectTheme,
  theme,
  isLandscape = false,
}: ThemeSelectionStepProps) {
  return (
    <View style={styles.container}>
      <View style={styles.headerWrap}>
        <Text style={[styles.stepTitle, { color: theme.textPrimary }]}>
          Choose Your Appearance
        </Text>
        <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
          Select a default color palette. You can change this anytime in Settings.
        </Text>
      </View>

      <View style={[styles.cardsWrap, isLandscape && styles.cardsWrapLandscape]}>
        {THEME_OPTIONS.map((opt) => {
          const isSelected = selectedTheme === opt.id;
          const themeDef = THEMES[opt.id];
          const accentColor = themeDef.accent;

          return (
            <TouchableOpacity
              key={opt.id}
              style={[
                styles.card,
                isLandscape && styles.cardLandscape,
                {
                  backgroundColor: theme.bgSecondary,
                  borderColor: isSelected ? accentColor : theme.border,
                },
                isSelected && {
                  borderWidth: 2,
                  backgroundColor: `${accentColor}0D`,
                },
              ]}
              onPress={() => onSelectTheme(opt.id)}
              activeOpacity={0.75}
            >
              <View style={styles.cardTopRow}>
                <View style={[styles.iconWrap, { backgroundColor: `${accentColor}20` }]}>
                  <Ionicons name={opt.icon} size={18} color={accentColor} />
                </View>
                <View style={styles.titleCol}>
                  <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
                    {opt.title}
                  </Text>
                  <Text style={[styles.cardSubtitle, { color: theme.textMuted }]}>
                    {opt.subtitle}
                  </Text>
                </View>
                <View style={styles.selectionIndicator}>
                  <Ionicons
                    name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                    size={22}
                    color={isSelected ? accentColor : theme.textMuted}
                  />
                </View>
              </View>

              <Text
                style={[styles.cardDesc, isLandscape && styles.cardDescLandscape, { color: theme.textSecondary }]}
                numberOfLines={isLandscape ? 2 : 3}
              >
                {opt.description}
              </Text>

              {/* Color Swatch Preview */}
              <View style={styles.swatchRow}>
                {opt.swatches.map((color, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.swatchDot,
                      { backgroundColor: color, borderColor: `${theme.borderLight}80` },
                    ]}
                  />
                ))}
                {isSelected && (
                  <Text style={[styles.activePill, { color: accentColor }]}>
                    Active Preview
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 16,
  },
  headerWrap: {
    gap: 4,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  stepSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  cardsWrap: {
    gap: 12,
  },
  cardsWrapLandscape: {
    flexDirection: "row",
    gap: 10,
  },
  card: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  cardLandscape: {
    flex: 1,
    padding: 10,
    gap: 6,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  titleCol: {
    flex: 1,
    gap: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  cardSubtitle: {
    fontSize: 11,
  },
  selectionIndicator: {
    paddingLeft: 4,
  },
  cardDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  cardDescLandscape: {
    fontSize: 11,
    lineHeight: 14,
  },
  swatchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  swatchDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
  },
  activePill: {
    fontSize: 10.5,
    fontWeight: "700",
    marginLeft: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
