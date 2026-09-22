import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AstraLogo } from "../AstraLogo";
import { ThemeColors } from "../../../theme/themeContext";
import {
  getProvisioningStatus,
  startProvisioning,
  cancelProvisioning,
  addProvisioningListener,
  isAutoProvisionEnabled,
  setAutoProvisionEnabled,
  ProvisioningStatus,
  DEFAULT_PROVISIONING_STATUS,
} from "../../../../modules/linux-runner/src";
import { STAGES } from "./environmentStages";
import { EnvironmentStageCard } from "./EnvironmentStageCard";
import { OptionalPackagesSection } from "./OptionalPackagesSection";
import { OpencodeRepairCard } from "./OpencodeRepairCard";

interface EnvironmentSectionProps {
  theme: ThemeColors;
}

export function EnvironmentSection({ theme }: EnvironmentSectionProps) {
  const [status, setStatus] = useState<ProvisioningStatus>(DEFAULT_PROVISIONING_STATUS);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [expandedStage, setExpandedStage] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [autoDownload, setAutoDownload] = useState(false);
  const pollTimerRef = useRef<any>(null);

  const refreshStatus = () => {
    try {
      const s = getProvisioningStatus();
      setStatus(s);
    } catch (_) {}
  };

  useEffect(() => {
    refreshStatus();
    try {
      setAutoDownload(isAutoProvisionEnabled());
    } catch (_) {}

    const sub = addProvisioningListener((newStatus) => {
      setStatus(newStatus);
      if (newStatus.lastOutput) {
        setLogs((prev) => {
          const next = [...prev, newStatus.lastOutput];
          return next.slice(-25);
        });
      }
    });

    pollTimerRef.current = setInterval(() => {
      refreshStatus();
    }, 3000);

    return () => {
      if (sub?.remove) sub.remove();
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const handleCancel = () => {
    Alert.alert(
      "Cancel Provisioning",
      "Stop background toolchain downloads? Any active compile process tree will be terminated.",
      [
        { text: "Keep Running", style: "cancel" },
        {
          text: "Stop Now",
          style: "destructive",
          onPress: () => {
            setIsBusy(true);
            try {
              cancelProvisioning();
              refreshStatus();
            } finally {
              setIsBusy(false);
            }
          },
        },
      ]
    );
  };

  const handleStartRestart = async () => {
    setIsBusy(true);
    try {
      await startProvisioning();
      refreshStatus();
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleAutoDownload = (value: boolean) => {
    setAutoDownload(value);
    try {
      setAutoProvisionEnabled(value);
    } catch (_) {}
    if (!value) {
      Alert.alert(
        "Auto-download Off",
        "The base toolchain will no longer download by itself. Install what you need from the Required list below — every download stays your choice."
      );
    }
  };

  const calculateProgress = (): number => {
    if (status.isComplete) return 100;
    if (!status.isProvisioning && status.stageIndex === 0) return 0;
    const completedStages = Math.max(0, status.stageIndex - 1);
    const total = status.totalStages || STAGES.length;
    const base = (completedStages / total) * 85;
    const stageBump = status.attempt > 0 ? 8 : 4;
    return Math.min(96, Math.round(base + stageBump));
  };

  const progressPct = calculateProgress();

  return (
    <View style={styles.container}>
      {/* 0. Auto-download toggle */}
      <View style={[styles.autoRow, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
        <View style={styles.autoInfo}>
          <Text style={[styles.autoTitle, { color: theme.textPrimary }]}>
            Auto-download toolchain
          </Text>
          <Text style={[styles.autoDesc, { color: theme.textSecondary }]}>
            {autoDownload
              ? "Base packages download on launch"
              : "Off — you install from the lists below"}
          </Text>
        </View>
        <Switch
          value={autoDownload}
          onValueChange={handleToggleAutoDownload}
          trackColor={{ false: theme.border, true: `${theme.accentGreen}80` }}
          thumbColor={autoDownload ? theme.accentGreen : theme.textMuted}
        />
      </View>

      {/* 1. opencode CLI health + postinstall repair */}
      <OpencodeRepairCard theme={theme} />

      {/* 2. Main Status Banner */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.bgSecondary,
            borderColor: status.isProvisioning
              ? theme.accent
              : status.isComplete
              ? theme.accentGreen
              : theme.border,
          },
        ]}
      >
        <View style={styles.statusRow}>
          <View style={styles.statusLeft}>
            <View
              style={[
                styles.iconCircle,
                {
                  backgroundColor: status.isProvisioning
                    ? `${theme.accent}20`
                    : status.isComplete
                    ? `${theme.accentGreen}20`
                    : `${theme.textMuted}20`,
                },
              ]}
            >
              {status.isProvisioning ? (
                <AstraLogo width={26} height={26} />
              ) : status.isComplete ? (
                <Ionicons name="checkmark-circle" size={22} color={theme.accentGreen} />
              ) : (
                <Ionicons name="cube-outline" size={20} color={theme.textMuted} />
              )}
            </View>

            <View style={styles.statusInfo}>
              <View style={styles.badgeRow}>
                <Text style={[styles.statusTitle, { color: theme.textPrimary }]}>
                  {status.isComplete
                    ? "Toolchain Ready"
                    : status.isProvisioning
                    ? `Stage ${status.stageIndex}/${status.totalStages || STAGES.length}: ${status.stageName}`
                    : "Environment Idle"}
                </Text>
                <View
                  style={[
                    styles.pillBadge,
                    {
                      backgroundColor: status.isComplete
                        ? `${theme.accentGreen}20`
                        : status.isProvisioning
                        ? `${theme.accent}20`
                        : `${theme.textMuted}20`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.pillText,
                      {
                        color: status.isComplete
                          ? theme.accentGreen
                          : status.isProvisioning
                          ? theme.accent
                          : theme.textMuted,
                      },
                    ]}
                  >
                    {status.isComplete
                      ? "Ready"
                      : status.isProvisioning
                      ? "Downloading"
                      : "Unprovisioned"}
                  </Text>
                </View>
              </View>

              <Text style={[styles.statusDesc, { color: theme.textSecondary }]} numberOfLines={1}>
                {status.currentPackage
                  ? `Active package: ${status.currentPackage}`
                  : status.isComplete
                  ? "All 41 developer packages verified"
                  : status.lastOutput || "Debian Linux PRoot Sandbox"}
              </Text>
            </View>
          </View>

          <View style={styles.percentContainer}>
            <Text
              style={[
                styles.percentText,
                {
                  color: status.isComplete
                    ? theme.accentGreen
                    : status.isProvisioning
                    ? theme.accent
                    : theme.textMuted,
                },
              ]}
            >
              {progressPct}%
            </Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={[styles.progressTrack, { backgroundColor: theme.bgTertiary }]}>
          <View
            style={[
              styles.progressBar,
              {
                width: `${progressPct}%`,
                backgroundColor: status.isComplete
                  ? theme.accentGreen
                  : theme.accent,
              },
            ]}
          />
        </View>

        {/* Action Controls */}
        <View style={styles.cardActions}>
          <Text style={[styles.archText, { color: theme.textMuted }]}>
            Arch: {status.arch || "aarch64"} • PRoot active
          </Text>

          <View style={styles.buttonRow}>
            {status.isProvisioning && (
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: "#ef444420", borderColor: "#ef444440" }]}
                onPress={handleCancel}
                disabled={isBusy}
              >
                <Ionicons name="stop-circle-outline" size={14} color="#f87171" />
                <Text style={[styles.btnText, { color: "#f87171" }]}>Stop</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.smallBtn,
                { backgroundColor: `${theme.accent}15`, borderColor: `${theme.accent}30` },
              ]}
              onPress={handleStartRestart}
              disabled={isBusy}
            >
              <Ionicons name="refresh-outline" size={14} color={theme.accent} />
              <Text style={[styles.btnText, { color: theme.accent }]}>
                {status.isComplete ? "Re-verify" : "Re-download"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* 2. Four Provisioning Stages */}
      <Text style={[styles.sectionHeading, { color: theme.textMuted }]}>
        PROVISIONING STAGES
      </Text>

      {STAGES.map((st) => (
        <EnvironmentStageCard
          key={st.index}
          st={st}
          status={status}
          isExpanded={expandedStage === st.index}
          onToggle={() => setExpandedStage(expandedStage === st.index ? null : st.index)}
          theme={theme}
        />
      ))}

      {/* 3. Live Log Drawer (Collapsible) */}
      {logs.length > 0 && (
        <View style={styles.logSection}>
          <TouchableOpacity
            style={[styles.logToggleHeader, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}
            onPress={() => setShowLogs(!showLogs)}
            activeOpacity={0.7}
          >
            <View style={styles.logToggleLeft}>
              <Ionicons name="terminal-outline" size={14} color={theme.textMuted} />
              <Text style={[styles.logToggleTitle, { color: theme.textSecondary }]}>
                Recent Terminal Output ({logs.length})
              </Text>
            </View>
            <Ionicons name={showLogs ? "chevron-up" : "chevron-down"} size={14} color={theme.textMuted} />
          </TouchableOpacity>
          {showLogs && (
            <View style={[styles.logConsole, { backgroundColor: "#090a0d", borderColor: theme.border }]}>
              <ScrollView style={styles.logScroll} nestedScrollEnabled>
                {logs.slice(-10).map((line, idx) => (
                  <Text key={idx} style={styles.logLine} numberOfLines={2}>
                    {line}
                  </Text>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}

      {/* 4. Binary Diagnostics Bar */}
      <View style={[styles.diagBar, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
        <View style={styles.diagItem}>
          <Ionicons
            name={status.nodeExists ? "checkmark-circle" : "close-circle"}
            size={14}
            color={status.nodeExists ? theme.accentGreen : theme.textMuted}
          />
          <Text style={[styles.diagText, { color: theme.textSecondary }]}>Node.js</Text>
        </View>
        <View style={styles.diagItem}>
          <Ionicons
            name={status.pythonExists ? "checkmark-circle" : "close-circle"}
            size={14}
            color={status.pythonExists ? theme.accentGreen : theme.textMuted}
          />
          <Text style={[styles.diagText, { color: theme.textSecondary }]}>Python 3</Text>
        </View>
        <View style={styles.diagItem}>
          <Ionicons
            name={status.gitExists ? "checkmark-circle" : "close-circle"}
            size={14}
            color={status.gitExists ? theme.accentGreen : theme.textMuted}
          />
          <Text style={[styles.diagText, { color: theme.textSecondary }]}>Git</Text>
        </View>
      </View>

      {/* 5. Optional Extras */}
      <OptionalPackagesSection theme={theme} provisioningActive={status.isProvisioning} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, paddingBottom: 24 },
  autoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  autoInfo: { flex: 1, paddingRight: 8 },
  autoTitle: { fontSize: 13, fontWeight: "700" },
  autoDesc: { fontSize: 11, marginTop: 1 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  iconCircle: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  statusInfo: { flex: 1 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusTitle: { fontSize: 14, fontWeight: "700" },
  pillBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  pillText: { fontSize: 10, fontWeight: "700" },
  statusDesc: { fontSize: 11, marginTop: 2 },
  percentContainer: { paddingLeft: 8 },
  percentText: { fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"] },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressBar: { height: "100%", borderRadius: 3 },
  cardActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4 },
  archText: { fontSize: 10 },
  buttonRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  smallBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  btnText: { fontSize: 11, fontWeight: "600" },
  sectionHeading: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, marginTop: 4 },
  logSection: { gap: 4 },
  logToggleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  logToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logToggleTitle: {
    fontSize: 11,
    fontWeight: "600",
  },
  logConsole: { borderRadius: 8, borderWidth: 1, padding: 8, marginTop: 4 },
  logScroll: { maxHeight: 100 },
  logLine: { fontFamily: "monospace", fontSize: 10, color: "#94a3b8", lineHeight: 14 },
  diagBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  diagItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  diagText: { fontSize: 11, fontWeight: "500" },
});
