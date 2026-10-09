import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TemplateLogo } from "./projectIcons";
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
 * Presentational only: it renders the catalogue as a flat, self-scrolling list
 * of option rows (Blank first, checked by default), each led by a fixed-size
 * scan glyph, then the selected template's description and — when a runtime is
 * missing — the app's existing one-tap Get button. No wrapping card; each row
 * is its own tap target, divided by spacing, and the selected template's
 * summary is separated by a hairline rule instead of another box. It installs
 * nothing itself; CreateProjectModal owns the probe / install state and reads
 * the same single `selectedId` this picker writes.
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
 * the names. Brand marks are real brand logos from ./projectIcons, sourced from
 * against the installed glyph map before use; templates the font has no brand
 * mark for (Blank, Static site, Next.js, Svelte, Expo, Flutter) get a clear
 * generic glyph instead. Kept here rather than in projectTemplates.ts so the
 * pure, import-free catalogue stays pure; FALLBACK covers any future id.
 */



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
      <Text style={[styles.label, { color: theme.textMuted }]}>TEMPLATE</Text>

      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={styles.listContent}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {templates.map((t) => {
          const isSelected = t.id === selected.id;
          const disabled = !!t.manual;
          return (
            <TouchableOpacity
              key={t.id}
              style={[
                styles.row,
                { backgroundColor: theme.bgSecondary, borderColor: theme.border },
                isSelected && { backgroundColor: `${theme.accent}14`, borderColor: theme.accent },
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
                <TemplateLogo
                  id={t.id}
                  size={22}
                  theme={theme}
                  color={isSelected ? theme.accent : theme.textSecondary}
                />
              </View>
              <Ionicons
                name={isSelected ? "checkbox" : "square-outline"}
                size={18}
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
                  {t.description ? t.description : null}
                </Text>
                {disabled && (
                  <View style={styles.manualRow}>
                    <Ionicons name="lock-closed" size={10} color={theme.accentGold} />
                    <Text style={[styles.manualText, { color: theme.accentGold }]} numberOfLines={1}>
                      Manual — {t.manualReason}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Selected template summary — reads the same single selection as before. */}
      <View style={[styles.summary, { borderTopColor: theme.border }]}>
        <Text style={[styles.desc, { color: theme.textSecondary }]} numberOfLines={1}>
          {selected.description ? selected.description : null}
        </Text>

        {selected.manual ? (
          <View style={styles.needsRow}>
            <Ionicons name="lock-closed" size={12} color={theme.accentGold} />
            <Text style={[styles.needsText, { color: theme.accentGold }]} numberOfLines={1}>
              Manual — {selected.manualReason}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.needsRow}>
              <Ionicons
                name={selected.tools.length === 0 ? "checkmark-circle" : "cube-outline"}
                size={12}
                color={selected.tools.length === 0 ? theme.accentGreen : theme.textMuted}
              />
              <Text style={[styles.needsText, { color: theme.textMuted }]} numberOfLines={1}>
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
          <Ionicons name="download-outline" size={13} color={theme.accent} />
          <Text style={[styles.getBtnText, { color: theme.accent }]}>Get</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 14 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 6 },
  // Flat list of option rows: each row is its own bordered tap target, divided
  // by spacing — no wrapping card.
  listScroll: { maxHeight: LIST_MAX_HEIGHT },
  listContent: { gap: 6, paddingBottom: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rowDisabled: { opacity: 0.5 },
  // Fixed-width glyph gutter so every row's name starts at the same x. The row's
  // existing alignItems:"center" vertically centres the glyph on the body block.
  rowIcon: { width: 22, alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, gap: 1 },
  rowName: { fontSize: 13, fontWeight: "700" },
  rowDesc: { fontSize: 11 },
  manualRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  manualText: { fontSize: 10.5, flex: 1 },
  // Flat summary under a hairline rule — no card, no background box.
  summary: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  desc: { fontSize: 12 },
  needsRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  needsText: { fontSize: 11 },
  missingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    marginTop: 2,
  },
  getBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  getBtnDisabled: { opacity: 0.4 },
  getBtnText: { fontSize: 11.5, fontWeight: "700" },
});
