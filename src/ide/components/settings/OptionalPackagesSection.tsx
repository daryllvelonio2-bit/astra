import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { showAppDialog } from "../../services/appDialog";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";
import {
  executeCommand,
  installPackages,
} from "../../../../modules/linux-runner/src";
import {
  OPTIONAL_GROUPS,
  REQUIRED_GROUPS,
  OptionalGroup,
  OptionalPackage,
} from "../../services/optionalPackages";

interface OptionalPackagesSectionProps {
  theme: ThemeColors;
  /** True while base provisioning runs — installs are disabled (apt lock). */
  provisioningActive: boolean;
}

interface ProbeResult {
  bins: Record<string, boolean>;
  apts: Record<string, boolean>;
}

/**
 * Probe every catalog binary (`command -v`) and header-only apt
 * (`dpkg-query -W`) in a single shell round-trip.
 */
async function probeAll(bins: string[], aptPkgs: string[]): Promise<ProbeResult> {
  const parts: string[] = [];
  if (bins.length > 0) {
    parts.push(`for b in ${bins.join(" ")}; do if command -v "$b" >/dev/null 2>&1; then echo "bin:$b:yes"; else echo "bin:$b:no"; fi; done`);
  }
  if (aptPkgs.length > 0) {
    parts.push(`for p in ${aptPkgs.join(" ")}; do if dpkg-query -W -f='\${Status}' "$p" 2>/dev/null | grep -q "ok installed"; then echo "apt:$p:yes"; else echo "apt:$p:no"; fi; done`);
  }
  try {
    const res = await executeCommand(parts.join("; "));
    const out: ProbeResult = { bins: {}, apts: {} };
    for (const line of res.stdout.split("\n")) {
      const m = line.trim().match(/^(bin|apt):(\S+):(yes|no)$/);
      if (m) out[m[1] === "bin" ? "bins" : "apts"][m[2]] = m[3] === "yes";
    }
    return out;
  } catch (_) {
    return { bins: {}, apts: {} };
  }
}

const ALL_GROUPS: OptionalGroup[] = [...REQUIRED_GROUPS, ...OPTIONAL_GROUPS];
const ALL_PACKAGES: OptionalPackage[] = ALL_GROUPS.flatMap((g) => g.packages);

function isDetected(pkg: OptionalPackage, result: ProbeResult): boolean | undefined {
  if (pkg.probeApt) {
    return pkg.probeApt in result.apts ? result.apts[pkg.probeApt] : undefined;
  }
  return pkg.bin in result.bins ? result.bins[pkg.bin] : undefined;
}

interface GroupCardProps {
  group: OptionalGroup;
  theme: ThemeColors;
  installed: Record<string, boolean>;
  busy: Record<string, boolean>;
  groupBusy: boolean;
  probing: boolean;
  provisioningActive: boolean;
  expanded: boolean;
  onToggle: () => void;
  onInstallOne: (pkg: OptionalPackage) => void;
  onInstallGroup: (group: OptionalGroup) => void;
}

function PackageGroupCard({
  group,
  theme,
  installed,
  busy,
  groupBusy,
  probing,
  provisioningActive,
  expanded,
  onToggle,
  onInstallOne,
  onInstallGroup,
}: GroupCardProps) {
  const doneCount = group.packages.filter((p) => installed[p.id]).length;
  const allDone = doneCount === group.packages.length;
  return (
    <View
      style={[
        styles.groupCard,
        {
          backgroundColor: theme.bgSecondary,
          borderColor: allDone ? `${theme.accentGreen}40` : theme.border,
        },
      ]}
    >
      <TouchableOpacity style={styles.groupHeader} onPress={onToggle} activeOpacity={0.7}>
        <View style={styles.groupLeft}>
          <View style={[styles.groupBadge, { backgroundColor: `${theme.accent}18` }]}>
            <Ionicons name={group.icon as any} size={15} color={theme.accent} />
          </View>
          <View style={styles.titleCol}>
            <Text style={[styles.groupTitle, { color: theme.textPrimary }]}>
              {group.title}
            </Text>
            <Text style={[styles.groupDesc, { color: theme.textMuted }]} numberOfLines={1}>
              {group.blurb}
            </Text>
          </View>
        </View>
        <View style={styles.groupRight}>
          {probing ? (
            <ActivityIndicator size={12} color={theme.textMuted} />
          ) : (
            <Text
              style={[
                styles.groupCount,
                { color: allDone ? theme.accentGreen : theme.textMuted },
              ]}
            >
              {allDone ? "All installed" : `${doneCount}/${group.packages.length}`}
            </Text>
          )}
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={14}
            color={theme.textMuted}
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={[styles.packageList, { borderTopColor: theme.border }]}>
          {group.packages.map((pkg) => {
            const isInstalled = !!installed[pkg.id];
            const isBusy = !!busy[pkg.id];
            return (
              <View key={pkg.id} style={styles.pkgRow}>
                <View style={styles.pkgInfo}>
                  <View style={styles.pkgNameRow}>
                    <Text style={[styles.pkgName, { color: theme.textPrimary }]}>
                      {pkg.name}
                    </Text>
                    <View style={[styles.aptChip, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}>
                      <Text style={[styles.aptChipText, { color: theme.textSecondary }]}>
                        {pkg.apt.join(" ")}
                      </Text>
                    </View>
                    {pkg.heavy && (
                      <View style={[styles.heavyChip, { backgroundColor: `${theme.accentGold}18`, borderColor: `${theme.accentGold}40` }]}>
                        <Text style={[styles.heavyChipText, { color: theme.accentGold }]}>
                          LARGE
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.pkgDesc, { color: theme.textSecondary }]}>
                    {pkg.desc}
                  </Text>
                </View>
                <View style={styles.pkgAction}>
                  {isBusy || groupBusy ? (
                    <ActivityIndicator size={14} color={theme.accent} />
                  ) : isInstalled ? (
                    <Ionicons name="checkmark-circle" size={20} color={theme.accentGreen} />
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
                      <Text style={[styles.installText, { color: theme.accent }]}>
                        Get
                      </Text>
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
      )}
    </View>
  );
}

export function OptionalPackagesSection({ theme, provisioningActive }: OptionalPackagesSectionProps) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>("req-core");
  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [groupBusy, setGroupBusy] = useState<Record<string, boolean>>({});
  const [probing, setProbing] = useState(true);

  const refresh = useCallback(async (pkgs?: OptionalPackage[]) => {
    const targets = pkgs ?? ALL_PACKAGES;
    const bins = [...new Set(targets.map((p) => p.bin).filter(Boolean))];
    const apts = [...new Set(targets.map((p) => p.probeApt).filter((a): a is string => !!a))];
    const result = await probeAll(bins, apts);
    setInstalled((prev) => {
      const next = { ...prev };
      for (const p of targets) {
        const detected = isDetected(p, result);
        if (detected !== undefined) next[p.id] = detected;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    (async () => {
      setProbing(true);
      try {
        await refresh();
      } finally {
        setProbing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardProvisioning = (): boolean => {
    if (provisioningActive) {
      showAppDialog({ title: "Provisioning Running", message: "Wait for the background download to finish before installing packages (they share the apt lock)." });
      return true;
    }
    return false;
  };

  const handleInstallOne = (pkg: OptionalPackage) => {
    if (guardProvisioning()) return;
    const run = async () => {
      setBusy((prev) => ({ ...prev, [pkg.id]: true }));
      try {
        const res = await installPackages(pkg.apt);
        if (res.exitCode === 0) {
          await refresh([pkg]);
        } else {
          showAppDialog({ title: `Failed to install ${pkg.name}`, message: (res.stdout || "Unknown error").slice(-400) });
        }
      } finally {
        setBusy((prev) => ({ ...prev, [pkg.id]: false }));
      }
    };
    if (pkg.heavy) {
      showAppDialog({ title: `Install ${pkg.name}?`, message: "This is a large download (hundreds of MB). Make sure you have free storage and a stable connection.", buttons: [{ text: "Cancel", style: "cancel" }, { text: "Install", onPress: run }] });
    } else {
      run();
    }
  };

  const handleInstallGroup = (group: OptionalGroup) => {
    if (guardProvisioning()) return;
    const missing = group.packages.filter((p) => !installed[p.id]);
    if (missing.length === 0) return;
    const heavyOnes = missing.filter((p) => p.heavy);
    const run = async () => {
      setGroupBusy((prev) => ({ ...prev, [group.id]: true }));
      try {
        const apts = missing.flatMap((p) => p.apt);
        const res = await installPackages(apts);
        if (res.exitCode === 0) {
          await refresh(missing);
        } else {
          showAppDialog({ title: `Failed to install ${group.title}`, message: (res.stdout || "Unknown error").slice(-400) });
        }
      } finally {
        setGroupBusy((prev) => ({ ...prev, [group.id]: false }));
      }
    };
    showAppDialog({ title: `Install ${missing.length} missing package${missing.length > 1 ? "s" : ""}?`, message: `${missing.map((p) => p.name).join(", ")}${heavyOnes.length > 0 ? "\n\nIncludes large download(s): " + heavyOnes.map((p) => p.name).join(", ") + ". Check free storage first." : ""}`, buttons: [{ text: "Cancel", style: "cancel" }, { text: "Install All", onPress: run }] });
  };

  const renderGroup = (group: OptionalGroup) => (
    <PackageGroupCard
      key={group.id}
      group={group}
      theme={theme}
      installed={installed}
      busy={busy}
      groupBusy={!!groupBusy[group.id]}
      probing={probing}
      provisioningActive={provisioningActive}
      expanded={expandedGroup === group.id}
      onToggle={() => setExpandedGroup(expandedGroup === group.id ? null : group.id)}
      onInstallOne={handleInstallOne}
      onInstallGroup={handleInstallGroup}
    />
  );

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionHeading, { color: theme.textMuted }]}>
        CORE RUNTIME PACKAGES
      </Text>
      <Text style={[styles.sectionSub, { color: theme.textMuted }]}>
        Essential developer utilities and compilers for the Linux environment. Auto-installed during setup unless disabled above.
      </Text>
      {REQUIRED_GROUPS.map(renderGroup)}

      <Text style={[styles.sectionHeading, { color: theme.textMuted, marginTop: 12 }]}>
        OPTIONAL TOOLS & RUNTIMES
      </Text>
      <Text style={[styles.sectionSub, { color: theme.textMuted }]}>
        On-demand developer toolchains installed outside the base environment.
      </Text>
      {OPTIONAL_GROUPS.map(renderGroup)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  sectionHeading: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, marginTop: 4 },
  sectionSub: { fontSize: 11, marginTop: -4 },
  groupCard: { borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
  },
  groupLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  groupBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  titleCol: { flex: 1 },
  groupTitle: { fontSize: 13, fontWeight: "700" },
  groupDesc: { fontSize: 10, marginTop: 1 },
  groupRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  groupCount: { fontSize: 11, fontWeight: "600" },
  packageList: { borderTopWidth: 1, padding: 10, gap: 10 },
  pkgRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  pkgInfo: { flex: 1, gap: 3 },
  pkgNameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5 },
  pkgName: { fontSize: 12.5, fontWeight: "700" },
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
    marginTop: 2,
  },
  installAllText: { fontSize: 12, fontWeight: "700" },
});
