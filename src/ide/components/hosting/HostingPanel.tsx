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
  reconcileHosting,
  startHosting,
  stopHosting,
  subscribeHosting,
} from "../../services/hostingService";
import {
  HostingHeading,
  StatusRow,
  PrimaryAction,
  UrlCard,
  TypeLine,
  InstallCard,
  KIND_ORDER,
} from "./HostingSections";

interface HostingPanelProps {
  workspaceId?: string;
  projectName?: string;
  rootNames: string[];
  onOpenBrowser?: (url: string) => void;
  /** Bottom tab visible? Gates the ghost-state reconcile below. */
  visible?: boolean;
}

/**
 * Hosting tab.
 *
 * Answers two questions and nothing else: is the project live, and if not, what
 * is happening. One status line, one action, and — once a link exists — the URL
 * as the biggest thing on the panel.
 */
export function HostingPanel({
  workspaceId,
  projectName = "this project",
  rootNames,
  onOpenBrowser,
  visible = true,
}: HostingPanelProps) {
  const { theme } = useTheme();
  // Deliberately NOT memoized: the subscription below re-renders us, and a
  // cached snapshot (useMemo with []) froze the panel on its first render —
  // which is exactly why tapping Start looked like it did nothing.
  const state = getHostingState();
  const [, forceTick] = useState(0);
  useEffect(() => subscribeHosting(() => forceTick((t) => t + 1)), []);

  // Deliberately do NOT start a run on mount. Instead, the moment the tab is
  // shown, drop any ghost left by a previous JS session: a transient status with
  // no live run becomes idle, so Start is always reachable. Cancel-safe — it
  // never touches a run that is genuinely in flight.
  useEffect(() => {
    if (visible) reconcileHosting();
  }, [visible]);

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

  const cycleKind = () => {
    const idx = kind ? KIND_ORDER.indexOf(kind) : -1;
    setKind(KIND_ORDER[(idx + 1) % KIND_ORDER.length]);
    setKindTouched(true);
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
    <View style={{ flex: 1, backgroundColor: theme.bgPrimary }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 12 }}
      >
        <HostingHeading title="Host" icon="rocket-outline" />

        <StatusRow
          status={state.status}
          step={state.step}
          error={state.error}
          port={state.port}
          tunnel={state.tunnel}
        />

        <PrimaryAction
          label={actionLabel}
          mode={mode}
          disabled={actionDisabled}
          onPress={onPrimaryPress}
        />

        {running && state.publicUrl && (
          <UrlCard
            url={state.publicUrl}
            port={state.port}
            tunnel={state.tunnel}
            copied={copied}
            onCopy={copyUrl}
            onOpen={() => onOpenBrowser?.(state.publicUrl as string)}
          />
        )}

        <TypeLine kind={kind} onCycle={cycleKind} />

        {needsInstall && plan && (
          <InstallCard
            plan={plan}
            runtime={runtime}
            installing={busy && state.status === "installing"}
            onInstall={handleInstall}
          />
        )}
      </ScrollView>
    </View>
  );
}
