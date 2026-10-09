import React from "react";
import { View, Text, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";

/**
 * The look every Settings section shares (reference design):
 * a small accent icon in a rounded square, an uppercase title, and a muted
 * one-line subtitle describing what the section is for. Presentation only —
 * callers keep owning their own data/state.
 */
interface SettingsSectionHeaderProps {
  theme: ThemeColors;
  icon: any;
  title: string;
  subtitle: string;
  /** Overrides the icon-tile colour; defaults to the theme accent. */
  tone?: string;
  style?: StyleProp<ViewStyle>;
}

export function SettingsSectionHeader({ theme, icon, title, subtitle, tone, style }: SettingsSectionHeaderProps) {
  const color = tone || theme.accent;
  return (
    <View style={[styles.header, style]}>
      <View style={[styles.iconTile, { backgroundColor: `${color}1F`, borderColor: `${color}33` }]}>
        <Ionicons name={icon} size={14} color={color} />
      </View>
      <View style={styles.textCol}>
        <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
          {title.toUpperCase()}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textMuted }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  iconTile: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: { flex: 1 },
  title: { fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6 },
  subtitle: { fontSize: 10.5, marginTop: 1 },
});
