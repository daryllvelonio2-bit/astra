import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  loadConfig,
  saveConfig,
  AppTheme,
  BottomTabVisibility,
  DEFAULT_BOTTOM_TABS,
  normalizeBottomTabs,
  EditorSettings,
  DEFAULT_EDITOR_SETTINGS,
} from "../services/configService";
import { useTheme } from "../../theme/themeContext";
import { useAccurateKeyboard } from "../../theme/useAccurateKeyboard";
import { SettingsTabBar, SettingsTabId } from "./settings/SettingsTabBar";
import { GeneralSection } from "./settings/GeneralSection";
import { EditorSection } from "./settings/EditorSection";
import { EnvironmentSection } from "./settings/EnvironmentSection";

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  workspaceId?: string;
  onSyncWorkspace?: () => void;
  onRerunStartup?: () => void;
}

const AUTOSAVE_DEBOUNCE_MS = 800;

export function SettingsModal({ visible, onClose, onSyncWorkspace, onRerunStartup }: SettingsModalProps) {
  const { theme, themeMode, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<SettingsTabId>("general");
  const [apiKeys, setApiKeys] = useState<string[]>([]);
  const [activeTheme, setActiveTheme] = useState<AppTheme>(themeMode);
  const [bottomTabs, setBottomTabs] = useState<BottomTabVisibility>({ ...DEFAULT_BOTTOM_TABS });
  const [keyboardMouseMode, setKeyboardMouseMode] = useState(false);
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(DEFAULT_EDITOR_SETTINGS);
  const [savedTick, setSavedTick] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const dirtyRef = useRef(false);
  const skipFirstRef = useRef(true);
  const saveTimer = useRef<any>(null);
  const draftRef = useRef({ apiKeys, activeTheme, bottomTabs, keyboardMouseMode, editorSettings });
  draftRef.current = { apiKeys, activeTheme, bottomTabs, keyboardMouseMode, editorSettings };

  const flushSave = async () => {
    const draft = draftRef.current;
    await saveConfig({
      apiKeys: draft.apiKeys,
      apiKey: draft.apiKeys[0] || "",
      selectedTheme: draft.activeTheme,
      bottomTabs: normalizeBottomTabs(draft.bottomTabs),
      keyboardMouseMode: draft.keyboardMouseMode,
      editorSettings: draft.editorSettings,
    });
    setTheme(draft.activeTheme);
    dirtyRef.current = false;
    setSavedTick((t) => t + 1);
  };

  useEffect(() => {
    if (visible) {
      setLoaded(false);
      dirtyRef.current = false;
      skipFirstRef.current = true;
      loadConfig().then((cfg) => {
        setApiKeys(cfg.apiKeys || (cfg.apiKey ? [cfg.apiKey] : []));
        setActiveTheme(cfg.selectedTheme || themeMode);
        setBottomTabs(normalizeBottomTabs(cfg.bottomTabs));
        setKeyboardMouseMode(!!cfg.keyboardMouseMode);
        setEditorSettings(
          cfg.editorSettings ? { ...DEFAULT_EDITOR_SETTINGS, ...cfg.editorSettings } : DEFAULT_EDITOR_SETTINGS
        );
        setLoaded(true);
      });
    } else {
      // Closing with pending edits: flush immediately, never drop them.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (dirtyRef.current) {
        flushSave();
        if (onSyncWorkspace) onSyncWorkspace();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Debounced auto-save on any change (no Save button, no alert).
  useEffect(() => {
    if (!loaded) return;
    if (skipFirstRef.current) {
      skipFirstRef.current = false;
      return;
    }
    dirtyRef.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKeys, activeTheme, bottomTabs, keyboardMouseMode, editorSettings, loaded]);

  const handleSelectTheme = (mode: AppTheme) => {
    setActiveTheme(mode);
    setTheme(mode);
  };

  const { isKeyboardVisible, keyboardOffset } = useAccurateKeyboard(8);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.modalOverlay, isKeyboardVisible && { paddingBottom: keyboardOffset }]}>
        <TouchableOpacity style={[styles.modalBackdrop, { backgroundColor: theme.overlay }]} activeOpacity={1} onPress={onClose} />
        <View style={[
          styles.bottomSheet,
          { backgroundColor: theme.bgElevated, borderColor: theme.border },
          isKeyboardVisible && { height: '92%', maxHeight: '92%' }
        ]}>
          <View style={styles.sheetHandleContainer}>
            <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />
          </View>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="settings-sharp" size={20} color={theme.accent} />
              <Text style={[styles.title, { color: theme.textPrimary }]}>Settings</Text>
            </View>
            <View style={styles.headerRight}>
              {savedTick > 0 && (
                <View style={styles.savedHint}>
                  <Ionicons name="checkmark" size={12} color={theme.accentGreen} />
                  <Text style={[styles.savedText, { color: theme.accentGreen }]}>Saved</Text>
                </View>
              )}
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={theme.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          <SettingsTabBar
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            theme={theme}
          />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {activeTab === "general" && (
              <GeneralSection
                activeTheme={activeTheme}
                onSelectTheme={handleSelectTheme}
                bottomTabs={bottomTabs}
                onChangeBottomTabs={setBottomTabs}
                apiKeys={apiKeys}
                onChangeApiKeys={setApiKeys}
                theme={theme}
                onRerunStartup={onRerunStartup}
              />
            )}
            {activeTab === "editor" && (
              <EditorSection
                keyboardMouseMode={keyboardMouseMode}
                onChangeKeyboardMouseMode={setKeyboardMouseMode}
                editorSettings={editorSettings}
                onChangeEditorSettings={setEditorSettings}
                theme={theme}
              />
            )}
            {activeTab === "environment" && (
              <EnvironmentSection theme={theme} />
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject },
  bottomSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    height: "82%",
    maxHeight: "88%",
    borderWidth: 1,
  },
  sheetHandleContainer: {
    alignItems: "center",
    paddingVertical: 6,
    marginBottom: 4,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 17, fontWeight: "700" },
  savedHint: { flexDirection: "row", alignItems: "center", gap: 3 },
  savedText: { fontSize: 11, fontWeight: "600" },
  scroll: { flex: 1, paddingTop: 12 },
  scrollContent: { paddingBottom: 28 },
});
