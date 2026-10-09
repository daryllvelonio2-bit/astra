import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { showAppDialog } from "../../services/appDialog";
import {
  DEV_CATEGORIES,
  DevTool,
  readyCount,
} from "../../services/devCategories";
import { probeDependencyState, installDependency } from "../../services/dependencyInstallService";
import { DependencyCategorySection } from "./DependencyCategorySection";

/**
 * Dependencies, organised by KIND OF DEVELOPMENT.
 *
 * One flat surface: a status line, then one collapsible group per kind of
 * development (Laravel, React/Node, ...) whose rows are its runtimes/tools —
 * whether each is installed and one tap to install. Groups are separated by a
 * hairline rule, not nested cards. The tool rows (name + Get) are the loudest
 * thing on screen; category titles are quiet labels.
 *
 * Nothing installs itself: the screen only ever calls the app's existing
 * installPackages() guest installer, after the user taps Get.
 */

interface DependenciesScreenProps {
  /** True while base provisioning runs — installs disabled (apt lock). */
  provisioningActive?: boolean;
}

export function DependenciesScreen({ provisioningActive = false }: DependenciesScreenProps) {
  const { theme } = useTheme();
  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [probing, setProbing] = useState(true);
  // Empty map => every category's `collapsed[id]` is undefined => expanded.
  // All sections start EXPANDED; a header tap can only hide one by choice.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    const state = await probeDependencyState();
    setInstalled((prev) => ({ ...prev, ...state.tools }));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setProbing(true);
      try {
        await refresh();
      } finally {
        if (alive) setProbing(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  const runInstall = useCallback(
    async (tool: DevTool) => {
      setBusy((prev) => ({ ...prev, [tool.id]: true }));
      try {
        const res = await installDependency(tool);
        await refresh();
        if (!res.ok) {
          showAppDialog({
            title: `Failed to install ${tool.name}`,
            message: (res.output || "Unknown error").slice(-400),
          });
        }
      } finally {
        setBusy((prev) => ({ ...prev, [tool.id]: false }));
      }
    },
    [refresh]
  );

  const handleInstall = useCallback(
    (tool: DevTool) => {
      if (tool.install.kind !== "apt") {
        showAppDialog({
          title: tool.name,
          message:
            tool.install.kind === "manual"
              ? tool.install.hint
              : "This ships with the app — there is nothing to install.",
        });
        return;
      }
      if (provisioningActive) {
        showAppDialog({
          title: "Provisioning Running",
          message: "Wait for the background download to finish before installing (they share the apt lock).",
        });
        return;
      }
      if (tool.heavy) {
        showAppDialog({
          title: `Install ${tool.name}?`,
          message: "This is a large download (hundreds of MB). Check you have free storage and a stable connection.",
          buttons: [
            { text: "Cancel", style: "cancel" },
            { text: "Install", onPress: () => void runInstall(tool) },
          ],
        });
        return;
      }
      void runInstall(tool);
    },
    [provisioningActive, runInstall]
  );

  const { readyTotal, toolTotal } = useMemo(() => {
    let ready = 0;
    let total = 0;
    for (const c of DEV_CATEGORIES) {
      ready += readyCount(c, installed);
      total += c.tools.length;
    }
    return { readyTotal: ready, toolTotal: total };
  }, [installed]);

  const toggle = (id: string) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        <Text style={[styles.statusText, { color: theme.textMuted }]} numberOfLines={1}>
          {probing ? "Checking installed tools…" : `${readyTotal}/${toolTotal} tools ready`}
        </Text>
        <TouchableOpacity
          style={[styles.recheckBtn, { borderColor: theme.border }]}
          onPress={() => {
            setProbing(true);
            void refresh().finally(() => setProbing(false));
          }}
          disabled={probing}
          activeOpacity={0.7}
          accessibilityLabel="Re-check installed tools"
        >
          {probing ? (
            <ActivityIndicator size={11} color={theme.accent} />
          ) : (
            <Ionicons name="refresh-outline" size={12} color={theme.accent} />
          )}
          <Text style={[styles.recheckText, { color: theme.accent }]}>Re-check</Text>
        </TouchableOpacity>
      </View>

      {DEV_CATEGORIES.map((category) => (
        <DependencyCategorySection
          key={category.id}
          category={category}
          theme={theme}
          installed={installed}
          busy={busy}
          probing={probing}
          provisioningActive={provisioningActive}
          expanded={!collapsed[category.id]}
          onToggle={() => toggle(category.id)}
          onInstall={handleInstall}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 0, paddingBottom: 16 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingBottom: 4 },
  statusText: { fontSize: 11, flex: 1 },
  recheckBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  recheckText: { fontSize: 11, fontWeight: "700" },
});
