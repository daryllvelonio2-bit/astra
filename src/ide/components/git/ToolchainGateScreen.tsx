import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import {
  GateStatus,
  startToolchainDownload,
  installGitEssentials,
} from "../../services/toolchainGate";

/**
 * Shown instead of git UI when the toolchain gate is blocked. Two cases:
 * 1. Toolchain not downloaded / downloading -> big Download button + progress.
 * 2. Toolchain complete but git essentials missing -> Repair card that
 *    installs git + ca-certificates + openssh-client in one tap.
 */

interface Props {
  gate: GateStatus;
  title?: string;
}

export function ToolchainGateScreen({ gate, title = "Git" }: Props) {
  const { theme } = useTheme();
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [repairDone, setRepairDone] = useState(false);

  const handleDownload = async () => {
    setInstallError(null);
    await startToolchainDownload();
  };

  const handleRepair = async () => {
    setInstalling(true);
    setInstallError(null);
    const res = await installGitEssentials();
    setInstalling(false);
    if (res.ok) setRepairDone(true);
    else setInstallError(res.error || "Install failed.");
  };

  const essentialsBlocked = gate.ready && !gate.gitEssentialsReady && !repairDone;

  return (
    <View style={[styles.wrap, { backgroundColor: theme.bgPrimary }]}>
      <View style={styles.card}>
        <View style={[styles.iconWrap, { backgroundColor: `${theme.accent}18` }]}>
          <Ionicons name="git-branch-outline" size={26} color={theme.accent} />
        </View>
        <Text style={[styles.title, { color: theme.textPrimary }]}>{title} needs the Linux toolchain</Text>
        <Text style={[styles.message, { color: theme.textSecondary }]}>
          {gate.provisioning
            ? gate.message
            : gate.ready
            ? ""
            : "Astra's Git client runs real git inside the on-device Debian environment. Download the toolchain once (a few minutes, data charges may apply) to enable cloning, commits and sync."}
        </Text>

        {!gate.ready && !gate.provisioning && (
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.accent }]} onPress={handleDownload}>
            <Ionicons name="download-outline" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>Download toolchain</Text>
          </TouchableOpacity>
        )}

        {gate.provisioning && (
          <View style={styles.progressWrap}>
            <View style={[styles.progressTrack, { backgroundColor: theme.bgTertiary }]}>
              <View style={[styles.progressFill, { backgroundColor: theme.accent, width: `${Math.max(4, gate.pct)}%` }]} />
            </View>
            <Text style={[styles.progressText, { color: theme.textMuted }]}>{gate.message}</Text>
          </View>
        )}

        {essentialsBlocked && (
          <View style={[styles.repairCard, { borderColor: theme.border, backgroundColor: theme.bgSecondary }]}>
            <Text style={[styles.repairTitle, { color: theme.textPrimary }]}>Git tools incomplete</Text>
            <Text style={[styles.repairText, { color: theme.textSecondary }]}>
              git or the TLS certificates are missing from the Linux environment. HTTPS clones and pushes will fail until they are installed.
            </Text>
            <TouchableOpacity
              style={[styles.repairBtn, { borderColor: theme.accent }]}
              onPress={handleRepair}
              disabled={installing}
            >
              {installing ? (
                <ActivityIndicator size="small" color={theme.accent} />
              ) : (
                <Text style={[styles.repairBtnText, { color: theme.accent }]}>Install git + certificates</Text>
              )}
            </TouchableOpacity>
            {!!installError && <Text style={[styles.errorText, { color: theme.accentRed }]}>{installError}</Text>}
          </View>
        )}

        {repairDone && (
          <Text style={[styles.doneText, { color: theme.accentGreen }]}>Git tools installed.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 360, alignItems: "center" },
  iconWrap: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title: { fontSize: 16, fontWeight: "700", textAlign: "center" },
  message: { fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8, marginBottom: 16 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 18,
    height: 44,
    borderRadius: 10,
  },
  primaryBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  progressWrap: { width: "100%", alignItems: "center", marginTop: 4 },
  progressTrack: { width: "100%", height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  progressText: { fontSize: 11.5, marginTop: 8, textAlign: "center" },
  repairCard: { width: "100%", borderRadius: 10, borderWidth: 1, padding: 14, marginTop: 14 },
  repairTitle: { fontSize: 13.5, fontWeight: "700" },
  repairText: { fontSize: 12, lineHeight: 17, marginTop: 5 },
  repairBtn: {
    alignSelf: "center",
    marginTop: 12,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  repairBtnText: { fontSize: 12.5, fontWeight: "700" },
  errorText: { fontSize: 11.5, marginTop: 8, textAlign: "center" },
  doneText: { fontSize: 12.5, marginTop: 12 },
});
