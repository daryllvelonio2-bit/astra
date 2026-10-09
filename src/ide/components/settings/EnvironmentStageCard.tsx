import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";
import { ProvisioningStatus } from "../../../../modules/linux-runner/src";
import { StageMeta } from "./environmentStages";

/**
 * One provisioning stage as a FLAT row inside the "Provisioning Stages"
 * container: a state badge, the stage title/desc and its state word on the
 * header line, then the stage's packages (unchanged chip treatment) below.
 *
 * No card of its own and no collapse — the parent owns the single border and
 * every stage's content is on screen straight away.
 */

interface Props {
  st: StageMeta;
  status: ProvisioningStatus;
  theme: ThemeColors;
  /** First row in the container — no hairline rule above it. */
  isFirst: boolean;
}

export function EnvironmentStageCard({ st, status, theme, isFirst }: Props) {
  const isCurrent = status.isProvisioning && status.stageIndex === st.index;
  const isDone = status.isComplete || status.stageIndex > st.index;

  return (
    <View
      style={[
        styles.stageRow,
        !isFirst && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
      ]}
    >
      <View style={styles.stageHeader}>
        <View
          style={[
            styles.stageBadge,
            {
              backgroundColor: isDone
                ? `${theme.accentGreen}20`
                : isCurrent
                ? `${theme.accent}20`
                : theme.bgTertiary,
            },
          ]}
        >
          {isDone ? (
            <Ionicons name="checkmark" size={14} color={theme.accentGreen} />
          ) : isCurrent ? (
            <ActivityIndicator size={12} color={theme.accent} />
          ) : (
            <Text style={[styles.stageNum, { color: theme.textMuted }]}>{st.index}</Text>
          )}
        </View>

        <View style={styles.titleCol}>
          <Text style={[styles.stageTitle, { color: isCurrent ? theme.accent : theme.textPrimary }]}>
            {st.title}
          </Text>
          <Text style={[styles.stageDesc, { color: theme.textMuted }]} numberOfLines={1}>
            {st.desc}
          </Text>
        </View>

        <Text
          style={[
            styles.stageStateText,
            {
              color: isDone
                ? theme.accentGreen
                : isCurrent
                ? theme.accent
                : theme.textMuted,
            },
          ]}
        >
          {isDone ? "Done" : isCurrent ? "In Progress" : "Queued"}
        </Text>
      </View>

      <View style={styles.packageContainer}>
        <Text style={[styles.packageTitle, { color: theme.textMuted }]}>
          Packages in this stage:
        </Text>
        <View style={styles.chipRow}>
          {st.packages.map((pkg) => {
            const isTarget = status.currentPackage === pkg;
            return (
              <View
                key={pkg}
                style={[
                  styles.chip,
                  {
                    backgroundColor: isTarget ? `${theme.accent}30` : theme.bgTertiary,
                    borderColor: isTarget ? theme.accent : theme.border,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: isTarget ? theme.accent : theme.textSecondary }]}>
                  {pkg}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stageRow: { paddingVertical: 10 },
  stageHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  titleCol: { flex: 1 },
  stageBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  stageNum: {
    fontSize: 10.5,
    fontWeight: "700",
  },
  stageTitle: {
    fontSize: 11.5,
    fontWeight: "600",
  },
  stageDesc: {
    fontSize: 9.5,
    marginTop: 1,
  },
  stageStateText: {
    fontSize: 10.5,
    fontWeight: "600",
  },
  packageContainer: {
    marginTop: 6,
    gap: 6,
  },
  packageTitle: {
    fontSize: 9.5,
    fontWeight: "600",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 9.5,
    fontFamily: "monospace",
  },
});
