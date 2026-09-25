import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Switch, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";
import { EditorSettings } from "../../services/configService";
import { ExtensionMarketplaceModal } from "../extensions/ExtensionMarketplaceModal";
import { getActiveFormatters } from "../../services/formatService";
import { InstalledExtension } from "../../services/extensions/types";

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
      <TouchableOpacity
        style={[
          styles.actionCard,
          {
            backgroundColor: `${theme.accent}12`,
            borderColor: `${theme.accent}40`,
          },
        ]}
        onPress={() => setShowExtensionsModal(true)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconBox, { backgroundColor: `${theme.accent}25` }]}>
          <Ionicons name="cube-outline" size={18} color={theme.accent} />
        </View>
        <View style={styles.textCol}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Extensions & Themes</Text>
            <View style={[styles.badge, { backgroundColor: `${theme.accent}20` }]}>
              <Text style={[styles.badgeText, { color: theme.accent }]}>Marketplace</Text>
            </View>
          </View>
          <Text style={[styles.description, { color: theme.textMuted }]}>
            Install themes, formatters (Prettier, Black), and snippets from Open VSX.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.accent} />
      </TouchableOpacity>

      {/* Code Formatting & Indentation Group */}
      <Text style={[styles.sectionHeading, { color: theme.textMuted }]}>
        CODE FORMATTING & INDENTATION
      </Text>
      <View style={[styles.groupCard, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
        {/* Active Formatter Row */}
        <View style={styles.groupRow}>
          <View
            style={[
              styles.iconBox,
              { backgroundColor: hasFormatters ? `${theme.accentGreen}20` : `${theme.accent}15` },
            ]}
          >
            <Ionicons
              name="sparkles"
              size={18}
              color={hasFormatters ? theme.accentGreen : theme.accent}
            />
          </View>
          <View style={styles.textCol}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: theme.textPrimary }]}>Code Formatter</Text>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: hasFormatters ? `${theme.accentGreen}20` : `${theme.accent}20` },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    { color: hasFormatters ? theme.accentGreen : theme.accent },
                  ]}
                >
                  {hasFormatters ? "Active" : "None"}
                </Text>
              </View>
            </View>
            <Text style={[styles.description, { color: theme.textMuted }]}>
              {formatterNames}
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
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        {/* Tab Indent Size */}
        <View style={styles.groupRow}>
          <View style={[styles.iconBox, { backgroundColor: `${theme.accent}15` }]}>
            <Ionicons name="code-working-outline" size={18} color={theme.accent} />
          </View>
          <View style={styles.textCol}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Tab Indent Size</Text>
            <Text style={[styles.description, { color: theme.textMuted }]}>
              Indent spaces ({tabSize} spaces)
            </Text>
          </View>
          <View style={[styles.segmentedControl, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
            <TouchableOpacity
              style={[
                styles.segmentBtn,
                tabSize === 2 && { backgroundColor: theme.accent },
              ]}
              onPress={() => onChangeEditorSettings({ ...editorSettings, tabSize: 2 })}
              activeOpacity={0.7}
            >
              <Text style={[styles.segmentText, { color: tabSize === 2 ? "#ffffff" : theme.textMuted }]}>
                2
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.segmentBtn,
                tabSize === 4 && { backgroundColor: theme.accent },
              ]}
              onPress={() => onChangeEditorSettings({ ...editorSettings, tabSize: 4 })}
              activeOpacity={0.7}
            >
              <Text style={[styles.segmentText, { color: tabSize === 4 ? "#ffffff" : theme.textMuted }]}>
                4
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        {/* Indent Guides */}
        <View style={styles.groupRow}>
          <View style={[styles.iconBox, { backgroundColor: `${theme.accent}15` }]}>
            <Ionicons name="reorder-four-outline" size={18} color={theme.accent} />
          </View>
          <View style={styles.textCol}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Indent Guides</Text>
            <Text style={[styles.description, { color: theme.textMuted }]}>
              Show vertical nesting guidelines in editor
            </Text>
          </View>
          <Switch
            value={editorSettings.showIndentGuides !== false}
            onValueChange={(val) => onChangeEditorSettings({ ...editorSettings, showIndentGuides: val })}
            trackColor={{ false: theme.border, true: `${theme.accentGreen}80` }}
            thumbColor={editorSettings.showIndentGuides !== false ? theme.accentGreen : theme.textMuted}
          />
        </View>
      </View>

      {/* Hardware & Peripherals Group */}
      <Text style={[styles.sectionHeading, { color: theme.textMuted }]}>
        HARDWARE INPUT & PERIPHERALS
      </Text>
      <View style={[styles.groupCard, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
        <View style={styles.groupRow}>
          <View
            style={[
              styles.iconBox,
              {
                backgroundColor: keyboardMouseMode
                  ? `${theme.accentGreen}20`
                  : `${theme.accent}15`,
              },
            ]}
          >
            <Ionicons
              name="hardware-chip-outline"
              size={18}
              color={keyboardMouseMode ? theme.accentGreen : theme.accent}
            />
          </View>
          <View style={styles.textCol}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: theme.textPrimary }]}>
                Keyboard & Mouse Mode
              </Text>
              {keyboardMouseMode && (
                <View style={[styles.badge, { backgroundColor: `${theme.accentGreen}20` }]}>
                  <Text style={[styles.badgeText, { color: theme.accentGreen }]}>Active</Text>
                </View>
              )}
            </View>
            <Text style={[styles.description, { color: theme.textMuted }]}>
              Disables virtual on-screen keyboard for physical USB or Bluetooth keyboard/mouse.
            </Text>
          </View>
          <Switch
            value={keyboardMouseMode}
            onValueChange={onChangeKeyboardMouseMode}
            trackColor={{ false: theme.border, true: `${theme.accentGreen}80` }}
            thumbColor={keyboardMouseMode ? theme.accentGreen : theme.textMuted}
          />
        </View>
      </View>

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
  sectionHeading: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 6,
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  groupCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  divider: {
    height: 1,
    marginHorizontal: 14,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
  },
  description: {
    fontSize: 11,
    lineHeight: 15,
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
