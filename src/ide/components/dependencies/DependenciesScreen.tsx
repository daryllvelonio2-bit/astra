import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
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
 * Each section is one kind of development (Laravel, React/Node, ...) with the
 * runtimes/tools it needs, whether each is installed, and one tap to install.
 * Nothing installs itself: the screen only ever calls the app's existing
 * installPackages() guest installer, after the user taps Get.
 *
 * Visual language matches the settings Optional Extras list
 * (`settings/OptionalPackagesSection.tsx`) and the hosting panel: same theme
 * tokens, section headings, group cards, chips and buttons.
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
      <View style={styles.introRow}>
        <View style={styles.introInfo}>
          <Text style={[styles.sectionHeading, { color: theme.textMuted }]}>
            INSTALL BY KIND OF DEVELOPMENT
          </Text>
          <Text style={[styles.sectionSub, { color: theme.textMuted }]}>
            {probing ? "Checking what is installed…" : `${readyTotal}/${toolTotal} tools ready`}
            {" · every install is a manual tap"}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.recheckBtn, { backgroundColor: `${theme.accent}15`, borderColor: `${theme.accent}30` }]}
          onPress={() => {
            setProbing(true);
            void refresh().finally(() => setProbing(false));
          }}
          disabled={probing}
          activeOpacity={0.7}
        >
          {probing ? (
            <ActivityIndicator size={12} color={theme.accent} />
          ) : (
            <Ionicons name="refresh-outline" size={13} color={theme.accent} />
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

      <Text style={[styles.footer, { color: theme.textMuted }]}>
        Tools marked Manual cannot be installed by the app today. Everything else installs with the
        same guest installer the rest of Astra uses — only when you tap Get.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, paddingBottom: 24 },
  introRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 },
  introInfo: { flex: 1 },
  sectionHeading: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
  sectionSub: { fontSize: 11, marginTop: 2 },
  recheckBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  recheckText: { fontSize: 11, fontWeight: "700" },
  footer: { fontSize: 10.5, lineHeight: 15, marginTop: 4 },
});
