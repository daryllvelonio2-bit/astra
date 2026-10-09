import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";
import { DevTool, sizeLabel } from "../../services/devCategories";

/**
 * One tool line — the option the user acts on.
 *
 * Decluttered (chips cut): the name leads, then ONE muted line carries every
 * fact that used to be its own pill — requirement, size, large-download, and
 * the installed/included state — as plain text, followed by the tool's note (or
 * a manual tool's WHERE-to-get hint). The only control on the right is the
 * single action: Get for an installable tool, a Manual badge for a tool the app
 * cannot install. Installed/bundled rows read their state in the muted line, so
 * the old standalone green check is gone.
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
  const isManual = tool.install.kind === "manual";
  const isBundled = tool.install.kind === "bundled";
  // The actionable line: manual tools show WHERE to get it, everything else
  // shows what it is for.
  const detail = tool.install.kind === "manual" ? tool.install.hint : tool.note;
  // State as a plain word (was a green check circle).
  const state = isBundled ? "included" : installed === true ? "installed" : null;

  // Every former chip, folded into one muted line as plain text. Nothing that
  // changes a decision disappears — it stops competing as separate pills.
  const meta = [tool.requirement, sizeLabel(tool.size), tool.heavy ? "large download" : null, state]
    .filter((part): part is string => !!part)
    .join(" · ");

  const renderAction = () => {
    if (busy) {
      return <ActivityIndicator size={14} color={theme.accent} />;
    }
    if (isManual) {
      // The unmistakable action for a tool the app cannot install.
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
    if (isBundled || installed === true) {
      // Already reads "included"/"installed" on the muted line — no check pill.
      return null;
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
        <Text style={[styles.pkgName, { color: theme.textPrimary }]} numberOfLines={1}>
          {tool.name}
        </Text>
        <Text style={[styles.pkgMeta, { color: theme.textMuted }]} numberOfLines={2}>
          {meta}
          {detail ? ` — ${detail}` : ""}
        </Text>
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
  pkgName: { fontSize: 13, fontWeight: "700" },
  pkgMeta: { fontSize: 11, lineHeight: 14 },
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
