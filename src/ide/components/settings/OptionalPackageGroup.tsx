import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";
import { OptionalGroup, OptionalPackage } from "../../services/optionalPackages";

/**
 * One group of installable packages, rendered FLAT inside the Toolchain
 * Downloads container: a quiet title row, then the package rows separated by
 * hairlines. No per-group card and no per-row card — the parent block owns the
 * single rounded border.
 *
 * The row anatomy is untouched: the package name leads, ONE muted line carries
 * the apt names, the large-download flag and the installed state as plain text,
 * and the only control is the single Get action (or a spinner while busy).
 * Nothing here collapses — every package is visible without a tap.
 */

interface OptionalPackageGroupProps {
  group: OptionalGroup;
  theme: ThemeColors;
  installed: Record<string, boolean>;
  busy: Record<string, boolean>;
  groupBusy: boolean;
  probing: boolean;
  provisioningActive: boolean;
  /** First group in the block — no hairline rule above it. */
  isFirst: boolean;
  onInstallOne: (pkg: OptionalPackage) => void;
  onInstallGroup: (group: OptionalGroup) => void;
}

export function OptionalPackageGroup({
  group,
  theme,
  installed,
  busy,
  groupBusy,
  probing,
  provisioningActive,
  isFirst,
  onInstallOne,
  onInstallGroup,
}: OptionalPackageGroupProps) {
  const doneCount = group.packages.filter((p) => installed[p.id]).length;
  const allDone = doneCount === group.packages.length;

  return (
    <View
      style={[
        styles.group,
        isFirst ? styles.groupFirst : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
      ]}
    >
      <View style={styles.groupHeader}>
        <View style={[styles.groupBadge, { backgroundColor: `${theme.accent}18` }]}>
          <Ionicons name={group.icon as any} size={15} color={theme.accent} />
        </View>
        <View style={styles.titleCol}>
          <Text style={[styles.groupTitle, { color: theme.textPrimary }]} numberOfLines={1}>
            {group.title}
          </Text>
          <Text style={[styles.groupDesc, { color: theme.textMuted }]} numberOfLines={1}>
            {group.blurb}
          </Text>
        </View>
        {probing ? (
          <ActivityIndicator size={12} color={theme.textMuted} />
        ) : (
          <Text style={[styles.groupCount, { color: allDone ? theme.accentGreen : theme.textMuted }]}>
            {allDone ? "All installed" : `${doneCount}/${group.packages.length}`}
          </Text>
        )}
      </View>

      {group.packages.map((pkg, idx) => {
        const isInstalled = !!installed[pkg.id];
        const isBusy = !!busy[pkg.id];
        // Same chip treatment as the dependencies list: the package names, the
        // large-download flag and the installed state fold into one plain-text
        // muted line instead of three separate pills.
        const meta = [pkg.apt.join(" "), pkg.heavy ? "large download" : null, isInstalled ? "installed" : null]
          .filter((part): part is string => !!part)
          .join(" · ");
        return (
          <View
            key={pkg.id}
            style={[styles.pkgRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
          >
            <View style={styles.pkgInfo}>
              <Text style={[styles.pkgName, { color: theme.textPrimary }]} numberOfLines={1}>
                {pkg.name}
              </Text>
              <Text style={[styles.pkgDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                {meta} — {pkg.desc}
              </Text>
            </View>
            <View style={styles.pkgAction}>
              {isBusy || groupBusy ? (
                <ActivityIndicator size={14} color={theme.accent} />
              ) : isInstalled ? (
                // Reads "installed" on the muted line — no green check pill.
                null
              ) : (
                <TouchableOpacity
                  style={[
                    styles.installBtn,
                    {
                      backgroundColor: `${theme.accent}15`,
                      borderColor: `${theme.accent}40`,
                      opacity: provisioningActive ? 0.4 : 1,
                    },
                  ]}
                  onPress={() => onInstallOne(pkg)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="download-outline" size={13} color={theme.accent} />
                  <Text style={[styles.installText, { color: theme.accent }]}>Get</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}

      {!allDone && !probing && (
        <TouchableOpacity
          style={[
            styles.installAllBtn,
            {
              backgroundColor: `${theme.accent}12`,
              borderColor: `${theme.accent}30`,
              opacity: provisioningActive || groupBusy ? 0.5 : 1,
            },
          ]}
          onPress={() => onInstallGroup(group)}
          disabled={provisioningActive || groupBusy}
          activeOpacity={0.7}
        >
          {groupBusy ? (
            <ActivityIndicator size={13} color={theme.accent} />
          ) : (
            <Ionicons name="albums-outline" size={13} color={theme.accent} />
          )}
          <Text style={[styles.installAllText, { color: theme.accent }]}>
            Install all missing ({group.packages.length - doneCount})
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: 10, paddingTop: 10 },
  groupFirst: { paddingTop: 2 },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 4 },
  groupBadge: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  titleCol: { flex: 1 },
  groupTitle: { fontSize: 13, fontWeight: "700" },
  groupDesc: { fontSize: 10, marginTop: 1 },
  groupCount: { fontSize: 11, fontWeight: "600" },
  pkgRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 8 },
  pkgInfo: { flex: 1, gap: 3 },
  pkgName: { fontSize: 12.5, fontWeight: "700" },
  pkgDesc: { fontSize: 11, lineHeight: 15 },
  pkgAction: { minWidth: 30, alignItems: "flex-end", justifyContent: "center", paddingTop: 2 },
  installBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  installText: { fontSize: 11, fontWeight: "700" },
  installAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    marginTop: 8,
  },
  installAllText: { fontSize: 12, fontWeight: "700" },
});
