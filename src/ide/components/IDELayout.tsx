import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { View, StyleSheet, StatusBar, Animated, Keyboard, Platform } from "react-native";
import { showAppDialog } from "../services/appDialog";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FileExplorer } from "./FileExplorer";
import { EditorView } from "./EditorView";
import { FileActionModal } from "./FileActionModal";
import { TerminalView } from "./TerminalView";
import { WebBrowserPreview } from "./WebBrowserPreview";
import { GitHubDesktopView } from "./git/GitHubDesktopView";
import { IDEBottomBar } from "./IDEBottomBar";
import { WorkspaceLoadingScreen } from "./WorkspaceLoadingScreen";
import { ExtensionMarketplaceModal } from "./extensions/ExtensionMarketplaceModal";
import { runningTasksService, RunningTask } from "../../ai/services/runningTasksService";
import { FileNode } from "../types";
import { useSidebarResizer } from "./useSidebarResizer";
import { useWorkspaceFileActions } from "./useWorkspaceFileActions";
import { readFileContent, loadOrCreateDefaultWorkspace, loadWorkspace, Workspace } from "../services/workspaceService";
import { useDebouncedFileSave } from "./useDebouncedFileSave";
import { useWorkspaceAutoRefresh } from "./useWorkspaceAutoRefresh";
import { useTheme } from "../../theme/themeContext";
import { useOrientation } from "../../theme/useOrientation";
import { useIdeActionBridge } from "./useIdeActionBridge";
import { useKeyboardMouseMode } from "../context/KeyboardMouseContext";
import { SettingsModal } from "./SettingsModal";
import { resolveChatPathToRelative } from "../services/chatFileLinkService";
import { useRecentFiles } from "./editor/useRecentFiles";
import { useIDELayoutCallbacks, addVisitedTab } from "./useIDELayoutCallbacks";
import { useSystemBackHandler } from "./useSystemBackHandler";
import { useIDELayoutStyles } from "./useIDELayoutStyles";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import {
  BottomTabVisibility, DEFAULT_BOTTOM_TABS, firstVisibleTab,
  loadBottomTabs, normalizeBottomTabs, subscribeConfigChanges, ToggleableBottomTab,
} from "../services/configService";

interface IDELayoutProps {
  workspaceId?: string;
  onBackToPicker?: () => void;
  isActive?: boolean;
}

const shortLoadPath = (p: string) =>
  (p || "").replace(/^file:\/\//, "").split("/").filter(Boolean).slice(-2).join("/");

// Keystroke isolation: the active file's content lives in IDELayout state, so
// every character re-renders it. These memo wrappers stop that cascade from
// reaching sibling tabs (terminal pty view, browser webview, git tree), which
// only re-render when their OWN props change.
const MemoTerminalView = React.memo(TerminalView);
const MemoWebBrowserPreview = React.memo(WebBrowserPreview);
const MemoGitHubDesktopView = React.memo(GitHubDesktopView);

export function IDELayout({ workspaceId, onBackToPicker, isActive = true }: IDELayoutProps) {
  const insets = useSafeAreaInsets();
  const { isLandscape } = useOrientation();
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [activeFile, setActiveFile] = useState<FileNode | null>(null);
  const { recentFiles, recordRecentFile, removeRecentFile } = useRecentFiles(workspaceId);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [bottomTab, setBottomTab] = useState<ToggleableBottomTab>("editor");
  const [visitedTabs, setVisitedTabs] = useState<Set<ToggleableBottomTab>>(() => new Set([bottomTab]));
  const [visibleTabs, setVisibleTabs] = useState<BottomTabVisibility>({ ...DEFAULT_BOTTOM_TABS });
  const visibleTabsRef = useRef<BottomTabVisibility>({ ...DEFAULT_BOTTOM_TABS });

  useEffect(() => { setVisitedTabs((prev) => addVisitedTab(prev, bottomTab)); }, [bottomTab]);
  useEffect(() => { setVisitedTabs(new Set([bottomTab])); }, [workspaceId]);

  // Never land on a hidden tab: redirect to the first visible one.
  const safeSetBottomTab = useCallback((tab: ToggleableBottomTab) => {
    if (!visibleTabsRef.current[tab]) {
      setBottomTab(firstVisibleTab(visibleTabsRef.current));
      return;
    }
    setBottomTab(tab);
  }, []);

  useEffect(() => {
    loadBottomTabs().then((tabs) => {
      visibleTabsRef.current = tabs;
      setVisibleTabs(tabs);
      // Initial tab may have loaded hidden (e.g. editor off): correct it.
      setBottomTab((current) => (!tabs[current] ? firstVisibleTab(tabs) : current));
    });
    const unsub = subscribeConfigChanges((cfg) => {
      const tabs = normalizeBottomTabs(cfg.bottomTabs);
      visibleTabsRef.current = tabs;
      setVisibleTabs(tabs);
    });
    return () => { unsub(); };
  }, []);

  // If the active tab gets disabled in settings, fall back to first visible.
  useEffect(() => {
    if (!visibleTabs[bottomTab]) {
      setBottomTab(firstVisibleTab(visibleTabs));
    }
  }, [visibleTabs, bottomTab]);
  const [isLandscapeNavbarHidden, setIsLandscapeNavbarHidden] = useState(true);
  const isLandscapeNavbarHiddenRef = useRef(true);
  const navbarTurnedOffReasonRef = useRef<"auto" | "manual" | null>("auto");
  const manualSidebarHiddenRef = useRef(false);
  const [browserUrl, setBrowserUrl] = useState<string>("");
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isSettingsModalVisible, setSettingsModalVisible] = useState(false);
  const [isMarketplaceVisible, setMarketplaceVisible] = useState(false);
  const [runningTasks, setRunningTasks] = useState<RunningTask[]>([]);
  const [loadStatus, setLoadStatus] = useState("Starting…");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadSeq, setLoadSeq] = useState(0);
  const lastLoadStatusRef = useRef(0);
  const prevLoadedWsIdRef = useRef<string | null>(null);
  // Speed: stable ref so content-change callback never recreates per keystroke.
  const activeFileRef = useRef<FileNode | null>(null);
  activeFileRef.current = activeFile;
  const lastLocalEditTimeRef = useRef(0);
  const runningTasksSigRef = useRef("");

  useEffect(() => {
    setIsSidebarOpen(!isLandscape);
    if (isLandscape) { setIsLandscapeNavbarHidden(true); isLandscapeNavbarHiddenRef.current = true; navbarTurnedOffReasonRef.current = "auto"; }
  }, [isLandscape]);

  useEffect(() => { StatusBar.setHidden(isLandscape, "fade"); }, [isLandscape]);

  useEffect(() => {
    const unsubTasks = runningTasksService.subscribe((currentTasks) => {
      const sig = currentTasks.map((t) => `${t.id}|${t.status}`).join(";");
      if (sig !== runningTasksSigRef.current) {
        runningTasksSigRef.current = sig;
        setRunningTasks(currentTasks);
      }
    });
    // Never auto-switch tabs on background task registration — the user
    // stays where they are (e.g. chat). Tasks surface via RunningTasksBar
    // badge; explicit taps navigate.
    return () => { unsubTasks(); };
  }, []);

  // Open a raw agent/chat file path inside the given workspace, normalizing
  // PRoot (/workspace, /workspaces/<id>) and file:// prefixes to relative paths.
  const applyOpenFile = useCallback(async (targetWs: Workspace, rawPath: string) => {
    const relative = resolveChatPathToRelative(rawPath, targetWs.id);
    if (!relative) return;
    try {
      const content = await readFileContent(targetWs.id, relative);
      const fileName = relative.split("/").pop() || relative;
      const fileNode: FileNode = { id: `${targetWs.id}::${relative}`, name: fileName, type: "file", path: relative, content: content || "" };
      setActiveFile(fileNode);
      recordRecentFile(fileNode, false);
      safeSetBottomTab("editor");
      if (!content) showAppDialog({ title: "File opened", message: `${fileName} is empty or could not be read at:\n${relative}` });
    } catch (e: any) {
      showAppDialog({ title: "Could not open file", message: e?.message || relative });
    }
  }, [safeSetBottomTab, recordRecentFile]);

  const handleOpenInBrowser = useCallback((u: string) => { setBrowserUrl(u); safeSetBottomTab("browser"); }, [safeSetBottomTab]);
  const onOpenTerminal = useCallback(() => safeSetBottomTab("terminal"), [safeSetBottomTab]);

  const { consumePendingActions } = useIdeActionBridge({
    workspace,
    applyOpenFile,
    setBrowserUrl,
    safeSetBottomTab,
  });
  const consumePendingActionsRef = useRef(consumePendingActions);
  consumePendingActionsRef.current = consumePendingActions;

  useEffect(() => {
    const s = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setIsKeyboardVisible(true));
    const h = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setIsKeyboardVisible(false));
    return () => { s.remove(); h.remove(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const onProgress = (dirs: number, path: string) => {
      const now = Date.now();
      if (now - lastLoadStatusRef.current > 300) {
        lastLoadStatusRef.current = now;
        if (!cancelled) setLoadStatus(`Scanning ${dirs} folders… ${shortLoadPath(path)}`);
      }
    };
    const loadWs = async () => {
      let ws: Workspace;
      try {
        ws = workspaceId
          ? await loadWorkspace(workspaceId, onProgress)
          : await loadOrCreateDefaultWorkspace();
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || "Failed to load workspace");
        return;
      }
      if (cancelled) return;
      setWorkspace(ws);
      // Reset active file only when changing to a different workspace
      if (prevLoadedWsIdRef.current !== ws.id) {
        prevLoadedWsIdRef.current = ws.id;
        if (!cancelled) setActiveFile(null);
      }
      await consumePendingActionsRef.current(ws);
    };
    loadWs();
    return () => { cancelled = true; };
  }, [workspaceId, loadSeq]);

  const { scheduleSave, flush: flushPendingSave } = useDebouncedFileSave(workspace?.id, (filePath) => {
    // Recent-files bump moved OFF the keystroke path: record once per typing
    // pause (when the debounced write lands) instead of per character.
    const current = activeFileRef.current;
    if (current && (current.path || current.name) === filePath) recordRecentFile(current, true);
  });
  const handleBackToPicker = useCallback(() => { flushPendingSave(); onBackToPicker?.(); }, [flushPendingSave, onBackToPicker]);

  const refreshWorkspace = useCallback(async () => {
    if (!workspace) return;
    try {
      const updated = await loadWorkspace(workspace.id);
      setWorkspace(updated);
      const af = activeFileRef.current;
      if (af?.path && Date.now() - lastLocalEditTimeRef.current > 3000) {
        const disk = await readFileContent(workspace.id, af.path);
        if (disk !== null && disk !== af.content && Date.now() - lastLocalEditTimeRef.current > 3000) {
          setActiveFile((prev) => (prev && prev.id === af.id ? { ...prev, content: disk } : prev));
        }
      }
    } catch (_) {}
  }, [workspace]);

  useWorkspaceAutoRefresh(workspace?.id, (updated) => {
    setWorkspace(updated);
    const af = activeFileRef.current;
    if (af?.path && workspace?.id && Date.now() - lastLocalEditTimeRef.current > 3000) {
      readFileContent(workspace.id, af.path).then((disk) => {
        if (disk !== null && disk !== af.content && Date.now() - lastLocalEditTimeRef.current > 3000) {
          setActiveFile((prev) => (prev && prev.id === af.id ? { ...prev, content: disk } : prev));
        }
      }).catch(() => {});
    }
  });

  // Editor tab-switch refresh REMOVED: refreshWorkspace's identity changes on
  // every workspace update, so this effect re-fired loadWorkspace (full
  // recursive tree scan) back-to-back for as long as the editor was open —
  // a runaway that saturated the native FS bridge and stalled the editor.
  // useWorkspaceAutoRefresh already keeps the tree current (debounced,
  // fingerprint-gated, change-subscribed) independent of the active tab;
  // FileExplorer's pull-to-refresh still calls refreshWorkspace directly.

  const handleSelectFile = useCallback(async (file: any) => {
    if (!file || file.type === "folder" || !workspace) return;
    const fileName = file.name || (file.path ? file.path.split("/").pop() : "") || "file";
    const targetPath = file.path || file.name || fileName;
    const selected: FileNode = {
      ...file,
      id: file.id || `${workspace.id}::${targetPath}`,
      name: fileName,
      path: targetPath,
      type: "file",
      content: file.content || "",
    };
    setActiveFile(selected);
    recordRecentFile(selected, false);
    safeSetBottomTab("editor");
    // Explorer stays open on file select — it closes only on edit-mode start or manual collapse.
    try {
      await flushPendingSave();
      const content = await readFileContent(workspace.id, targetPath);
      setActiveFile((prev) => (prev && prev.id === selected.id ? { ...prev, content: content ?? "" } : prev));
    } catch (_) {}
  }, [workspace, safeSetBottomTab, flushPendingSave, recordRecentFile]);

  const handleContentChange = useCallback((newContent: string) => {
    lastLocalEditTimeRef.current = Date.now();
    const current = activeFileRef.current;
    if (!current) return;
    const targetPath = current.path || current.name;
    const targetId = current.id;
    // Content prop MUST update per keystroke: CodeMirror's anti-echo contract
    // requires RN to converge to the emitted text (stale props would re-inject
    // after the echo TTL as false "external edits"). recordRecentFile is NOT
    // called here anymore — it moved to the debounced-save onFlushed callback
    // (once per typing pause), killing one full-tree render per character.
    setActiveFile((prev) => (prev && prev.id === targetId ? { ...prev, content: newContent } : prev));
    scheduleSave(targetPath, newContent);
  }, [scheduleSave]);

  const {
    selectedNode, modalMode, setModalMode, modalInput, setModalInput, menuPosition,
    handleLongPressNode, confirmAndDeleteNode, handleRenameSubmit, handleCreateNode,
    handleMoveNode, handleRunActiveFile,
  } = useWorkspaceFileActions({
    workspace, setWorkspace, activeFile, setActiveFile, refreshWorkspace,
    onOpenTerminal,
    onOpenPreview: handleOpenInBrowser,
  });

  // Speed: stable callbacks so memoized children don't re-render per parent tick.
  const {
    handleToggleCollapse, handleQuickAddFile, handleShowSidebar,
    handleOpenSettings, handleCloseSettings, handleOpenMarketplace,
    handleCloseMarketplace, handleNavigateToEditor,
    handleHideNavbar, handleShowNavbar, handleRetryLoad,
    handleCloseFileModal, handleSelectRename, handleSelectAdd,
    handleAddSubmit, handleBackToOptions, handleEditModeChange,
  } = useIDELayoutCallbacks({
    safeSetBottomTab, setIsSidebarOpen, setModalInput, setModalMode,
    setSettingsModalVisible, setMarketplaceVisible, setLoadError,
    setLoadStatus, setLoadSeq, selectedNode, modalInput, handleCreateNode,
    manualSidebarHiddenRef, isLandscapeNavbarHiddenRef,
    navbarTurnedOffReasonRef, setIsLandscapeNavbarHidden,
  });

  // Smooth 60fps native sidebar dragging with auto-minimize on swipe-all-the-way
  const { sidebarWidthAnim, isDraggingSidebar, resizerPanHandlers } = useSidebarResizer(130, handleToggleCollapse, isSidebarOpen);
  useKeyboardShortcuts({ enabled: keyboardMouseMode, onSwitchTab: safeSetBottomTab });

  const backNav = useSystemBackHandler({ onEditModeChange: handleEditModeChange, onCloseProject: handleBackToPicker, ideVisible: !!isActive });

  const {
    runningTaskCount, containerStyle, sidebarAnimStyle,
    workspaceStyle, editorContainerStyle, tabContentStyle,
  } = useIDELayoutStyles({
    runningTasks,
    bgPrimary: theme.bgPrimary,
    bgSecondary: theme.bgSecondary,
    isLandscape,
    insetTop: insets.top,
    insetLeft: insets.left,
    insetRight: insets.right,
    sidebarWidthAnim,
  });

  if (!workspace) {
    return (
      <WorkspaceLoadingScreen
        key={loadSeq}
        statusText={loadError ? `Couldn't open workspace: ${loadError}` : loadStatus}
        isError={!!loadError}
        onBack={handleBackToPicker}
        onRetry={handleRetryLoad}
      />
    );
  }

  return (
    <View style={containerStyle}>
      <StatusBar
        barStyle={theme.isDark ? "light-content" : "dark-content"}
        backgroundColor={theme.bgSecondary}
        hidden={isLandscape}
      />

      {/* Main Workspace Area */}
      <View style={workspaceStyle}>
        {isSidebarOpen && bottomTab === "editor" && (
          <Animated.View style={sidebarAnimStyle}>
            <FileExplorer
              projectName={workspace.name}
              files={workspace.root.children || []}
              onSelectFile={handleSelectFile}
              activeFileId={activeFile?.id}
              onToggleCollapse={handleToggleCollapse}
              onLongPressNode={handleLongPressNode}
              onCreateFile={handleCreateNode}
              onQuickAddFile={handleQuickAddFile}
              onMoveNode={handleMoveNode}
              onRefresh={refreshWorkspace}
              resizerPanHandlers={resizerPanHandlers}
              isDraggingSidebar={isDraggingSidebar}
            />
          </Animated.View>
        )}

        <View style={editorContainerStyle}>
          {visitedTabs.has("editor") && (
            <View style={[tabContentStyle, bottomTab !== "editor" && styles.hiddenTab]}>
              <EditorView
                fileName={activeFile?.name}
                activeFilePath={activeFile?.path}
                content={activeFile?.content || ""}
                onChangeContent={handleContentChange}
                onExitProject={handleBackToPicker}
                onToggleSidebar={!isSidebarOpen ? handleShowSidebar : undefined}
                onRunFile={handleRunActiveFile}
                onEditModeChange={backNav.handleEditModeChange}
                exitEditSignal={backNav.exitEditSignal}
                onOpenSettings={handleOpenSettings}
                recentFiles={recentFiles}
                onSelectRecentFile={handleSelectFile}
                onCloseRecentFile={removeRecentFile}
                visible={bottomTab === "editor"}
              />
            </View>
          )}

          {visitedTabs.has("terminal") && (
            <View style={[tabContentStyle, bottomTab !== "terminal" && styles.hiddenTab]}>
              <TerminalView key={workspace?.id || "none"} workspaceId={workspace?.id} visible={bottomTab === "terminal"} />
            </View>
          )}
          {visitedTabs.has("browser") && (
            <View style={[tabContentStyle, bottomTab !== "browser" && styles.hiddenTab]}>
              <WebBrowserPreview initialUrl={browserUrl} workspaceId={workspace?.id} />
            </View>
          )}
          {visitedTabs.has("git") && (
            <View style={[tabContentStyle, bottomTab !== "git" && styles.hiddenTab]}>
              <GitHubDesktopView workspaceId={workspace?.id} projectName={workspace?.name} visible={bottomTab === "git"} />
            </View>
          )}
        </View>
      </View>

      {/* Bottom Panel Toggle Bar */}
      {!isKeyboardVisible && (
        <IDEBottomBar
          bottomTab={bottomTab}
          onChangeTab={safeSetBottomTab}
          runningTaskCount={runningTaskCount}
          compact={isLandscape}
          visibleTabs={visibleTabs}
          isLandscapeNavbarHidden={isLandscapeNavbarHidden}
          onHideNavbar={isLandscape || keyboardMouseMode ? handleHideNavbar : undefined}
          onShowNavbar={handleShowNavbar}
          keyboardMouseMode={keyboardMouseMode}
        />
      )}

      {/* File Action Modal */}
      {modalMode !== "none" && (
        <FileActionModal
          modalMode={modalMode} selectedNode={selectedNode} menuPosition={menuPosition}
          modalInput={modalInput} onChangeInput={setModalInput} onClose={handleCloseFileModal}
          onSelectRename={handleSelectRename}
          onSelectAdd={handleSelectAdd}
          onDeleteConfirm={confirmAndDeleteNode} onRenameSubmit={handleRenameSubmit}
          onAddSubmit={handleAddSubmit}
          onBackToOptions={handleBackToOptions}
        />
      )}

      {/* Settings & Marketplace Modals */}
      <SettingsModal
        visible={isSettingsModalVisible} onClose={handleCloseSettings}
        workspaceId={workspace?.id} onSyncWorkspace={refreshWorkspace}
      />
      <ExtensionMarketplaceModal visible={isMarketplaceVisible} onClose={handleCloseMarketplace} />
    </View>
  );
}

const styles = StyleSheet.create({
  hiddenTab: { display: "none" },
});
