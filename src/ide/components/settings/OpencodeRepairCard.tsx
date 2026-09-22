import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";
import { checkOpencode, repairOpencode, exportRepairLog, OpencodeHealth } from "../../services/opencodeService";

interface OpencodeRepairCardProps {
  theme: ThemeColors;
}

/** opencode CLI status + one-tap postinstall repair (Settings → Linux). */
export function OpencodeRepairCard({ theme }: OpencodeRepairCardProps) {
  const [health, setHealth] = useState<OpencodeHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [detailLog, setDetailLog] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setHealth(await checkOpencode());
    } catch (_) {}
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleRepair = async () => {
    setBusy(true);
    setResult(null);
    setDetailLog(null);
    setShowLog(false);
    try {
      const res = await repairOpencode();
      setDetailLog(res.log || null);
      exportRepairLog(res.log || "(empty)").catch(() => {});
      if (res.success) {
        setResult(`Fixed — opencode ${res.version} works now.`);
      } else {
        setResult("Repair failed — tap View log below and send it over.");
      }
    } catch (e: any) {
      setResult(e?.message || "Repair failed.");
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const ok = health?.state === "ok";
  const needsRepair = health?.state === "broken-postinstall" || health?.state === "missing";

  return (
    <View style={[styles.card, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
      <View style={styles.row}>
        <Ionicons
          name={ok ? "checkmark-circle" : "terminal-outline"}
          size={20}
          color={ok ? theme.accentGreen : theme.accent}
        />
        <View style={styles.info}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>opencode CLI</Text>
          <Text style={[styles.desc, { color: theme.textSecondary }]}>
            {!health
              ? "Checking…"
              : ok
              ? `Working (v${health.version})`
              : health.detail}
          </Text>
          {!!result && (
            <Text style={[styles.result, { color: theme.textSecondary }]}>{result}</Text>
          )}
          {!!detailLog && (
            <TouchableOpacity onPress={() => setShowLog((v) => !v)} activeOpacity={0.7}>
              <Text style={[styles.logToggle, { color: theme.accent }]}>
                {showLog ? "Hide log" : "View log"}
              </Text>
            </TouchableOpacity>
          )}
          {!!detailLog && showLog && (
            <Text style={[styles.logText, { color: theme.textMuted }]}>
              {detailLog.slice(-1200)}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[
            styles.button,
            { backgroundColor: needsRepair ? theme.accent : theme.bgTertiary },
            busy && styles.buttonBusy,
          ]}
          onPress={handleRepair}
          disabled={busy}
          activeOpacity={0.8}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text
              style={[
                styles.buttonText,
                { color: needsRepair ? "#fff" : theme.textPrimary },
              ]}
            >
              {needsRepair ? "Repair" : "Reinstall"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  info: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
  },
  desc: {
    fontSize: 11,
    lineHeight: 14,
  },
  result: {
    fontSize: 11,
    lineHeight: 14,
    marginTop: 2,
  },
  logToggle: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  logText: {
    fontSize: 9.5,
    lineHeight: 12,
    fontFamily: "monospace",
    marginTop: 4,
  },
  button: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 7,
  },
  buttonBusy: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
