import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
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
import { OptionalPackageGroup } from "./OptionalPackageGroup";

/**
 * Toolchain Downloads — ONE rounded container holding the whole block.
 *
 * The title row at the top is the container's heading; every group and every
 * package below it is visible straight away (nothing is tucked behind a tap).
 * The groups are flat sections separated by hairline rules and the package rows
 * are flat too — no per-group card, no card inside a card.
 */

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

export function OptionalPackagesSection({ theme, provisioningActive }: OptionalPackagesSectionProps) {
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

  /** True when apt refused because a previous install was killed mid-way. */
  const isDpkgInterrupted = (out: string): boolean =>
    /dpkg was interrupted|dpkg --configure -a/i.test(out);

  /** Best-effort guest repair, then caller retries the install once. */
  const repairDpkg = async (): Promise<void> => {
    try {
      await executeCommand(
        "export DEBIAN_FRONTEND=noninteractive; rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock /var/lib/apt/lists/lock 2>/dev/null; dpkg --configure -a; apt-get install -f -y"
      );
    } catch (_) {}
  };

  const failDialog = (title: string, output: string, retry: () => void) => {
    const dpkgError = isDpkgInterrupted(output);
    showAppDialog({
      title,
      message: dpkgError
        ? "The package database was left half-installed by an earlier interrupted download. It has been repaired — tap Retry to install again."
        : (output || "Unknown error").slice(-400),
      buttons: [{ text: "OK", style: "cancel" }, { text: "Retry", onPress: retry }],
    });
  };

  const handleInstallOne = (pkg: OptionalPackage) => {
    if (guardProvisioning()) return;
    const run = async (retried = false) => {
      setBusy((prev) => ({ ...prev, [pkg.id]: true }));
      try {
        const res = await installPackages(pkg.apt);
        if (res.exitCode === 0) {
          await refresh([pkg]);
        } else if (!retried && isDpkgInterrupted(res.stdout || "")) {
          await repairDpkg();
          const retry = await installPackages(pkg.apt);
          if (retry.exitCode === 0) {
            await refresh([pkg]);
          } else {
            failDialog(`Failed to install ${pkg.name}`, retry.stdout || "", () => run(true));
          }
        } else {
          failDialog(`Failed to install ${pkg.name}`, res.stdout || "", () => run(true));
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
        const attempt = async (): Promise<{ exitCode: number; stdout: string }> =>
          installPackages(apts);
        let res = await attempt();
        if (res.exitCode !== 0 && isDpkgInterrupted(res.stdout || "")) {
          await repairDpkg();
          res = await attempt();
        }
        if (res.exitCode === 0) {
          await refresh(missing);
        } else {
          failDialog(`Failed to install ${group.title}`, res.stdout || "", run);
        }
      } finally {
        setGroupBusy((prev) => ({ ...prev, [group.id]: false }));
      }
    };
    showAppDialog({ title: `Install ${missing.length} missing package${missing.length > 1 ? "s" : ""}?`, message: `${missing.map((p) => p.name).join(", ")}${heavyOnes.length > 0 ? "\n\nIncludes large download(s): " + heavyOnes.map((p) => p.name).join(", ") + ". Check free storage first." : ""}`, buttons: [{ text: "Cancel", style: "cancel" }, { text: "Install All", onPress: run }] });
  };

  const renderGroup = (group: OptionalGroup, isFirst: boolean) => (
    <OptionalPackageGroup
      key={group.id}
      group={group}
      theme={theme}
      installed={installed}
      busy={busy}
      groupBusy={!!groupBusy[group.id]}
      probing={probing}
      provisioningActive={provisioningActive}
      isFirst={isFirst}
      onInstallOne={handleInstallOne}
      onInstallGroup={handleInstallGroup}
    />
  );

  return (
    <View style={[styles.card, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
      {/* Title row — the container's heading. Always on screen, no tap needed. */}
      <View style={styles.headerRow}>
        <View style={[styles.iconTile, { backgroundColor: `${theme.accent}18`, borderColor: `${theme.accent}2E` }]}>
          <Ionicons name="download-outline" size={16} color={theme.accent} />
        </View>
        <View style={styles.titleCol}>
          <Text style={[styles.rowTitle, { color: theme.textPrimary }]} numberOfLines={1}>
            Toolchain Downloads
          </Text>
          <Text style={[styles.rowMeta, { color: theme.textMuted }]} numberOfLines={1}>
            Base runtimes and optional tools — install what you need
          </Text>
        </View>
      </View>

      <Text style={[styles.sectionHeading, { color: theme.textMuted }]}>
        CORE RUNTIME PACKAGES
      </Text>
      <Text style={[styles.sectionSub, { color: theme.textMuted }]}>
        Essential developer utilities and compilers for the Linux environment. Auto-installed during setup unless disabled above.
      </Text>
      {REQUIRED_GROUPS.map((group, i) => renderGroup(group, i === 0))}

      <Text style={[styles.sectionHeading, { color: theme.textMuted, marginTop: 16 }]}>
        OPTIONAL TOOLS & RUNTIMES
      </Text>
      <Text style={[styles.sectionSub, { color: theme.textMuted }]}>
        On-demand developer toolchains installed outside the base environment.
      </Text>
      {OPTIONAL_GROUPS.map((group, i) => renderGroup(group, i === 0))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 2 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 6 },
  iconTile: { width: 34, height: 34, borderRadius: 9, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  titleCol: { flex: 1 },
  rowTitle: { fontSize: 13, fontWeight: "700" },
  rowMeta: { fontSize: 11, marginTop: 1 },
  sectionHeading: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, marginTop: 12 },
  sectionSub: { fontSize: 11, marginTop: 1 },
});
