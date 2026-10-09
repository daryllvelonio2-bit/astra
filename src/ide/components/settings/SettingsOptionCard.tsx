import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";

/**
 * The bordered rounded card every Settings option sits in (reference design):
 * a leading icon in a rounded square, the option name in bold, a muted
 * subtitle beneath it, and a trailing control. A selected card takes an accent
 * border and a filled accent check.
 *
 * Presentational only — the caller keeps owning the value, the default and the
 * write through configService.
 */
export type OptionControl = "radio" | "check" | "switch" | "chevron" | "none";

interface SettingsOptionCardProps {
  theme: ThemeColors;
  /** Leading icon glyph; ignored when `leading` is supplied. */
  icon?: any;
  title: string;
  subtitle?: string;
  control?: OptionControl;
  /** True paints the accent border + accent fill (single-choice selection). */
  selected?: boolean;
  /** For control="switch". */
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  switchDisabled?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  /** Replaces the whole trailing control (e.g. a segmented control / button). */
  right?: React.ReactNode;
  /** Rendered inside the trailing slot, before the control (e.g. a badge). */
  trailingExtra?: React.ReactNode;
  /** Replaces the leading icon tile (e.g. a themed preview). */
  leading?: React.ReactNode;
  /** Extra content under the title row, inside the card. */
  children?: React.ReactNode;
}

interface TrailingControlProps {
  theme: ThemeColors;
  kind: OptionControl;
  value: boolean;
  onChange?: (value: boolean) => void;
  disabled?: boolean;
}

function TrailingControl({ theme, kind, value, onChange, disabled }: TrailingControlProps) {
  if (kind === "radio") {
    return <View style={[styles.radio, { borderColor: theme.borderLight }]} />;
  }
  if (kind === "check") {
    return (
      <View style={[styles.check, { backgroundColor: theme.accent }]}>
        <Ionicons name="checkmark" size={13} color={theme.sendButtonIcon} />
      </View>
    );
  }
  if (kind === "switch") {
    return (
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: theme.bgTertiary, true: theme.accent }}
        thumbColor={value ? theme.sendButtonIcon : theme.textMuted}
      />
    );
  }
  if (kind === "chevron") {
    return <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />;
  }
  return null;
}

export function SettingsOptionCard({
  theme,
  icon,
  title,
  subtitle,
  control = "none",
  selected = false,
  switchValue = false,
  onSwitchChange,
  switchDisabled = false,
  onPress,
  disabled = false,
  right,
  trailingExtra,
  leading,
  children,
}: SettingsOptionCardProps) {
  const cardStyle = [
    styles.card,
    {
      backgroundColor: selected ? `${theme.accent}0F` : theme.bgPrimary,
      borderColor: selected ? theme.accent : theme.border,
      opacity: disabled ? 0.5 : 1,
    },
  ];

  const body = (
    <>
      <View style={styles.row}>
        {leading ??
          (icon ? (
            <View
              style={[
                styles.iconTile,
                { backgroundColor: `${theme.accent}18`, borderColor: `${theme.accent}2E` },
              ]}
            >
              <Ionicons name={icon} size={16} color={theme.accent} />
            </View>
          ) : null)}
        <View style={styles.textCol}>
          <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: theme.textMuted }]} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.trailing}>
          {trailingExtra}
          {right ?? (
            <TrailingControl
              theme={theme}
              kind={control}
              value={switchValue}
              onChange={onSwitchChange}
              disabled={switchDisabled}
            />
          )}
        </View>
      </View>
      {children}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={cardStyle} onPress={onPress} disabled={disabled} activeOpacity={0.7}>
        {body}
      </TouchableOpacity>
    );
  }
  return <View style={cardStyle}>{body}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: { flex: 1, gap: 2 },
  title: { fontSize: 13, fontWeight: "700" },
  subtitle: { fontSize: 11.5, lineHeight: 15 },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    minWidth: 22,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
