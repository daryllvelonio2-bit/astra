import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { ThemeColors } from "../../../theme/themeContext";
import { SHORTCUT_GROUPS, SHORTCUT_PRECEDENCE_NOTE } from "../../services/shortcutList";
import { SettingsSectionHeader } from "./SettingsSectionHeader";

interface ShortcutsSectionProps {
  theme: ThemeColors;
}

/** Factual one-liners for each group — read straight off its own entries. */
const GROUP_BLURBS: Record<string, string> = {
  Tabs: "Switch the active workspace tab.",
  "Find & replace": "Search and replace inside the editor.",
  Edit: "Core text editing commands.",
  "Lines & cursors": "Move, copy and delete lines; add cursors.",
  Go: "Jump around the current file.",
};

const GROUP_ICONS: Record<string, any> = {
  Tabs: "albums-outline",
  "Find & replace": "search-outline",
  Edit: "create-outline",
  "Lines & cursors": "reorder-four-outline",
  Go: "navigate-outline",
};

/** Read-only cheat sheet: every shortcut the app actually implements. */
export function ShortcutsSection({ theme }: ShortcutsSectionProps) {
  return (
    <View style={styles.container}>
      <SettingsSectionHeader
        theme={theme}
        icon="key-outline"
        title="Keyboard Shortcuts"
        subtitle="Every shortcut the app implements."
      />
      <Text style={[styles.note, { color: theme.textMuted }]}>{SHORTCUT_PRECEDENCE_NOTE}</Text>

      {SHORTCUT_GROUPS.map((group) => (
        <View key={group.title} style={styles.group}>
          <SettingsSectionHeader
            theme={theme}
            icon={GROUP_ICONS[group.title] ?? "keypad-outline"}
            title={group.title}
            subtitle={GROUP_BLURBS[group.title] ?? "Shortcuts in this group."}
          />
          <View style={[styles.card, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
            {group.items.map((item, idx) => (
              <View
                key={item.keys}
                style={[styles.row, idx > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}
              >
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
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 12, gap: 4 },
  note: { fontSize: 12, lineHeight: 17, marginBottom: 4 },
  group: { marginTop: 4 },
  card: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
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
