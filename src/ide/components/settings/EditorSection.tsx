import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";
import { EditorSettings } from "../../services/configService";
import { ExtensionMarketplaceModal } from "../extensions/ExtensionMarketplaceModal";
import { getActiveFormatters } from "../../services/formatService";
import { InstalledExtension } from "../../services/extensions/types";
import { SettingsSectionHeader } from "./SettingsSectionHeader";
import { SettingsOptionCard } from "./SettingsOptionCard";

interface EditorSectionProps {
  keyboardMouseMode: boolean;
  onChangeKeyboardMouseMode: (enabled: boolean) => void;
  editorSettings: EditorSettings;
  onChangeEditorSettings: (settings: EditorSettings) => void;
  theme: ThemeColors;
}

export function EditorSection({
  keyboardMouseMode,
  onChangeKeyboardMouseMode,
  editorSettings,
  onChangeEditorSettings,
  theme,
}: EditorSectionProps) {
  const [showExtensionsModal, setShowExtensionsModal] = useState(false);
  const [formatters, setFormatters] = useState<InstalledExtension[]>([]);

  useEffect(() => {
    getActiveFormatters().then(setFormatters);
  }, [showExtensionsModal]);

  const hasFormatters = formatters.length > 0;
  const formatterNames = hasFormatters
    ? formatters.map((f) => f.displayName).join(", ")
    : "No formatter installed — formatting is off";

  const tabSize = editorSettings.tabSize || 2;

  return (
    <View style={styles.container}>
      {/* Extensions Marketplace Action Card */}
      <SettingsOptionCard
        theme={theme}
        icon="cube-outline"
        title="Extensions & Themes"
        subtitle="Install themes, formatters (Prettier, Black), and snippets from Open VSX."
        control="chevron"
        onPress={() => setShowExtensionsModal(true)}
        trailingExtra={
          <View style={[styles.badge, { backgroundColor: `${theme.accent}20` }]}>
            <Text style={[styles.badgeText, { color: theme.accent }]}>Marketplace</Text>
          </View>
        }
      />

      {/* Code Formatting & Indentation Group */}
      <SettingsSectionHeader
        theme={theme}
        icon="code-slash-outline"
        title="Code Formatting & Indentation"
        subtitle="Define how the editor formats and indents your code."
      />
      <View style={styles.stack}>
        {/* Active Formatter Row */}
        <SettingsOptionCard
          theme={theme}
          title="Code Formatter"
          subtitle={formatterNames}
          control="none"
          leading={
            <View
              style={[
                styles.iconTile,
                {
                  backgroundColor: hasFormatters ? `${theme.accentGreen}20` : `${theme.accent}18`,
                  borderColor: hasFormatters ? `${theme.accentGreen}33` : `${theme.accent}2E`,
                },
              ]}
            >
              <Ionicons name="sparkles" size={16} color={hasFormatters ? theme.accentGreen : theme.accent} />
            </View>
          }
          trailingExtra={
            <>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: hasFormatters ? `${theme.accentGreen}20` : `${theme.accent}20` },
                ]}
              >
                <Text
                  style={[styles.badgeText, { color: hasFormatters ? theme.accentGreen : theme.accent }]}
                >
                  {hasFormatters ? "Active" : "None"}
                </Text>
              </View>
              {!hasFormatters && (
                <TouchableOpacity
                  onPress={() => setShowExtensionsModal(true)}
                  style={[styles.smallBtn, { backgroundColor: `${theme.accent}20` }]}
                >
                  <Text style={[styles.smallBtnText, { color: theme.accent }]}>Browse</Text>
                </TouchableOpacity>
              )}
            </>
          }
        />

        {/* Tab Indent Size */}
        <SettingsOptionCard
          theme={theme}
          icon="code-working-outline"
          title="Tab Indent Size"
          subtitle={`Indent spaces (${tabSize} spaces)`}
          control="none"
          right={
            <View style={[styles.segmentedControl, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
              <TouchableOpacity
                style={[styles.segmentBtn, tabSize === 2 && { backgroundColor: theme.accent }]}
                onPress={() => onChangeEditorSettings({ ...editorSettings, tabSize: 2 })}
                activeOpacity={0.7}
              >
                <Text style={[styles.segmentText, { color: tabSize === 2 ? theme.sendButtonIcon : theme.textMuted }]}>
                  2
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentBtn, tabSize === 4 && { backgroundColor: theme.accent }]}
                onPress={() => onChangeEditorSettings({ ...editorSettings, tabSize: 4 })}
                activeOpacity={0.7}
              >
                <Text style={[styles.segmentText, { color: tabSize === 4 ? theme.sendButtonIcon : theme.textMuted }]}>
                  4
                </Text>
              </TouchableOpacity>
            </View>
          }
        />

        {/* Indent Guides */}
        <SettingsOptionCard
          theme={theme}
          icon="reorder-four-outline"
          title="Indent Guides"
          subtitle="Show vertical nesting guidelines in editor"
          control="switch"
          switchValue={editorSettings.showIndentGuides !== false}
          onSwitchChange={(val) => onChangeEditorSettings({ ...editorSettings, showIndentGuides: val })}
        />
      </View>

      {/* Hardware & Peripherals Group */}
      <SettingsSectionHeader
        theme={theme}
        icon="hardware-chip-outline"
        title="Hardware Input & Peripherals"
        subtitle="Physical keyboard and mouse behaviour."
      />
      <SettingsOptionCard
        theme={theme}
        title="Keyboard & Mouse Mode"
        subtitle="Disables virtual on-screen keyboard for physical USB or Bluetooth keyboard/mouse."
        control="switch"
        switchValue={keyboardMouseMode}
        onSwitchChange={onChangeKeyboardMouseMode}
        leading={
          <View
            style={[
              styles.iconTile,
              {
                backgroundColor: keyboardMouseMode ? `${theme.accentGreen}20` : `${theme.accent}18`,
                borderColor: keyboardMouseMode ? `${theme.accentGreen}33` : `${theme.accent}2E`,
              },
            ]}
          >
            <Ionicons
              name="hardware-chip-outline"
              size={16}
              color={keyboardMouseMode ? theme.accentGreen : theme.accent}
            />
          </View>
        }
        trailingExtra={
          keyboardMouseMode ? (
            <View style={[styles.badge, { backgroundColor: `${theme.accentGreen}20` }]}>
              <Text style={[styles.badgeText, { color: theme.accentGreen }]}>Active</Text>
            </View>
          ) : null
        }
      />

      <ExtensionMarketplaceModal
        visible={showExtensionsModal}
        onClose={() => setShowExtensionsModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
  },
  stack: { gap: 8 },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  smallBtnText: {
    fontSize: 11,
    fontWeight: "600",
  },
  segmentedControl: {
    flexDirection: "row",
    borderRadius: 8,
    borderWidth: 1,
    padding: 2,
    gap: 2,
  },
  segmentBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentText: {
    fontSize: 11,
    fontWeight: "700",
  },
});
