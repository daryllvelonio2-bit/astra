import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Clipboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { readFileContent } from "../../services/workspaceService";
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

interface HostingPanelProps {
  workspaceId?: string;
  projectName?: string;
  rootNames: string[];
  onOpenBrowser?: (url: string) => void;
}

const KIND_CHOICES: Array<{ id: HostProjectKind; title: string; icon: any; blurb: string }> = [
  { id: "laravel", title: "Laravel", icon: "logo-laravel", blurb: "php artisan serve" },
  { id: "node", title: "React / Node", icon: "logo-react", blurb: "npm run dev" },
  { id: "static", title: "Static site", icon: "document-outline", blurb: "plain HTML" },
];

/**
 * Hosting tab.
 *
 * Written to be read by someone who is not a sysadmin: it says what the project
 * is, what it is doing right now, what (if anything) it still needs, and shows
 * one link when it is live. Every raw command stays in the log at the bottom.
 */
export function HostingPanel({
  workspaceId,
  projectName = "this project",
  rootNames,
  onOpenBrowser,
}: HostingPanelProps) {
  const { theme } = useTheme();
  const state = useMemo(() => getHostingState(), []);
  const [, forceTick] = useState(0);
  useEffect(() => subscribeHosting(() => forceTick((t) => t + 1)), []);

  const [pkg, setPkg] = useState<any>(null);
  const [kind, setKind] = useState<HostProjectKind | null>(null);
  const [kindTouched, setKindTouched] = useState(false);
  const [runtime, setRuntime] = useState<{ installed: boolean } | null>(null);
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
      const info = await checkRuntime(kind);
      if (alive) setRuntime({ installed: info.installed });
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
      const info = await checkRuntime(kind);
      setRuntime({ installed: info.installed });
    } finally {
      setBusy(false);
    }
  };

  const copyUrl = () => {
    if (!state.publicUrl) return;
    try {
      Clipboard.setString(state.publicUrl);
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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bgPrimary }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
    >
      <View>
        <Text style={{ color: theme.textPrimary, fontSize: 17, fontWeight: "700" }}>Host</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 3, lineHeight: 17 }}>
          Runs {projectName} inside the phone and gives you a public link.
          No account, no signup — the link lives while the app is open.
        </Text>
      </View>

      {/* What kind of project is this? */}
      <View style={{ backgroundColor: theme.bgSecondary, borderColor: theme.border, borderWidth: 1, borderRadius: 10, padding: 12, gap: 10 }}>
        <Text style={{ color: theme.textMuted, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.5 }}>
          PROJECT TYPE
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {KIND_CHOICES.map((choice) => {
            const active = kind === choice.id;
            return (
              <TouchableOpacity
                key={choice.id}
                style={{
                  flex: 1, alignItems: "center", gap: 4, paddingVertical: 10, borderRadius: 8, borderWidth: 1,
                  backgroundColor: active ? `${theme.accent}18` : theme.bgTertiary,
                  borderColor: active ? theme.accent : theme.border,
                }}
                onPress={() => { setKind(choice.id); setKindTouched(true); }}
                activeOpacity={0.8}
              >
                <Ionicons name={choice.icon} size={16} color={active ? theme.accent : theme.textMuted} />
                <Text style={{ fontSize: 11.5, fontWeight: "700", color: active ? theme.accent : theme.textSecondary }}>
                  {choice.title}
                </Text>
                <Text style={{ fontSize: 9.5, color: theme.textMuted }}>{choice.blurb}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={{ color: theme.textMuted, fontSize: 11 }}>
          {kind
            ? `Detected: ${plan?.label}. Tap another if this is wrong.`
            : "Could not tell from the files — pick the type above."}
        </Text>
      </View>

      {/* What still has to be installed */}
      {plan && runtime && !runtime.installed && (
        <View style={{ backgroundColor: `${theme.accentGold}12`, borderColor: `${theme.accentGold}55`, borderWidth: 1, borderRadius: 10, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="download-outline" size={16} color={theme.accentGold} />
            <Text style={{ color: theme.textPrimary, fontSize: 13, fontWeight: "700", flex: 1 }}>
              {plan.label} is not installed yet
            </Text>
          </View>
          <Text style={{ color: theme.textSecondary, fontSize: 11.5, lineHeight: 16 }}>
            Hosting needs {plan.binary} inside the phone. {plan.approxSize} over your connection —
            {" "}skip this if you are on mobile data.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: theme.accent, borderRadius: 8, paddingVertical: 10, alignItems: "center", opacity: busy ? 0.7 : 1 }}
            onPress={handleInstall}
            disabled={busy}
          >
            {busy && state.status === "installing" ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ color: theme.sendButtonIcon, fontWeight: "700", fontSize: 13 }}>
                Install {plan.binary} {plan.approxSize}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* The one button that matters */}
      <TouchableOpacity
        style={{
          flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
          backgroundColor: running ? theme.accentRed : theme.accent,
          borderRadius: 10, paddingVertical: 14, opacity: busy || working ? 0.75 : 1,
        }}
        onPress={running ? () => void stopHosting() : handleStart}
        disabled={busy || working || !kind || (!!runtime && !runtime.installed && !running)}
      >
        {working ? (
          <>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Working…</Text>
          </>
        ) : (
          <>
            <Ionicons name={running ? "stop-circle-outline" : "rocket-outline"} size={18} color={running ? "#fff" : theme.sendButtonIcon} />
            <Text style={{ color: running ? "#fff" : theme.sendButtonIcon, fontWeight: "700", fontSize: 14 }}>
              {running ? "Stop hosting" : "Start hosting"}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {/* Status / the live link */}
      {(working || running || state.error) && (
        <View style={{ backgroundColor: theme.bgSecondary, borderColor: running ? theme.accentGreen : theme.border, borderWidth: 1, borderRadius: 10, padding: 12, gap: 8 }}>
          {working && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator size="small" color={theme.accent} />
              <Text style={{ color: theme.textSecondary, fontSize: 12.5, flex: 1 }}>
                {state.step || "Working…"}
              </Text>
            </View>
          )}
          {running && state.publicUrl && (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="checkmark-circle" size={15} color={theme.accentGreen} />
                <Text style={{ color: theme.accentGreen, fontSize: 12.5, fontWeight: "700" }}>Live on the internet</Text>
              </View>
              <Text selectable style={{ color: theme.textPrimary, fontSize: 13, fontFamily: "monospace" }}>
                {state.publicUrl}
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                port {state.port} · {state.tunnel}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: theme.bgTertiary, borderRadius: 8, paddingVertical: 10, borderWidth: 1, borderColor: theme.border }}
                  onPress={copyUrl}
                >
                  <Ionicons name={copied ? "checkmark" : "copy-outline"} size={15} color={copied ? theme.accentGreen : theme.accent} />
                  <Text style={{ color: copied ? theme.accentGreen : theme.textPrimary, fontSize: 12.5, fontWeight: "600" }}>
                    {copied ? "Copied" : "Copy link"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: theme.accent, borderRadius: 8, paddingVertical: 10 }}
                  onPress={() => onOpenBrowser?.(state.publicUrl as string)}
                >
                  <Ionicons name="open-outline" size={15} color={theme.sendButtonIcon} />
                  <Text style={{ color: theme.sendButtonIcon, fontSize: 12.5, fontWeight: "700" }}>Open</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ color: theme.textMuted, fontSize: 10.5, lineHeight: 15 }}>
                Keep this app open: Android suspends it in the background, which stops the
                server and the link.
              </Text>
            </>
          )}
          {!!state.error && (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Ionicons name="alert-circle-outline" size={15} color={theme.accentRed} />
              <Text style={{ color: theme.accentRed, fontSize: 12, flex: 1, lineHeight: 17 }}>{state.error}</Text>
            </View>
          )}
        </View>
      )}

      {/* The raw truth, for when the summary is not enough */}
      {state.log.length > 0 && (
        <View style={{ backgroundColor: theme.bgTertiary, borderColor: theme.border, borderWidth: 1, borderRadius: 10, padding: 10 }}>
          <Text style={{ color: theme.textMuted, fontSize: 10.5, fontWeight: "700", marginBottom: 5 }}>
            DETAIL
          </Text>
          {state.log.slice(-10).map((line, i) => (
            <Text key={i} style={{ color: theme.textMuted, fontSize: 10, fontFamily: "monospace", lineHeight: 14 }} numberOfLines={2}>
              {line}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
