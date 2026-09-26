import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { ThemeColors } from "../../../theme/themeContext";
import { SHORTCUT_GROUPS, SHORTCUT_PRECEDENCE_NOTE } from "../../services/shortcutList";

interface ShortcutsSectionProps {
  theme: ThemeColors;
}

/** Read-only cheat sheet: every shortcut the app actually implements. */
export function ShortcutsSection({ theme }: ShortcutsSectionProps) {
  return (
    <View style={styles.container}>
      <Text style={[styles.note, { color: theme.textMuted }]}>{SHORTCUT_PRECEDENCE_NOTE}</Text>
      {SHORTCUT_GROUPS.map((group) => (
        <View key={group.title}>
          <Text style={[styles.groupTitle, { color: theme.textSecondary }]}>{group.title.toUpperCase()}</Text>
          {group.items.map((item) => (
            <View key={item.keys} style={[styles.row, { borderBottomColor: theme.border }]}>
              <View style={styles.keysCol}>
                {item.keys.split(" ").length > 1 ? (
                  <View style={styles.chord}>
                    {item.keys.split(" ").map((k, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <Text style={[styles.plus, { color: theme.textMuted }]}>+</Text>}
                        <View style={[styles.key, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
                          <Text style={[styles.keyText, { color: theme.textPrimary }]}>{k}</Text>
                        </View>
                      </React.Fragment>
                    ))}
                  </View>
                ) : (
                  <View style={[styles.key, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
                    <Text style={[styles.keyText, { color: theme.textPrimary }]}>{item.keys}</Text>
                  </View>
                )}
              </View>
              <View style={styles.actionCol}>
                <Text style={[styles.action, { color: theme.textPrimary }]}>{item.action}</Text>
                {item.touch && (
                  <Text style={[styles.touch, { color: theme.textMuted }]}>touch: {item.touch}</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 12 },
  note: { fontSize: 12, lineHeight: 17, marginBottom: 12 },
  groupTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, marginTop: 14, marginBottom: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  keysCol: { minWidth: 128 },
  chord: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  key: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 6,
  },
  keyText: { fontSize: 12, fontWeight: "700" },
  plus: { fontSize: 12, marginHorizontal: 3 },
  actionCol: { flex: 1 },
  action: { fontSize: 13, fontWeight: "600" },
  touch: { fontSize: 11, marginTop: 1 },
});
