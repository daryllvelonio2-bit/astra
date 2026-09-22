import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";
import { ProvisioningStatus } from "../../../../modules/linux-runner/src";
import { StageMeta } from "./environmentStages";

interface Props {
  st: StageMeta;
  status: ProvisioningStatus;
  isExpanded: boolean;
  onToggle: () => void;
  theme: ThemeColors;
}

export function EnvironmentStageCard({ st, status, isExpanded, onToggle, theme }: Props) {
  const isCurrent = status.isProvisioning && status.stageIndex === st.index;
  const isDone = status.isComplete || status.stageIndex > st.index;

  return (
    <View
      style={[
        styles.stageCard,
        {
          backgroundColor: theme.bgSecondary,
          borderColor: isCurrent
            ? theme.accent
            : isDone
            ? `${theme.accentGreen}40`
            : theme.border,
        },
      ]}
    >
      <TouchableOpacity style={styles.stageHeader} onPress={onToggle} activeOpacity={0.7}>
        <View style={styles.stageLeft}>
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
        </View>

        <View style={styles.stageRight}>
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
          <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color={theme.textMuted} />
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={[styles.packageContainer, { borderTopColor: theme.border }]}>
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stageCard: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  stageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
  },
  stageLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  titleCol: {
    flex: 1,
  },
  stageBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  stageNum: {
    fontSize: 11,
    fontWeight: "700",
  },
  stageTitle: {
    fontSize: 12,
    fontWeight: "600",
  },
  stageDesc: {
    fontSize: 10,
    marginTop: 1,
  },
  stageRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  stageStateText: {
    fontSize: 11,
    fontWeight: "600",
  },
  packageContainer: {
    borderTopWidth: 1,
    padding: 10,
    gap: 6,
  },
  packageTitle: {
    fontSize: 10,
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
    fontSize: 10,
    fontFamily: "monospace",
  },
});
