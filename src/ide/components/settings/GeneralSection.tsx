import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Switch, DevSettings, NativeModules } from "react-native";
import { showAppDialog } from "../../services/appDialog";
import { Ionicons } from "@expo/vector-icons";
import { AppTheme, BottomTabVisibility, ToggleableBottomTab } from "../../services/configService";
import { ThemeColors, THEMES } from "../../../theme/themeContext";
import { maskApiKey, normalizeApiKeys } from "../../services/configService";
import { useKeyboardMouseMode } from "../../context/KeyboardMouseContext";
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
  apiKeys: string[];
  onChangeApiKeys: (keys: string[]) => void;
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
  apiKeys,
  onChangeApiKeys,
  theme,
  onRerunStartup,
}: GeneralSectionProps) {
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const [newKeyInput, setNewKeyInput] = useState("");
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(new Set());
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

  const handleAddKey = () => {
    const raw = newKeyInput.trim();
    if (!raw) return;
    const incoming = raw.split(/[,;\n\r]+/).map((k) => k.trim()).filter((k) => k.length > 0);
    if (incoming.length === 0) return;
    onChangeApiKeys(normalizeApiKeys([...apiKeys, ...incoming]));
    setNewKeyInput("");
  };

  const handleRemoveKey = (indexToRemove: number) => {
    showAppDialog({ title: "Remove API Key", message: `Remove Key #${indexToRemove + 1} (${maskApiKey(apiKeys[indexToRemove])})?`, buttons: [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            onChangeApiKeys(apiKeys.filter((_, idx) => idx !== indexToRemove));
            setRevealedIndices((prev) => {
              const updated = new Set<number>();
              prev.forEach((i) => {
                if (i < indexToRemove) updated.add(i);
                else if (i > indexToRemove) updated.add(i - 1);
              });
              return updated;
            });
          },
        },
      ] });
  };

  const toggleReveal = (idx: number) => {
    setRevealedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <View style={styles.container}>
      {/* 1. Theme Palette */}
      <Text style={[styles.sectionHeading, { color: theme.textMuted }]}>THEME & PALETTE</Text>
      <View style={styles.themeGrid}>
        {THEME_OPTIONS.map((t) => {
          const isSelected = activeTheme === t.id;
          const accentColor = THEMES[t.id].accent;
          return (
            <TouchableOpacity
              key={t.id}
              style={[
                styles.themeButton,
                {
                  backgroundColor: theme.bgPrimary,
                  borderColor: isSelected ? accentColor : theme.border,
                },
                isSelected && { borderWidth: 1.5 },
              ]}
              onPress={() => onSelectTheme(t.id)}
              activeOpacity={0.7}
            >
              <View style={[styles.themeIconBox, { backgroundColor: `${accentColor}20` }]}>
                <Ionicons name={t.icon} size={15} color={accentColor} />
              </View>
              <Text style={[styles.themeBtnText, { color: theme.textPrimary }]}>{t.title}</Text>
              {isSelected && <Ionicons name="checkmark-circle" size={14} color={accentColor} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Installed Extension Themes */}
      {extensionThemes.length > 0 && (
        <View style={[styles.groupedCard, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
          {extensionThemes.map((ext, idx) => {
            const isSelected = activeTheme === ext.id;
            return (
              <TouchableOpacity
                key={ext.id}
                style={[
                  styles.listRow,
                  idx > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                ]}
                onPress={() => onSelectTheme(ext.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.rowIconBox, { backgroundColor: `${theme.accent}18` }]}>
                  <Ionicons name="color-palette-outline" size={15} color={theme.accent} />
                </View>
                <Text style={[styles.rowLabel, { color: theme.textPrimary }]} numberOfLines={1}>
                  {ext.label}
                </Text>
                {isSelected && <Ionicons name="checkmark-circle" size={16} color={theme.accent} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* File Icon Themes */}
      <Text style={[styles.sectionHeading, { color: theme.textMuted }]}>FILE ICONS</Text>
      <View style={[styles.groupedCard, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
        <TouchableOpacity
          style={styles.listRow}
          onPress={async () => {
            await setActiveIconTheme(undefined);
            setActiveIconThemeId(undefined);
          }}
          activeOpacity={0.7}
        >
          <View style={[styles.rowIconBox, { backgroundColor: `${theme.accent}18` }]}>
            <Ionicons name="images-outline" size={15} color={theme.accent} />
          </View>
          <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Default Language Icons</Text>
          {!activeIconThemeId && <Ionicons name="checkmark-circle" size={16} color={theme.accent} />}
        </TouchableOpacity>

        {iconThemes.map((it) => {
          const isSelected = activeIconThemeId === it.id;
          return (
            <TouchableOpacity
              key={it.id}
              style={[styles.listRow, { borderTopWidth: 1, borderTopColor: theme.border }]}
              onPress={async () => {
                await setActiveIconTheme(it.id);
                setActiveIconThemeId(it.id);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.rowIconBox, { backgroundColor: `${theme.accent}18` }]}>
                <Ionicons name="sparkles-outline" size={15} color={theme.accent} />
              </View>
              <Text style={[styles.rowLabel, { color: theme.textPrimary }]} numberOfLines={1}>
                {it.label}
              </Text>
              {isSelected && <Ionicons name="checkmark-circle" size={16} color={theme.accent} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 2. Bottom Navigation Group */}
      <Text style={[styles.sectionHeading, { color: theme.textMuted }]}>BOTTOM BAR NAVIGATION</Text>
      <View style={[styles.groupedCard, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
        {TAB_ROWS.map((row, idx) => {
          const enabled = bottomTabs[row.id];
          const isLastOn = enabled && TAB_ROWS.filter((r) => bottomTabs[r.id]).length <= 1;
          return (
            <View
              key={row.id}
              style={[
                styles.listRow,
                idx > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
              ]}
            >
              <View style={[styles.rowIconBox, { backgroundColor: `${theme.accent}18` }]}>
                <Ionicons name={row.icon} size={15} color={theme.accent} />
              </View>
              <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{row.title}</Text>
              <Switch
                value={enabled}
                onValueChange={(v) => handleToggleTab(row.id, v)}
                disabled={isLastOn}
                trackColor={{ false: theme.bgTertiary, true: theme.accent }}
                thumbColor={enabled ? theme.sendButtonIcon : theme.textMuted}
              />
            </View>
          );
        })}
      </View>

      {/* 3. AI Commit Summary Key */}
      <Text style={[styles.sectionHeading, { color: theme.textMuted }]}>GIT AI SUMMARY KEY</Text>
      <View style={[styles.groupedCard, { backgroundColor: theme.bgPrimary, borderColor: theme.border, padding: 12 }]}>
        <Text style={[styles.subText, { color: theme.textSecondary }]}>
          Google Gemini API key for generating AI commit summaries in the Git tab.
        </Text>
        <View style={[styles.inputRow, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
          <TextInput
            style={[styles.keyInput, { color: theme.textPrimary }]}
            placeholder="Paste Gemini API Key"
            placeholderTextColor={theme.textMuted}
            value={newKeyInput}
            onChangeText={setNewKeyInput}
            autoCapitalize="none"
            autoCorrect={false}
            showSoftInputOnFocus={!keyboardMouseMode}
            onSubmitEditing={handleAddKey}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[
              styles.addKeyBtn,
              { backgroundColor: newKeyInput.trim() ? theme.accent : theme.bgTertiary },
            ]}
            onPress={handleAddKey}
            disabled={!newKeyInput.trim()}
            activeOpacity={0.8}
          >
            <Text style={[styles.addKeyText, { color: newKeyInput.trim() ? theme.sendButtonIcon : theme.textMuted }]}>
              Add
            </Text>
          </TouchableOpacity>
        </View>

        {apiKeys.length > 0 && (
          <View style={styles.keysList}>
            {apiKeys.map((key, idx) => {
              const isRevealed = revealedIndices.has(idx);
              return (
                <View
                  key={`${key}-${idx}`}
                  style={[styles.keyItem, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}
                >
                  <Text style={[styles.keyText, { color: theme.textPrimary }]} numberOfLines={1}>
                    {isRevealed ? key : maskApiKey(key)}
                  </Text>
                  <View style={styles.keyActions}>
                    <TouchableOpacity onPress={() => toggleReveal(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name={isRevealed ? "eye-off-outline" : "eye-outline"} size={16} color={theme.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleRemoveKey(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="trash-outline" size={16} color={theme.accentRed} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* 4. Onboarding Action */}
      {onRerunStartup && (
        <View style={{ marginTop: 4 }}>
          <Text style={[styles.sectionHeading, { color: theme.textMuted }]}>ONBOARDING</Text>
          <TouchableOpacity
            style={[styles.groupedCard, styles.listRow, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}
            onPress={onRerunStartup}
            activeOpacity={0.7}
          >
            <View style={[styles.rowIconBox, { backgroundColor: `${theme.accent}18` }]}>
              <Ionicons name="sparkles-outline" size={15} color={theme.accent} />
            </View>
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Re-run Setup Wizard</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* 5. Live Development over Wi-Fi (__DEV__ only) */}
      {__DEV__ && (
        <View style={{ marginTop: 4 }}>
          <Text style={[styles.sectionHeading, { color: theme.textMuted }]}>DEVELOPER TOOLS</Text>
          <View style={[styles.groupedCard, { backgroundColor: theme.bgPrimary, borderColor: theme.border, padding: 12, gap: 10 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={[styles.rowIconBox, { backgroundColor: `${theme.accent}18` }]}>
                <Ionicons name="wifi-outline" size={16} color={theme.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Wi-Fi Fast Refresh</Text>
                <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>
                  Host IP: 192.168.43.106:8081
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
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
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, paddingBottom: 24 },
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
  devBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  sectionHeading: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, marginTop: 6, marginBottom: 2 },
  themeGrid: { flexDirection: "row", gap: 8 },
  themeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  themeIconBox: { width: 24, height: 24, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  themeBtnText: { fontSize: 12, fontWeight: "600" },
  groupedCard: { borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  rowIconBox: { width: 28, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  rowLabel: { flex: 1, fontSize: 13, fontWeight: "600" },
  subText: { fontSize: 11, lineHeight: 15, marginBottom: 8 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 3,
  },
  keyInput: { flex: 1, fontSize: 12, paddingVertical: 5 },
  addKeyBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  addKeyText: { fontSize: 11, fontWeight: "600" },
  keysList: { marginTop: 8, gap: 6 },
  keyItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
  },
  keyText: { flex: 1, fontSize: 11, fontFamily: "monospace", fontWeight: "600" },
  keyActions: { flexDirection: "row", alignItems: "center", gap: 10, marginLeft: 8 },
});
