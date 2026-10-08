import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { ThemeColors } from "../../theme/themeContext";
import {
  ProjectTemplate,
  TemplateTool,
  BLANK_TEMPLATE_ID,
  missingTemplateTools,
  templateNeedsLabel,
  templateSizeLabel,
} from "../services/projectTemplates";

/**
 * The template step of New Project.
 *
 * Presentational only: it renders the catalogue as a vertical list of checkbox
 * rows (Blank first, checked by default), each led by a fixed-size scan glyph
 * (brand mark or generic — see TEMPLATE_ICONS), then the selected template's
 * description, what it needs and — when a runtime is missing — the app's
 * existing one-tap Get button. It installs nothing itself; CreateProjectModal
 * owns the probe / install state and reads the same single `selectedId` this
 * picker writes.
 *
 * Landscape-friendly by construction: the list is a bounded, self-scrolling
 * viewport (mirrors MyReposList's sized mode) so it never fights the modal's
 * own ScrollView or pushes Create off-screen; every text line is compact and
 * nothing animates.
 */

interface ProjectTemplatePickerProps {
  templates: ProjectTemplate[];
  selectedId: string;
  onSelect: (id: string) => void;
  theme: ThemeColors;
  /** DevTool id -> installed. Only ids the guest answered for appear. */
  installed: Record<string, boolean>;
  probing: boolean;
  /** DevTool id -> install in progress. */
  installing: Record<string, boolean>;
  onInstall: (devToolId: string) => void;
  /** True while base provisioning runs — installs are disabled (apt lock). */
  provisioningActive?: boolean;
}

/**
 * Bounded height for the row list, in dp. Keeps the New Project modal from
 * growing past a landscape phone's fold: the list scrolls inside itself and the
 * modal's own ScrollView still reaches the Create button below it.
 */
const LIST_MAX_HEIGHT = 260;

/**
 * Row leading glyph, keyed by template id — a scan aid so the list reads without
 * the names. Brand marks are MaterialCommunityIcons glyphs, every one verified
 * against the installed glyph map before use; templates the font has no brand
 * mark for (Blank, Static site, Next.js, Svelte, Expo, Flutter) get a clear
 * generic glyph instead. Kept here rather than in projectTemplates.ts so the
 * pure, import-free catalogue stays pure; FALLBACK covers any future id.
 */
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const TEMPLATE_ICONS: Record<string, IconName> = {
  blank: "folder-plus-outline",
  static: "web",
  laravel: "laravel",
  react: "react",
  next: "page-next-outline",
  vue: "vuejs",
  svelte: "file-code-outline",
  express: "nodejs",
  flask: "language-python",
  go: "language-go",
  rust: "language-rust",
  ruby: "language-ruby",
  expo: "cellphone",
  flutter: "tablet-cellphone",
};

const FALLBACK_TEMPLATE_ICON: IconName = "file-code-outline";

export function ProjectTemplatePicker({
  templates,
  selectedId,
  onSelect,
  theme,
  installed,
  probing,
  installing,
  onInstall,
  provisioningActive = false,
}: ProjectTemplatePickerProps) {
  const selected = templates.find((t) => t.id === selectedId) || templates[0];
  const missing = missingTemplateTools(selected, installed);
  const sizeLabel = templateSizeLabel(selected);

  // Single choice expressed as checkboxes: one `selectedId` means exactly one
  // row can be checked, so selecting a row unchecks every other one by
  // construction. Tapping the already-checked row toggles it back to Blank —
  // the always-present default; Blank itself has nothing to fall back to, so it
  // stays checked. Manual templates can never be checked.
  const handleRowPress = (t: ProjectTemplate) => {
    if (t.manual) return;
    if (t.id === selected.id) {
      if (t.id !== BLANK_TEMPLATE_ID) onSelect(BLANK_TEMPLATE_ID);
      return;
    }
    onSelect(t.id);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>Template</Text>

      <View style={[styles.list, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
        <ScrollView
          style={styles.listScroll}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {templates.map((t, idx) => {
            const isSelected = t.id === selected.id;
            const disabled = !!t.manual;
            return (
              <TouchableOpacity
                key={t.id}
                style={[
                  styles.row,
                  idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                  isSelected && { backgroundColor: `${theme.accent}18`, borderLeftColor: theme.accent },
                  disabled && styles.rowDisabled,
                ]}
                onPress={() => handleRowPress(t)}
                disabled={disabled}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected, disabled }}
                accessibilityLabel={rowLabel(t)}
              >
                <View style={styles.rowIcon}>
                  <MaterialCommunityIcons
                    name={TEMPLATE_ICONS[t.id] ?? FALLBACK_TEMPLATE_ICON}
                    size={22}
                    color={isSelected ? theme.accent : theme.textSecondary}
                  />
                </View>
                <Ionicons
                  name={isSelected ? "checkbox" : "square-outline"}
                  size={20}
                  color={isSelected ? theme.accent : theme.textMuted}
                />
                <View style={styles.rowBody}>
                  <Text
                    style={[styles.rowName, { color: isSelected ? theme.accent : theme.textPrimary }]}
                    numberOfLines={1}
                  >
                    {t.name}
                  </Text>
                  <Text style={[styles.rowDesc, { color: theme.textMuted }]} numberOfLines={1}>
                    {t.description}
                  </Text>
                  {disabled && (
                    <View style={styles.manualRow}>
                      <Ionicons name="lock-closed" size={10} color={theme.accentGold} />
                      <Text style={[styles.manualText, { color: theme.accentGold }]} numberOfLines={2}>
                        Manual — {t.manualReason}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Selected template summary — reads the same single selection as before. */}
      <View style={[styles.summary, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}>
        <Text style={[styles.desc, { color: theme.textPrimary }]}>{selected.description}</Text>

        {selected.manual ? (
          <View style={styles.needsRow}>
            <Ionicons name="lock-closed" size={12} color={theme.accentGold} />
            <Text style={[styles.needsText, { color: theme.accentGold }]} numberOfLines={2}>
              Manual — {selected.manualReason}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.needsRow}>
              <Ionicons
                name={selected.tools.length === 0 ? "checkmark-circle" : "cube-outline"}
                size={12}
                color={selected.tools.length === 0 ? theme.accentGreen : theme.textSecondary}
              />
              <Text style={[styles.needsText, { color: theme.textSecondary }]} numberOfLines={1}>
                {templateNeedsLabel(selected)}
                {sizeLabel ? ` · ${sizeLabel}` : ""}
              </Text>
            </View>

            {probing ? (
              <View style={styles.needsRow}>
                <ActivityIndicator size={11} color={theme.textMuted} />
                <Text style={[styles.needsText, { color: theme.textMuted }]} numberOfLines={1}>
                  Checking what is installed…
                </Text>
              </View>
            ) : missing.length > 0 ? (
              missing.map((tool) => (
                <MissingToolRow
                  key={tool.id}
                  tool={tool}
                  theme={theme}
                  installing={!!installing[devToolIdOf(tool)]}
                  disabled={provisioningActive}
                  onInstall={onInstall}
                />
              ))
            ) : selected.tools.length > 0 ? (
              <View style={styles.needsRow}>
                <Ionicons name="checkmark-circle" size={12} color={theme.accentGreen} />
                <Text style={[styles.needsText, { color: theme.accentGreen }]} numberOfLines={1}>
                  Everything it needs is installed
                </Text>
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

/** Screen-reader label: name, description, and the manual reason when disabled. */
function rowLabel(t: ProjectTemplate): string {
  const base = `${t.name}. ${t.description}`;
  return t.manual ? `${base} Unavailable: ${t.manualReason}` : base;
}

function devToolIdOf(tool: TemplateTool): string {
  return tool.install.kind === "apt" ? tool.install.devToolId : "";
}

function MissingToolRow({
  tool,
  theme,
  installing,
  disabled,
  onInstall,
}: {
  tool: TemplateTool;
  theme: ThemeColors;
  installing: boolean;
  disabled: boolean;
  onInstall: (devToolId: string) => void;
}) {
  const devToolId = devToolIdOf(tool);
  const size = tool.size === "unknown" ? "size unknown" : `≈${tool.size} MB`;
  return (
    <View style={[styles.missingRow, { borderColor: `${theme.accentGold}44` }]}>
      <Ionicons name="alert-circle-outline" size={12} color={theme.accentGold} />
      <Text style={[styles.needsText, { color: theme.textSecondary, flex: 1 }]} numberOfLines={1}>
        {tool.name} — not installed yet ({size})
      </Text>
      {installing ? (
        <ActivityIndicator size={13} color={theme.accent} />
      ) : (
        <TouchableOpacity
          style={[
            styles.getBtn,
            { backgroundColor: `${theme.accent}15`, borderColor: `${theme.accent}40` },
            disabled && styles.getBtnDisabled,
          ]}
          onPress={() => onInstall(devToolId)}
          disabled={disabled}
          activeOpacity={0.7}
          accessibilityLabel={`Install ${tool.name}`}
        >
          <Ionicons name="download-outline" size={12} color={theme.accent} />
          <Text style={[styles.getBtnText, { color: theme.accent }]}>Get</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  // Grouped card, matching the settings rows: one bordered, rounded container
  // with hairline separators between rows.
  list: { borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  listScroll: { maxHeight: LIST_MAX_HEIGHT },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    // Reserve the accent-mark gutter on every row so checking one does not
    // shift its content by the border width. "transparent" is not a theme color.
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
  },
  rowDisabled: { opacity: 0.5 },
  // Fixed-width glyph gutter so every row's name starts at the same x. The row's
  // existing alignItems:"center" vertically centres the glyph on the body block.
  rowIcon: { width: 22, alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, gap: 2 },
  rowName: { fontSize: 13, fontWeight: "600" },
  rowDesc: { fontSize: 11, lineHeight: 15 },
  manualRow: { flexDirection: "row", alignItems: "flex-start", gap: 4, marginTop: 2 },
  manualText: { fontSize: 10.5, lineHeight: 14, flex: 1 },
  summary: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
  },
  desc: { fontSize: 12.5, lineHeight: 17 },
  needsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 1 },
  needsText: { fontSize: 11, lineHeight: 15 },
  missingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    marginTop: 3,
  },
  getBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  getBtnDisabled: { opacity: 0.4 },
  getBtnText: { fontSize: 11, fontWeight: "700" },
});
