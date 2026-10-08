import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";
import { DevTool, sizeLabel } from "../../services/devCategories";

/**
 * One tool line — the option the user acts on. The name leads at the largest
 * type, the size/requirement chips are quiet metadata, and the one-line note
 * (or a manual tool's WHERE-to-get hint) sits muted below. The Get button is
 * the accent tap target; installed tools show a green check instead.
 */

interface DependencyToolRowProps {
  tool: DevTool;
  theme: ThemeColors;
  /** undefined = not checked yet; true/false = probed. */
  installed: boolean | undefined;
  busy: boolean;
  /** True while base provisioning runs — installs disabled (apt lock). */
  provisioningDisabled: boolean;
  onInstall: (tool: DevTool) => void;
}

export function DependencyToolRow({
  tool,
  theme,
  installed,
  busy,
  provisioningDisabled,
  onInstall,
}: DependencyToolRowProps) {
  // The actionable line: manual tools show WHERE to get it, everything else
  // shows what it is for.
  const detail = tool.install.kind === "manual" ? tool.install.hint : tool.note;

  const renderAction = () => {
    if (busy) {
      return <ActivityIndicator size={14} color={theme.accent} />;
    }
    if (tool.install.kind === "bundled") {
      return (
        <StatusPill
          theme={theme}
          icon="checkmark"
          label="Included"
          fg={theme.textSecondary}
          border={theme.border}
        />
      );
    }
    if (tool.install.kind === "manual") {
      return (
        <StatusPill
          theme={theme}
          icon="build-outline"
          label="Manual"
          fg={theme.accentGold}
          border={`${theme.accentGold}55`}
        />
      );
    }
    if (installed === true) {
      return <Ionicons name="checkmark-circle" size={20} color={theme.accentGreen} />;
    }
    return (
      <TouchableOpacity
        style={[
          styles.installBtn,
          {
            backgroundColor: `${theme.accent}15`,
            borderColor: `${theme.accent}40`,
            opacity: provisioningDisabled ? 0.4 : 1,
          },
        ]}
        onPress={() => onInstall(tool)}
        disabled={provisioningDisabled}
        activeOpacity={0.7}
        accessibilityLabel={`Install ${tool.name}`}
      >
        <Ionicons name="download-outline" size={13} color={theme.accent} />
        <Text style={[styles.installText, { color: theme.accent }]}>Get</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.pkgRow}>
      <View style={styles.pkgInfo}>
        <View style={styles.pkgNameRow}>
          <Text style={[styles.pkgName, { color: theme.textPrimary }]} numberOfLines={1}>
            {tool.name}
          </Text>
          <View style={[styles.aptChip, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}>
            <Text style={[styles.aptChipText, { color: theme.textSecondary }]}>
              {sizeLabel(tool.size)}
            </Text>
          </View>
          <View
            style={[
              styles.aptChip,
              {
                backgroundColor: tool.requirement === "required" ? `${theme.accent}18` : theme.bgTertiary,
                borderColor: tool.requirement === "required" ? `${theme.accent}40` : theme.border,
              },
            ]}
          >
            <Text
              style={[
                styles.aptChipText,
                { color: tool.requirement === "required" ? theme.accent : theme.textMuted },
              ]}
            >
              {tool.requirement}
            </Text>
          </View>
          {tool.heavy && (
            <View style={[styles.heavyChip, { backgroundColor: `${theme.accentGold}18`, borderColor: `${theme.accentGold}40` }]}>
              <Text style={[styles.heavyChipText, { color: theme.accentGold }]}>LARGE</Text>
            </View>
          )}
        </View>
        {!!detail && (
          <Text style={[styles.pkgDesc, { color: theme.textMuted }]} numberOfLines={1}>
            {detail}
          </Text>
        )}
      </View>

      <View style={styles.pkgAction}>{renderAction()}</View>
    </View>
  );
}

function StatusPill({
  theme,
  icon,
  label,
  fg,
  border,
}: {
  theme: ThemeColors;
  icon: any;
  label: string;
  fg: string;
  border: string;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: theme.bgTertiary, borderColor: border }]}>
      <Ionicons name={icon} size={12} color={fg} />
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pkgRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pkgInfo: { flex: 1, gap: 2 },
  pkgNameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5 },
  pkgName: { fontSize: 13, fontWeight: "700" },
  aptChip: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  aptChipText: { fontSize: 9.5, fontFamily: "monospace" },
  heavyChip: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  heavyChipText: { fontSize: 9, fontWeight: "800" },
  pkgDesc: { fontSize: 11 },
  pkgAction: { minWidth: 30, alignItems: "flex-end", justifyContent: "center" },
  installBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  installText: { fontSize: 11.5, fontWeight: "700" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  pillText: { fontSize: 10.5, fontWeight: "700" },
});
