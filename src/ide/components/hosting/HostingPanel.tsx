import React, { useEffect, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { readFileContent } from "../../services/workspaceService";
// The app's own native-backed clipboard. react-native's Clipboard is a stub
// on the new architecture, so a copy that "succeeds" there copies nothing.
import { Clipboard } from "../../services/clipboardService";
import {
  HostProjectKind,
  HOST_PLANS,
  detectHostKind,
  nodeFlavor,
} from "../../services/hostingPlans";
import {
  checkRuntime,
  getHostingState,
  installRuntime,
  startHosting,
  stopHosting,
  subscribeHosting,
} from "../../services/hostingService";
import {
  StatusHeadline,
  PrimaryAction,
  LiveUrlCard,
  KindChips,
  InstallCard,
  LogDetails,
} from "./HostingSections";

interface HostingPanelProps {
  workspaceId?: string;
  projectName?: string;
  rootNames: string[];
  onOpenBrowser?: (url: string) => void;
}

/**
 * Hosting tab.
 *
 * Written to be read at a glance by someone who is not a sysadmin: one status
 * headline answers "is it live, and if not, what is it doing", one large action
 * is the only thing to press, and the public link is the biggest thing on
 * screen once it exists. Raw commands live behind Show details.
 */
export function HostingPanel({
  workspaceId,
  projectName = "this project",
  rootNames,
  onOpenBrowser,
}: HostingPanelProps) {
  const { theme } = useTheme();
  // Deliberately NOT memoized: the subscription below re-renders us, and a
  // cached snapshot (useMemo with []) froze the panel on its first render —
  // which is exactly why tapping Start looked like it did nothing.
  const state = getHostingState();
  const [, forceTick] = useState(0);
  useEffect(() => subscribeHosting(() => forceTick((t) => t + 1)), []);

  const [pkg, setPkg] = useState<any>(null);
  const [kind, setKind] = useState<HostProjectKind | null>(null);
  const [kindTouched, setKindTouched] = useState(false);
  const [runtime, setRuntime] = useState<{ installed: boolean; checked: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Read package.json once so detection can tell a React app from a bare folder.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!workspaceId) return;
      let parsed: any = null;
      try {
        const raw = await readFileContent(workspaceId, "package.json");
        parsed = raw ? JSON.parse(raw) : null;
      } catch (_) {
        parsed = null;
      }
      if (!alive) return;
      setPkg(parsed);
      if (!kindTouched) setKind(detectHostKind(rootNames, parsed));
    })();
    return () => {
      alive = false;
    };
  }, [workspaceId, rootNames.join("|"), kindTouched]);

  // Are the tools this kind needs already in the guest?
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!kind || !workspaceId) return;
      try {
        const info = await checkRuntime(kind);
        if (alive) setRuntime({ installed: info.installed, checked: true });
      } catch (_) {
        // Never leave the user staring at a button with no reason. "unknown"
        // shows the install offer with a caveat instead of nothing.
        if (alive) setRuntime({ installed: false, checked: false });
      }
    })();
    return () => {
      alive = false;
    };
  }, [kind, workspaceId, state.status]);

  const plan = kind ? HOST_PLANS[kind] : null;
  const running = state.status === "running";
  const working =
    state.status === "checking" ||
    state.status === "installing" ||
    state.status === "starting" ||
    state.status === "tunneling";

  const handleStart = async () => {
    if (!workspaceId || !kind) return;
    if (runtime && !runtime.installed) {
      // Point at the card above rather than starting a server that cannot run.
      setRuntime({ installed: false, checked: runtime.checked });
      forceTick((t) => t + 1);
      return;
    }
    setBusy(true);
    try {
      await startHosting({
        workspaceId,
        projectName,
        kind,
        nodeFlavor: pkg ? nodeFlavor(pkg) : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleInstall = async () => {
    if (!kind) return;
    setBusy(true);
    try {
      await installRuntime(kind);
      try {
        const info = await checkRuntime(kind);
        setRuntime({ installed: info.installed, checked: true });
      } catch (_) {
        setRuntime({ installed: false, checked: false });
      }
    } finally {
      setBusy(false);
    }
  };

  const copyUrl = async () => {
    if (!state.publicUrl) return;
    try {
      await Clipboard.setStringAsync(state.publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (_) {}
  };

  if (!workspaceId) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: theme.bgPrimary }}>
        <Ionicons name="rocket-outline" size={26} color={theme.textMuted} />
        <Text style={{ color: theme.textSecondary, fontSize: 13, textAlign: "center", marginTop: 10 }}>
          Open a project first — hosting publishes the project you are in.
        </Text>
      </View>
    );
  }

  // Running OR working both cancel: being unable to stop a run in progress is
  // what left Jay watching a spinner with no way out. The wiring is unchanged;
  // the button is simply enabled in those states so Cancel is reachable.
  const canCancel = running || working;
  const mode: "start" | "cancel" | "stop" = working ? "cancel" : running ? "stop" : "start";
  const actionLabel = working ? "Cancel" : running ? "Stop" : "Start hosting";
  const actionDisabled = !canCancel && (busy || !kind);
  const onPrimaryPress = canCancel ? () => void stopHosting() : handleStart;
  const needsInstall = !!plan && (!runtime || !runtime.installed);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bgPrimary }}
      contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 32 }}
    >
      <View style={{ gap: 2 }}>
        <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: "800" }}>Host</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 11.5, lineHeight: 16 }}>
          Publishes {projectName} to the internet from this phone. No account, no signup.
        </Text>
      </View>

      <StatusHeadline
        status={state.status}
        step={state.step}
        error={state.error}
        projectName={projectName}
      />

      <PrimaryAction
        label={actionLabel}
        mode={mode}
        disabled={actionDisabled}
        onPress={onPrimaryPress}
      />

      {running && state.publicUrl && (
        <LiveUrlCard
          url={state.publicUrl}
          port={state.port}
          tunnel={state.tunnel}
          copied={copied}
          onCopy={copyUrl}
          onOpen={() => onOpenBrowser?.(state.publicUrl as string)}
        />
      )}

      <KindChips
        kind={kind}
        planLabel={plan ? plan.label : null}
        onSelect={(id) => {
          setKind(id);
          setKindTouched(true);
        }}
      />

      {needsInstall && plan && (
        <InstallCard
          plan={plan}
          runtime={runtime}
          installing={busy && state.status === "installing"}
          onInstall={handleInstall}
        />
      )}

      <LogDetails log={state.log} />
    </ScrollView>
  );
}
