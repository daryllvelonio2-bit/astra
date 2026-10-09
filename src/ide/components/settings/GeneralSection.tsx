import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, DevSettings, NativeModules } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppTheme, BottomTabVisibility, ToggleableBottomTab } from "../../services/configService";
import { ThemeColors, THEMES } from "../../../theme/themeContext";
import { SettingsSectionHeader } from "./SettingsSectionHeader";
import { SettingsOptionCard } from "./SettingsOptionCard";
import {
  getInstalledThemes,
  getInstalledIconThemes,
  setActiveIconTheme,
  loadExtensionRegistry,
  subscribeExtensionRegistry,
} from "../../services/extensions/extensionRegistry";

interface GeneralSectionProps {
  activeTheme: AppTheme;
  onSelectTheme: (theme: AppTheme) => void;
  bottomTabs: BottomTabVisibility;
  onChangeBottomTabs: (tabs: BottomTabVisibility) => void;
  theme: ThemeColors;
  onRerunStartup?: () => void;
}

interface TabRow {
  id: ToggleableBottomTab;
  title: string;
  icon: any;
}

const TAB_ROWS: TabRow[] = [
  { id: "editor", title: "Native Editor", icon: "code-slash-outline" },
  { id: "terminal", title: "Terminal", icon: "terminal-outline" },
  { id: "browser", title: "Browser", icon: "globe-outline" },
  { id: "git", title: "Git", icon: "git-branch-outline" },
  { id: "host", title: "Host", icon: "rocket-outline" },
];

const THEME_OPTIONS: Array<{ id: AppTheme; title: string; icon: any }> = [
  { id: "dark", title: "Dark", icon: "moon" },
  { id: "light", title: "Light", icon: "sunny" },
  { id: "midnight", title: "Midnight", icon: "planet" },
];

export function GeneralSection({
  activeTheme,
  onSelectTheme,
  bottomTabs,
  onChangeBottomTabs,
  theme,
  onRerunStartup,
}: GeneralSectionProps) {
  const [extensionThemes, setExtensionThemes] = useState<Array<{ id: string; label: string }>>([]);
  const [iconThemes, setIconThemes] = useState<Array<{ id: string; label: string }>>([]);
  const [activeIconThemeId, setActiveIconThemeId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const loadExt = async () => {
      try {
        const list = await getInstalledThemes();
        setExtensionThemes(list.map((t) => ({ id: t.id, label: t.label })));
        const reg = await loadExtensionRegistry();
        setActiveIconThemeId(reg.activeIconThemeId);
        const icons = await getInstalledIconThemes();
        setIconThemes(icons.map((it) => ({ id: it.id, label: it.label })));
      } catch {}
    };
    loadExt();
    return subscribeExtensionRegistry(loadExt);
  }, []);

  const handleToggleTab = (tabId: ToggleableBottomTab, value: boolean) => {
    onChangeBottomTabs({ ...bottomTabs, [tabId]: value });
  };

  return (
    <View style={styles.container}>
      {/* 1. Theme Palette */}
      <SettingsSectionHeader
        theme={theme}
        icon="color-palette-outline"
        title="Theme & Palette"
        subtitle="Choose your preferred visual style."
      />
      <View style={styles.themeGrid}>
        {THEME_OPTIONS.map((t) => {
          const isSelected = activeTheme === t.id;
          const accentColor = THEMES[t.id].accent;
          return (
            <TouchableOpacity
              key={t.id}
              style={[
                styles.themeCard,
                {
                  backgroundColor: theme.bgPrimary,
                  borderColor: isSelected ? accentColor : theme.border,
                },
              ]}
              onPress={() => onSelectTheme(t.id)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.themePreview,
                  { backgroundColor: `${accentColor}18`, borderColor: `${accentColor}33` },
                ]}
              >
                <Ionicons name={t.icon} size={20} color={accentColor} />
              </View>
              <View style={styles.themeFooter}>
                <Text style={[styles.themeName, { color: theme.textPrimary }]} numberOfLines={1}>
                  {t.title}
                </Text>
                {isSelected ? (
                  <View style={[styles.checkDot, { backgroundColor: accentColor }]}>
                    <Ionicons name="checkmark" size={11} color={theme.sendButtonIcon} />
                  </View>
                ) : (
                  <View style={[styles.radioDot, { borderColor: theme.borderLight }]} />
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Installed Extension Themes */}
      {extensionThemes.length > 0 && (
        <>
          <SettingsSectionHeader
            theme={theme}
            icon="extension-puzzle-outline"
            title="Installed Themes"
            subtitle="Extra themes added from extensions."
          />
          <View style={styles.stack}>
            {extensionThemes.map((ext) => {
              const isSelected = activeTheme === ext.id;
              return (
                <SettingsOptionCard
                  key={ext.id}
                  theme={theme}
                  icon="color-palette-outline"
                  title={ext.label}
                  control={isSelected ? "check" : "radio"}
                  selected={isSelected}
                  onPress={() => onSelectTheme(ext.id)}
                />
              );
            })}
          </View>
        </>
      )}

      {/* File Icon Themes */}
      <SettingsSectionHeader
        theme={theme}
        icon="folder-open-outline"
        title="File Icons"
        subtitle="Select the icon theme for your files and folders."
      />
      <View style={styles.stack}>
        <SettingsOptionCard
          theme={theme}
          icon="images-outline"
          title="Default Language Icons"
          subtitle="Built-in icons for common file types."
          control={!activeIconThemeId ? "check" : "radio"}
          selected={!activeIconThemeId}
          onPress={async () => {
            await setActiveIconTheme(undefined);
            setActiveIconThemeId(undefined);
          }}
        />
        {iconThemes.map((it) => {
          const isSelected = activeIconThemeId === it.id;
          return (
            <SettingsOptionCard
              key={it.id}
              theme={theme}
              icon="sparkles-outline"
              title={it.label}
              subtitle="Installed icon theme"
              control={isSelected ? "check" : "radio"}
              selected={isSelected}
              onPress={async () => {
                await setActiveIconTheme(it.id);
                setActiveIconThemeId(it.id);
              }}
            />
          );
        })}
      </View>

      {/* 2. Bottom Navigation Group */}
      <SettingsSectionHeader
        theme={theme}
        icon="apps-outline"
        title="Bottom Bar Navigation"
        subtitle="Choose which tabs appear in the bottom bar."
      />
      <View style={styles.stack}>
        {TAB_ROWS.map((row) => {
          const enabled = bottomTabs[row.id];
          const isLastOn = enabled && TAB_ROWS.filter((r) => bottomTabs[r.id]).length <= 1;
          return (
            <SettingsOptionCard
              key={row.id}
              theme={theme}
              icon={row.icon}
              title={row.title}
              subtitle={`Show ${row.title} in the bottom bar.`}
              control="switch"
              switchValue={enabled}
              switchDisabled={isLastOn}
              onSwitchChange={(v) => handleToggleTab(row.id, v)}
            />
          );
        })}
      </View>

      {/* 3. Onboarding Action */}
      {onRerunStartup && (
        <>
          <SettingsSectionHeader
            theme={theme}
            icon="sparkles-outline"
            title="Onboarding"
            subtitle="Replay the first-run setup."
          />
          <SettingsOptionCard
            theme={theme}
            icon="sparkles-outline"
            title="Re-run Setup Wizard"
            subtitle="Walk through setup again from the beginning."
            control="chevron"
            onPress={onRerunStartup}
          />
        </>
      )}

      {/* 4. Live Development over Wi-Fi (__DEV__ only) */}
      {__DEV__ && (
        <>
          <SettingsSectionHeader
            theme={theme}
            icon="construct-outline"
            title="Developer Tools"
            subtitle="Debug helpers for development builds."
          />
          <View style={[styles.devCard, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
            <View style={styles.devHeader}>
              <View style={[styles.iconTile, { backgroundColor: `${theme.accent}18`, borderColor: `${theme.accent}2E` }]}>
                <Ionicons name="wifi-outline" size={16} color={theme.accent} />
              </View>
              <View style={styles.devTextCol}>
                <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Wi-Fi Fast Refresh</Text>
                <Text style={[styles.rowSub, { color: theme.textMuted }]}>Host IP: 192.168.43.106:8081</Text>
              </View>
            </View>
            <View style={styles.devButtons}>
              <TouchableOpacity
                style={[styles.devBtn, { backgroundColor: `${theme.accent}18`, borderColor: `${theme.accent}40` }]}
                onPress={() => {
                  try {
                    NativeModules.DevMenu?.show?.();
                  } catch (_) {}
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="construct-outline" size={14} color={theme.accent} />
                <Text style={[styles.devBtnText, { color: theme.accent }]}>Dev Menu</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.devBtn, { backgroundColor: `${theme.accentGreen}18`, borderColor: `${theme.accentGreen}40` }]}
                onPress={() => {
                  try {
                    DevSettings.reload();
                  } catch (_) {}
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh-outline" size={14} color={theme.accentGreen} />
                <Text style={[styles.devBtnText, { color: theme.accentGreen }]}>Reload JS</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, paddingBottom: 24 },
  stack: { gap: 8 },
  themeGrid: { flexDirection: "row", gap: 8 },
  themeCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 8,
    gap: 8,
  },
  themePreview: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  themeFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
    paddingHorizontal: 2,
  },
  themeName: { flex: 1, fontSize: 12, fontWeight: "700" },
  checkDot: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5 },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  devCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 10 },
  devHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  devTextCol: { flex: 1 },
  rowLabel: { fontSize: 13, fontWeight: "700" },
  rowSub: { fontSize: 11, marginTop: 1 },
  devButtons: { flexDirection: "row", gap: 8 },
  devBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  devBtnText: { fontSize: 12, fontWeight: "600" },
});
