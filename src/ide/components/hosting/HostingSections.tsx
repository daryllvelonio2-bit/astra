import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import type { HostStatus } from "../../services/hostingService";
import {
  HostProjectKind,
  HOST_PLANS,
} from "../../services/hostingPlans";

/**
 * Presentation pieces for the Hosting panel.
 *
 * Everything here is read-only: each component receives the fields the hosting
 * service already maintains and renders them in plain words. No hosting logic,
 * no state names, no side effects beyond the callbacks the panel passes in.
 */

export const KIND_CHOICES: Array<{ id: HostProjectKind; title: string; icon: any }> = [
  { id: "laravel", title: "Laravel", icon: "logo-laravel" },
  { id: "node", title: "React / Node", icon: "logo-react" },
  { id: "static", title: "Static site", icon: "document-outline" },
];

const isWorking = (status: HostStatus) =>
  status === "checking" ||
  status === "installing" ||
  status === "starting" ||
  status === "tunneling";

/** The one question: is it live, and if not, what is it doing right now. */
export function StatusHeadline({
  status,
  step,
  error,
  projectName,
}: {
  status: HostStatus;
  step: string;
  error: string | null;
  projectName: string;
}) {
  const { theme } = useTheme();
  const working = isWorking(status);
  const running = status === "running";
  const failed = status === "error";

  const headline = running
    ? "Live on the internet"
    : failed
    ? "Could not start"
    : status === "checking"
    ? "Getting your project ready…"
    : status === "installing"
    ? "Getting your project ready…"
    : status === "starting"
    ? "Starting the server…"
    : status === "tunneling"
    ? "Publishing to the internet…"
    : "Not running";

  const color: string = running
    ? theme.accentGreen
    : failed
    ? theme.accentRed
    : working
    ? theme.accent
    : theme.textPrimary;

  const icon: any = running
    ? "checkmark-circle"
    : failed
    ? "alert-circle-outline"
    : "ellipse-outline";

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {working ? (
          <ActivityIndicator size="small" color={theme.accent} />
        ) : (
          <Ionicons name={icon} size={20} color={color} />
        )}
        <Text style={{ color, fontSize: 18, fontWeight: "800", flex: 1 }}>{headline}</Text>
      </View>

      {working && !!step && (
        <Text style={{ color: theme.textSecondary, fontSize: 12.5, lineHeight: 17 }} numberOfLines={2}>
          {step}
        </Text>
      )}

      {failed && !!error && (
        <Text style={{ color: theme.accentRed, fontSize: 12, lineHeight: 17 }}>{error}</Text>
      )}

      {!working && !running && !failed && (
        <Text style={{ color: theme.textSecondary, fontSize: 12.5, lineHeight: 17 }}>
          Nothing is published yet. Tap Start hosting to put {projectName} on the internet.
        </Text>
      )}

      {working && (
        <Text style={{ color: theme.textMuted, fontSize: 11, lineHeight: 15 }}>
          Keep the app open and the screen on — hosting stops if the phone sleeps.
        </Text>
      )}
    </View>
  );
}

/** One large action, unmistakably enabled or unmistakably blocked. */
export function PrimaryAction({
  label,
  mode,
  disabled,
  onPress,
}: {
  label: string;
  mode: "start" | "cancel" | "stop";
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const danger = mode === "cancel" || mode === "stop";
  const bg = disabled ? theme.bgTertiary : danger ? theme.accentRed : theme.accent;
  const fg = disabled ? theme.textMuted : theme.sendButtonIcon;
  const icon: any =
    mode === "stop" ? "stop-circle-outline" : mode === "cancel" ? "close-circle-outline" : "rocket-outline";

  return (
    <TouchableOpacity
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: disabled ? theme.border : bg,
        borderRadius: 12,
        paddingVertical: 14,
        opacity: disabled ? 0.55 : 1,
      }}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      {mode === "cancel" ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <Ionicons name={icon} size={18} color={fg} />
      )}
      <Text style={{ color: fg, fontWeight: "800", fontSize: 15 }}>{label}</Text>
    </TouchableOpacity>
  );
}

/** The payoff: the public link, as prominent as it gets. */
export function LiveUrlCard({
  url,
  port,
  tunnel,
  copied,
  onCopy,
  onOpen,
}: {
  url: string;
  port: number | null;
  tunnel: string | null;
  copied: boolean;
  onCopy: () => void;
  onOpen: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.bgSecondary,
        borderColor: theme.accentGreen,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        gap: 9,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="link-outline" size={13} color={theme.textMuted} />
        <Text style={{ color: theme.textMuted, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.5 }}>
          PUBLIC LINK
        </Text>
      </View>

      <Text
        selectable
        style={{ color: theme.textPrimary, fontSize: 15, fontWeight: "700", fontFamily: "monospace", lineHeight: 21 }}
      >
        {url}
      </Text>

      <Text style={{ color: theme.textMuted, fontSize: 11 }}>
        port {port} · {tunnel}
      </Text>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            backgroundColor: theme.bgTertiary,
            borderRadius: 9,
            paddingVertical: 11,
            borderWidth: 1,
            borderColor: theme.border,
          }}
          onPress={onCopy}
          activeOpacity={0.85}
        >
          <Ionicons
            name={copied ? "checkmark" : "copy-outline"}
            size={15}
            color={copied ? theme.accentGreen : theme.accent}
          />
          <Text style={{ color: copied ? theme.accentGreen : theme.textPrimary, fontSize: 12.5, fontWeight: "700" }}>
            {copied ? "Copied" : "Copy"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            backgroundColor: theme.accent,
            borderRadius: 9,
            paddingVertical: 11,
          }}
          onPress={onOpen}
          activeOpacity={0.85}
        >
          <Ionicons name="open-outline" size={15} color={theme.sendButtonIcon} />
          <Text style={{ color: theme.sendButtonIcon, fontSize: 12.5, fontWeight: "800" }}>Open</Text>
        </TouchableOpacity>
      </View>

      <Text style={{ color: theme.textMuted, fontSize: 11, lineHeight: 15 }}>
        The link only works while this app is open.
      </Text>
    </View>
  );
}

/** A correction control, not the main event. */
export function KindChips({
  kind,
  planLabel,
  onSelect,
}: {
  kind: HostProjectKind | null;
  planLabel: string | null;
  onSelect: (id: HostProjectKind) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 6 }}>
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
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                paddingVertical: 9,
                borderRadius: 9,
                borderWidth: 1,
                backgroundColor: active ? theme.bgTertiary : theme.bgSecondary,
                borderColor: active ? theme.accent : theme.border,
              }}
              onPress={() => onSelect(choice.id)}
              activeOpacity={0.8}
            >
              <Ionicons name={choice.icon} size={14} color={active ? theme.accent : theme.textMuted} />
              <Text
                numberOfLines={1}
                style={{ fontSize: 12, fontWeight: "700", color: active ? theme.accent : theme.textSecondary }}
              >
                {choice.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={{ color: theme.textMuted, fontSize: 11 }}>
        {kind && planLabel
          ? `Detected: ${planLabel}. Tap another if this is wrong.`
          : "Could not tell from the files — pick the type above."}
      </Text>
    </View>
  );
}

/** Only shown when a tool the project needs is genuinely absent. */
export function InstallCard({
  plan,
  runtime,
  installing,
  onInstall,
}: {
  plan: (typeof HOST_PLANS)[HostProjectKind];
  runtime: { installed: boolean; checked: boolean } | null;
  installing: boolean;
  onInstall: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.bgSecondary,
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name="download-outline" size={16} color={theme.accentGold} />
        <Text style={{ color: theme.textPrimary, fontSize: 13, fontWeight: "700", flex: 1 }}>
          {plan.label} is not installed yet
        </Text>
      </View>
      <Text style={{ color: theme.textSecondary, fontSize: 11.5, lineHeight: 16 }}>
        {runtime && !runtime.checked
          ? "Could not check what is installed yet — install and the check runs again."
          : `Hosting needs ${plan.binary} inside the phone.`}{" "}
        {plan.approxSize} over your connection — skip this if you are on mobile data.
      </Text>
      {plan.binary === "php" && (
        <Text style={{ color: theme.textMuted, fontSize: 11, lineHeight: 15 }}>
          PHP installs once and survives restarts — you only do this the first time.
        </Text>
      )}
      <TouchableOpacity
        style={{
          backgroundColor: theme.accent,
          borderRadius: 9,
          paddingVertical: 11,
          alignItems: "center",
          opacity: installing ? 0.6 : 1,
        }}
        onPress={onInstall}
        disabled={installing}
        activeOpacity={0.85}
      >
        {installing ? (
          <ActivityIndicator size="small" color={theme.sendButtonIcon} />
        ) : (
          <Text style={{ color: theme.sendButtonIcon, fontWeight: "800", fontSize: 13 }}>
            Install {plan.binary} {plan.approxSize}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

/** The raw truth, for diagnosis — closed by default. */
export function LogDetails({ log }: { log: string[] }) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  if (log.length === 0) return null;

  return (
    <View
      style={{
        backgroundColor: theme.bgTertiary,
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <TouchableOpacity
        style={{ flexDirection: "row", alignItems: "center", gap: 6, padding: 10 }}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.8}
      >
        <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={14} color={theme.textMuted} />
        <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, flex: 1 }}>
          {open ? "Hide details" : "Show details"}
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 10.5 }}>{log.length} lines</Text>
      </TouchableOpacity>
      {open && (
        <ScrollView
          style={{ maxHeight: 160 }}
          contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 10 }}
          nestedScrollEnabled
        >
          {log.map((line, i) => (
            <Text
              key={i}
              style={{ color: theme.textSecondary, fontSize: 10, fontFamily: "monospace", lineHeight: 15 }}
            >
              {line}
            </Text>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
