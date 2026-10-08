import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../theme/themeContext";
import {
  ProjectTemplate,
  TemplateTool,
  missingTemplateTools,
  templateNeedsLabel,
  templateSizeLabel,
} from "../services/projectTemplates";

/**
 * The compact template step of New Project.
 *
 * Presentational only: it renders the catalogue as a wrapped chip row (Blank
 * first), the selected template's description, what it needs and — when a
 * runtime is missing — the app's existing one-tap Get button. It installs
 * nothing itself; CreateProjectModal owns the probe/install state.
 *
 * Landscape-friendly by construction: chips wrap, every text line is compact,
 * and nothing animates.
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

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>Template</Text>

      <View style={styles.chipWrap}>
        {templates.map((t) => {
          const isSelected = t.id === selected.id;
          const dim = !!t.manual;
          return (
            <TouchableOpacity
              key={t.id}
              style={[
                styles.chip,
                { backgroundColor: theme.bgTertiary, borderColor: theme.border },
                isSelected && { backgroundColor: `${theme.accent}22`, borderColor: theme.accent },
                dim && styles.chipDim,
              ]}
              onPress={() => onSelect(t.id)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={t.name}
            >
              {t.manual && <Ionicons name="lock-closed" size={10} color={theme.textMuted} style={styles.chipIcon} />}
              <Text
                style={[
                  styles.chipText,
                  { color: isSelected ? theme.accent : theme.textSecondary },
                  dim && { color: theme.textMuted },
                ]}
                numberOfLines={1}
              >
                {t.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Selected template summary */}
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
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipDim: { opacity: 0.55 },
  chipIcon: { marginRight: 4 },
  chipText: { fontSize: 12, fontWeight: "600" },
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
