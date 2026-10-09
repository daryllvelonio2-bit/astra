import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
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
 * Two questions only: is the project live, and if not, what is it doing. The
 * pieces reuse the collaborators/visibility vocabulary — section heading (icon
 * tile + uppercase title), row anatomy (rounded icon tile, bold name, muted
 * secondary line, trailing badge), h36/radius-6 accent-filled controls, and the
 * error/notice/state treatments. Metrics are MIRRORED from
 * GitCollaboratorsModal/RepoVisibilitySection (their styles are module-private
 * to another feature), never imported.
 *
 * Everything here is read-only: each component receives fields the hosting
 * service already maintains and renders them in plain words.
 */

export const KIND_CHOICES: Array<{ id: HostProjectKind; title: string; icon: any }> = [
  { id: "laravel", title: "Laravel", icon: "logo-laravel" },
  { id: "node", title: "React / Node", icon: "logo-react" },
  { id: "static", title: "Static site", icon: "document-outline" },
];

/** The order the Change control cycles through when the detection is wrong. */
export const KIND_ORDER: HostProjectKind[] = ["laravel", "node", "static"];

const isWorking = (status: HostStatus) =>
  status === "checking" ||
  status === "installing" ||
  status === "starting" ||
  status === "tunneling";

/** Section heading: the SettingsSectionHeader language, no subtitle (no tagline). */
export function HostingHeading({ title, icon }: { title: string; icon: any }) {
  const { theme } = useTheme();
  return (
    <View style={styles.heading}>
      <View style={[styles.iconTile, { backgroundColor: `${theme.accent}1F`, borderColor: `${theme.accent}33` }]}>
        <Ionicons name={icon} size={14} color={theme.accent} />
      </View>
      <Text style={[styles.headingTitle, { color: theme.textPrimary }]} numberOfLines={1}>
        {title.toUpperCase()}
      </Text>
    </View>
  );
}

/**
 * The one status line: is it live, and if not, what is it doing. Shaped like a
 * collaborator row — tinted icon tile, bold name, muted secondary line, trailing
 * state badge. No commentary.
 */
export function StatusRow({
  status,
  step,
  error,
  port,
  tunnel,
}: {
  status: HostStatus;
  step: string;
  error: string | null;
  port: number | null;
  tunnel: string | null;
}) {
  const { theme } = useTheme();
  const working = isWorking(status);
  const running = status === "running";
  const failed = status === "error";

  const headline = running
    ? "Live on the internet"
    : failed
    ? "Could not start"
    : status === "checking" || status === "installing"
    ? "Getting your project ready…"
    : status === "starting"
    ? "Starting the server…"
    : status === "tunneling"
    ? "Publishing to the internet…"
    : "Not running";

  const tone: string = running
    ? theme.accentGreen
    : failed
    ? theme.accentRed
    : working
    ? theme.accent
    : theme.textMuted;

  const icon: any = running ? "checkmark-circle" : failed ? "alert-circle-outline" : "ellipse-outline";

  const secondary = running
    ? [port != null ? `port ${port}` : "", tunnel || ""].filter(Boolean).join(" · ")
    : failed
    ? error || ""
    : working
    ? step
    : "";

  const badge = running ? "live" : failed ? "error" : working ? "working" : "idle";

  return (
    <View style={[styles.row, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
      <View style={[styles.tile, { backgroundColor: `${tone}22`, borderColor: `${tone}55` }]}>
        {working ? (
          <ActivityIndicator size="small" color={tone} />
        ) : (
          <Ionicons name={icon} size={15} color={tone} />
        )}
      </View>
      <View style={styles.rowBody}>
        <Text
          style={[styles.name, { color: running ? theme.accentGreen : failed ? theme.accentRed : theme.textPrimary }]}
          numberOfLines={1}
        >
          {headline}
        </Text>
        {!!secondary && (
          <Text style={[styles.hint, { color: failed ? theme.accentRed : theme.textMuted }]} numberOfLines={2}>
            {secondary}
          </Text>
        )}
      </View>
      <View style={[styles.badge, { backgroundColor: `${tone}22`, borderColor: `${tone}55` }]}>
        <Text style={[styles.badgeText, { color: tone }]}>{badge}</Text>
      </View>
    </View>
  );
}

/** One action: accent-filled, collaborators "Add" metrics (h36, radius 6). */
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
  const danger = mode !== "start";
  const bg = disabled ? theme.bgTertiary : danger ? theme.accentRed : theme.accent;
  const fg = disabled ? theme.textMuted : theme.sendButtonIcon;
  const icon: any =
    mode === "stop" ? "stop-circle-outline" : mode === "cancel" ? "close-circle-outline" : "rocket-outline";

  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        { backgroundColor: bg, borderColor: disabled ? theme.border : bg, opacity: disabled ? 0.6 : 1 },
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      {mode === "cancel" ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <Ionicons name={icon} size={14} color={fg} />
      )}
      <Text style={[styles.actionText, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** The payoff when a link exists: the URL is the biggest thing on the panel. */
export function UrlCard({
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
  const meta = [port != null ? `port ${port}` : "", tunnel || ""].filter(Boolean).join(" · ");
  return (
    <View style={[styles.card, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
      <View style={styles.labelRow}>
        <Ionicons name="link-outline" size={12} color={theme.textMuted} />
        <Text style={[styles.label, { color: theme.textMuted }]}>PUBLIC LINK</Text>
      </View>

      <Text selectable style={[styles.url, { color: theme.textPrimary }]} numberOfLines={2}>
        {url}
      </Text>

      {!!meta && <Text style={[styles.hint, { color: theme.textMuted }]}>{meta}</Text>}

      <View style={styles.btnRow}>
        <TouchableOpacity
          style={[styles.actionBtn, { flex: 1, backgroundColor: theme.bgTertiary, borderColor: theme.border }]}
          onPress={onCopy}
          activeOpacity={0.8}
        >
          <Ionicons
            name={copied ? "checkmark" : "copy-outline"}
            size={14}
            color={copied ? theme.accentGreen : theme.accent}
          />
          <Text style={[styles.actionText, { color: copied ? theme.accentGreen : theme.textPrimary }]}>
            {copied ? "Copied" : "Copy"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { flex: 1, backgroundColor: theme.accent, borderColor: theme.accent }]}
          onPress={onOpen}
          activeOpacity={0.8}
        >
          <Ionicons name="open-outline" size={14} color={theme.sendButtonIcon} />
          <Text style={[styles.actionText, { color: theme.sendButtonIcon }]}>Open</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * The detected type, as one small muted line with a single Change control
 * (cycles the detection when it is wrong).
 */
export function TypeLine({
  kind,
  onCycle,
}: {
  kind: HostProjectKind | null;
  onCycle: () => void;
}) {
  const { theme } = useTheme();
  const plan = kind ? HOST_PLANS[kind] : null;
  const choice = KIND_CHOICES.find((c) => c.id === kind);

  return (
    <View style={styles.typeLine}>
      <Ionicons name={choice ? choice.icon : "help-circle-outline"} size={13} color={theme.textMuted} />
      <Text style={[styles.typeText, { color: plan ? theme.textSecondary : theme.textMuted }]} numberOfLines={1}>
        {plan ? plan.label : "Type not detected"}
      </Text>
      <TouchableOpacity style={styles.changeBtn} onPress={onCycle} activeOpacity={0.7} accessibilityLabel="Change project type">
        <Ionicons name="swap-horizontal" size={13} color={theme.accent} />
        <Text style={[styles.changeText, { color: theme.accent }]}>Change</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Only shown when a tool the project needs is genuinely absent. No commentary. */
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
    <View style={[styles.card, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
      <View style={styles.labelRow}>
        <Ionicons name="download-outline" size={13} color={theme.accentGold} />
        <Text style={[styles.name, { color: theme.textPrimary, flex: 1 }]} numberOfLines={1}>
          {plan.label} is not installed
        </Text>
      </View>
      <Text style={[styles.hint, { color: theme.textMuted }]} numberOfLines={2}>
        {runtime && !runtime.checked
          ? "Could not check what is installed yet."
          : `Needs ${plan.binary} inside the phone (${plan.approxSize}).`}
      </Text>
      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: theme.accent, borderColor: theme.accent, opacity: installing ? 0.6 : 1 }]}
        onPress={onInstall}
        disabled={installing}
        activeOpacity={0.8}
      >
        {installing ? (
          <ActivityIndicator size="small" color={theme.sendButtonIcon} />
        ) : (
          <>
            <Ionicons name="download-outline" size={14} color={theme.sendButtonIcon} />
            <Text style={[styles.actionText, { color: theme.sendButtonIcon }]}>
              Install {plan.binary} {plan.approxSize}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

// Mirrored from GitCollaboratorsModal / RepoVisibilitySection so the Host tab
// reads as the same product. Mirrored, not imported: those styles are private.
const styles = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  iconTile: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headingTitle: { fontSize: 12, fontWeight: "800", letterSpacing: 0.7, flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tile: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, gap: 3 },
  name: { fontSize: 12.5, fontWeight: "700" },
  hint: { fontSize: 10.5, lineHeight: 14 },
  badge: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontSize: 9.5, fontWeight: "700" },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 36,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
  },
  actionText: { fontSize: 12.5, fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 8, padding: 10, gap: 8 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  label: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.5 },
  url: { fontSize: 14, fontWeight: "700", fontFamily: "monospace", lineHeight: 19 },
  btnRow: { flexDirection: "row", gap: 8 },
  typeLine: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 },
  typeText: { fontSize: 11.5, flex: 1 },
  changeBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingLeft: 8 },
  changeText: { fontSize: 11.5, fontWeight: "600" },
});
