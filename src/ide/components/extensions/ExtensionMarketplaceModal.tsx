import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Image,
  Alert,
  Platform,
} from "react-native";
import { Ionicons, Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useAccurateKeyboard } from "../../../theme/useAccurateKeyboard";
import { useKeyboardMouseMode } from "../../context/KeyboardMouseContext";
import { searchMarketplace } from "../../services/extensions/extensionMarketplaceService";
import {
  loadExtensionRegistry,
  uninstallExtension,
  toggleExtension,
  subscribeExtensionRegistry,
  getInstalledThemes,
} from "../../services/extensions/extensionRegistry";
import { ExtensionMarketplaceItem, InstalledExtension } from "../../services/extensions/types";
import { ExtensionThemesTab } from "./ExtensionThemesTab";
import {
  startExtensionInstall,
  getExtensionInstallJob,
  subscribeExtensionInstall,
} from "../../services/extensions/extensionInstallService";

interface ExtensionMarketplaceModalProps {
  visible: boolean;
  onClose: () => void;
}

export type TabType = "marketplace" | "installed" | "themes";

export function ExtensionMarketplaceModal({ visible, onClose }: ExtensionMarketplaceModalProps) {
  const { theme, themeMode, setTheme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const { isKeyboardVisible, keyboardOffset } = useAccurateKeyboard(8);

  const [activeTab, setActiveTab] = useState<TabType>("marketplace");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ExtensionMarketplaceItem[]>([]);
  const [installedMap, setInstalledMap] = useState<Record<string, InstalledExtension>>({});
  const [, setInstallVersion] = useState(0);
  const [themesList, setThemesList] = useState<Array<{ id: string; label: string }>>([]);

  const searchTimer = useRef<any>(null);

  const refreshRegistry = useCallback(async () => {
    const reg = await loadExtensionRegistry();
    setInstalledMap({ ...reg.installed });
    const th = await getInstalledThemes();
    setThemesList(th.map((t) => ({ id: t.id, label: t.label })));
  }, []);

  const executeSearch = useCallback(async (q: string) => {
    setLoading(true);
    try { setItems(await searchMarketplace(q)); } catch { setItems([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (visible) {
      refreshRegistry();
      executeSearch("");
      const unsubReg = subscribeExtensionRegistry(refreshRegistry);
      const unsubInstall = subscribeExtensionInstall(() => {
        setInstallVersion((v) => v + 1);
        refreshRegistry();
      });
      return () => {
        unsubReg();
        unsubInstall();
      };
    }
  }, [visible, refreshRegistry, executeSearch]);

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);

    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      executeSearch(text);
    }, 450);
  };

  const handleInstall = (item: ExtensionMarketplaceItem) => {
    startExtensionInstall(item, () => {
      refreshRegistry();
    });
  };

  const handleUninstall = (id: string, name: string) => {
    Alert.alert("Uninstall Extension", `Are you sure you want to remove ${name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Uninstall",
        style: "destructive",
        onPress: async () => {
          await uninstallExtension(id);
          await refreshRegistry();
        },
      },
    ]);
  };

  const handleToggle = async (id: string) => {
    await toggleExtension(id);
    await refreshRegistry();
  };

  const installedList = Object.values(installedMap);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, isKeyboardVisible && { paddingBottom: keyboardOffset }]}>
        <TouchableOpacity
          style={[styles.backdrop, { backgroundColor: theme.overlay }]}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[styles.sheet, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={styles.headerTitleRow}>
              <Octicons name="package" size={18} color={theme.accent} />
              <Text style={[styles.title, { color: theme.textPrimary }]}>VS Code Extensions</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Subheader info */}
          <View style={[styles.infoBanner, { backgroundColor: `${theme.accent}12`, borderColor: `${theme.accent}30` }]}>
            <Ionicons name="information-circle-outline" size={15} color={theme.accent} />
            <Text style={[styles.infoText, { color: theme.textSecondary }]}>
              Real marketplace extensions (Open VSX). Themes, snippets, and grammars run directly in the native editor.
            </Text>
          </View>

          {/* Tabs */}
          <View style={[styles.tabBar, { borderBottomColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === "marketplace" && { borderBottomColor: theme.accent, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab("marketplace")}
            >
              <Text style={[styles.tabText, { color: activeTab === "marketplace" ? theme.accent : theme.textSecondary }]}>
                Marketplace
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === "installed" && { borderBottomColor: theme.accent, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab("installed")}
            >
              <Text style={[styles.tabText, { color: activeTab === "installed" ? theme.accent : theme.textSecondary }]}>
                Installed ({installedList.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === "themes" && { borderBottomColor: theme.accent, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab("themes")}
            >
              <Text style={[styles.tabText, { color: activeTab === "themes" ? theme.accent : theme.textSecondary }]}>
                Themes ({themesList.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Search bar (Marketplace tab) */}
          {activeTab === "marketplace" && (
            <>
              <View style={[styles.searchRow, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                <Ionicons name="search" size={16} color={theme.textMuted} />
                <TextInput
                  style={[styles.searchInput, { color: theme.textPrimary }]}
                  placeholder="Search extensions (e.g. java, python, themes)..."
                  placeholderTextColor={theme.textMuted}
                  value={searchQuery}
                  onChangeText={handleSearchChange}
                  autoCapitalize="none"
                  showSoftInputOnFocus={!keyboardMouseMode}
                />
                {loading && <ActivityIndicator size="small" color={theme.accent} />}
              </View>
            </>
          )}

          {/* Content Lists */}
          {activeTab === "marketplace" && (
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              initialNumToRender={8}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews={Platform.OS === "android"}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const isInstalled = !!installedMap[item.id];
                const installJob = getExtensionInstallJob(item.id);
                const isInstalling = Boolean(installJob && !installJob.done);
                const installStatus = installJob?.status || "Installing...";

                return (
                  <View style={[styles.card, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}>
                    <View style={styles.cardHeader}>
                      {item.iconUrl ? (
                        <Image source={{ uri: item.iconUrl }} style={styles.cardIcon} resizeMode="contain" />
                      ) : (
                        <View style={[styles.cardIconFallback, { backgroundColor: `${theme.accent}20` }]}>
                          <Octicons name="package" size={18} color={theme.accent} />
                        </View>
                      )}
                      <View style={styles.cardMeta}>
                        <View style={styles.cardTitleRow}>
                          <Text style={[styles.cardTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                            {item.displayName}
                          </Text>
                          <Text style={[styles.cardVersion, { color: theme.textMuted }]}>v{item.version}</Text>
                        </View>
                        <Text style={[styles.cardPublisher, { color: theme.textSecondary }]}>
                          {item.publisher}
                          {item.downloadCount ? ` • ${(item.downloadCount / 1000).toFixed(0)}k downloads` : ""}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.cardDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                      {item.description}
                    </Text>

                    <View style={styles.cardActions}>
                      {isInstalling ? (
                        <View style={styles.installingRow}>
                          <ActivityIndicator size="small" color={theme.accent} />
                          <Text style={[styles.installingText, { color: theme.accent }]}>{installStatus}</Text>
                        </View>
                      ) : isInstalled ? (
                        <View style={styles.installedBadge}>
                          <Ionicons name="checkmark-circle" size={14} color={theme.accentGreen} />
                          <Text style={[styles.installedBadgeText, { color: theme.accentGreen }]}>Installed</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[styles.installBtn, { backgroundColor: theme.accent }]}
                          onPress={() => handleInstall(item)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="cloud-download-outline" size={14} color={theme.sendButtonIcon} />
                          <Text style={[styles.installBtnText, { color: theme.sendButtonIcon }]}>Install</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              }}
            />
          )}

          {activeTab === "installed" && (
            <FlatList
              data={installedList}
              keyExtractor={(item) => item.id}
              initialNumToRender={8}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews={Platform.OS === "android"}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={
                installedList.length > 0 ? (
                  <View style={[styles.hintCard, { backgroundColor: `${theme.accent}10`, borderColor: `${theme.accent}25` }]}>
                    <Ionicons name="bulb-outline" size={14} color={theme.accent} />
                    <Text style={[styles.hintText, { color: theme.textSecondary }]}>
                      Themes apply in Themes tab. Snippets appear in autocomplete. Linters/LSPs (e.g. Pyrefly) run in background editor diagnostics and in Terminal.
                    </Text>
                  </View>
                ) : null
              }
              ListEmptyComponent={
                <View style={styles.emptyView}>
                  <Octicons name="package" size={32} color={theme.textMuted} />
                  <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                    No extensions installed yet. Browse Marketplace to install themes, snippets, and tools.
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={[styles.card, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.cardIconFallback, { backgroundColor: `${theme.accent}20` }]}>
                      <Octicons name="package" size={18} color={theme.accent} />
                    </View>
                    <View style={styles.cardMeta}>
                      <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{item.displayName}</Text>
                      <Text style={[styles.cardPublisher, { color: theme.textSecondary }]}>
                        v{item.version}
                        {item.themes.length > 0 ? ` • ${item.themes.length} themes` : ""}
                        {item.snippets.length > 0 ? ` • ${item.snippets.length} snippet packs` : ""}
                        {item.binaries && item.binaries.length > 0 ? ` • ${item.binaries.length} tools (${item.binaries.join(", ")})` : ""}
                      </Text>
                    </View>
                  </View>

                  {item.binaries && item.binaries.length > 0 && (
                    <View style={[styles.featureBadgeRow, { backgroundColor: `${theme.accent}12` }]}>
                      <Ionicons name="terminal-outline" size={12} color={theme.accent} />
                      <Text style={[styles.featureBadgeText, { color: theme.textSecondary }]}>
                        Tool installed: {item.binaries.join(", ")} (active in editor diagnostics & Terminal)
                      </Text>
                    </View>
                  )}

                  <View style={styles.installedActionsRow}>
                    <TouchableOpacity
                      style={[
                        styles.toggleBtn,
                        { backgroundColor: item.enabled ? `${theme.accentGreen}20` : `${theme.accentRed}20` },
                      ]}
                      onPress={() => handleToggle(item.id)}
                    >
                      <Text style={{ color: item.enabled ? theme.accentGreen : theme.accentRed, fontSize: 12, fontWeight: "600" }}>
                        {item.enabled ? "Enabled" : "Disabled"}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.uninstallBtn, { backgroundColor: `${theme.accentRed}18` }]}
                      onPress={() => handleUninstall(item.id, item.displayName)}
                    >
                      <Ionicons name="trash-outline" size={14} color={theme.accentRed} />
                      <Text style={[styles.uninstallBtnText, { color: theme.accentRed }]}>Uninstall</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          )}

          {activeTab === "themes" && (
            <ExtensionThemesTab
              themes={themesList}
              activeThemeId={themeMode}
              theme={theme}
              onApplyTheme={(id) => setTheme(id)}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, height: "85%", paddingTop: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1 },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 16, fontWeight: "700" },
  closeBtn: { padding: 4 },
  infoBanner: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 10, padding: 8, borderRadius: 6, borderWidth: 1, gap: 6 },
  infoText: { fontSize: 11, flex: 1 },
  tabBar: { flexDirection: "row", paddingHorizontal: 16, marginTop: 8, borderBottomWidth: 1 },
  tabBtn: { paddingVertical: 8, paddingHorizontal: 12, marginRight: 8 },
  tabText: { fontSize: 13, fontWeight: "600" },
  searchRow: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 10, paddingHorizontal: 10, height: 38, borderRadius: 8, borderWidth: 1, gap: 8 },
  searchInput: { flex: 1, fontSize: 13 },
  listContent: { padding: 16, gap: 10 },
  card: { borderRadius: 8, padding: 12, borderWidth: 1, gap: 8 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardIcon: { width: 34, height: 34, borderRadius: 6 },
  cardIconFallback: { width: 34, height: 34, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  cardMeta: { flex: 1 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 13, fontWeight: "700", flex: 1 },
  cardVersion: { fontSize: 11 },
  cardPublisher: { fontSize: 11, marginTop: 2 },
  cardDesc: { fontSize: 12 },
  cardActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginTop: 2 },
  installBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  installBtnText: { fontSize: 12, fontWeight: "700" },
  installingRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  installingText: { fontSize: 12 },
  installedBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  installedBadgeText: { fontSize: 12, fontWeight: "600" },
  installedActionsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  uninstallBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  uninstallBtnText: { fontSize: 12, fontWeight: "600" },
  hintCard: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 8, borderWidth: 1, marginBottom: 6 },
  hintText: { fontSize: 11, lineHeight: 15, flex: 1 },
  featureBadgeRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  featureBadgeText: { fontSize: 11, fontWeight: "500", flex: 1 },
  emptyView: { alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 13, textAlign: "center", paddingHorizontal: 20 },
});
