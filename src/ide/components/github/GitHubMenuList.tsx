import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { dismissAppDialog, showAppDialog } from "../../services/appDialog";

/**
 * One themed overflow menu for the GitHub surface: a titled list of labelled
 * rows inside the shared app dialog. Every ⋯ button (repo header, Home header)
 * feeds this, so there is a single modal implementation and a single list look
 * instead of one per menu.
 */

export interface MenuItem {
  icon: string;
  label: string;
  hint?: string;
  destructive?: boolean;
  badge?: number;
  onPress: () => void;
}

/** Opens the dialog for these items. Closes itself before navigating. */
export function openMenu({ title, items }: { title: string; items: MenuItem[] }): void {
  showAppDialog({
    title,
    content: <MenuList items={items} />,
    buttons: [{ text: "Close", style: "cancel" }],
  });
}

export function MenuList({ items }: { items: MenuItem[] }) {
  const { theme } = useTheme();
  return (
    <View style={styles.list}>
      {items.map((item, index) => (
        <TouchableOpacity
          key={item.label}
          style={[
            styles.row,
            index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth },
          ]}
          activeOpacity={0.7}
          accessibilityLabel={item.label}
          onPress={() => {
            dismissAppDialog();
            item.onPress();
          }}
        >
          <Octicons
            name={item.icon as any}
            size={14}
            color={item.destructive ? theme.accentRed : theme.textSecondary}
          />
          <View style={styles.rowText}>
            <Text
              style={[styles.label, { color: item.destructive ? theme.accentRed : theme.textPrimary }]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
            {!!item.hint && (
              <Text style={[styles.hint, { color: theme.textMuted }]} numberOfLines={1}>
                {item.hint}
              </Text>
            )}
          </View>
          {!!item.badge && item.badge > 0 && (
            <Text style={[styles.badge, { color: theme.accentGold }]}>{item.badge}</Text>
          )}
          <Octicons name="chevron-right" size={12} color={theme.textMuted} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  rowText: { flex: 1, gap: 1, minWidth: 0 },
  label: { fontSize: 13.5, fontWeight: "700" },
  hint: { fontSize: 10.5 },
  badge: { fontSize: 11, fontWeight: "800" },
});
