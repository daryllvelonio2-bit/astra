import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { View, StyleSheet, StatusBar, Animated, Keyboard, Platform } from "react-native";
import { showAppDialog } from "../services/appDialog";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FileExplorer } from "./FileExplorer";
import { EditorView } from "./EditorView";
import { TerminalView } from "./TerminalView";
import { WebBrowserPreview } from "./WebBrowserPreview";
import { GitHubDesktopView } from "./git/GitHubDesktopView";
import { HostingPanel } from "./hosting/HostingPanel";
import { IDEBottomBar } from "./IDEBottomBar";
import { WorkspaceLoadingScreen } from "./WorkspaceLoadingScreen";
import { IDEModals } from "./IDEModals";
import { FileNode } from "../types";
import { useSidebarResizer } from "./useSidebarResizer";
import { useWorkspaceFileActions } from "./useWorkspaceFileActions";
import { useImportExport } from "./import/useImportExport";
import { readFileContent, loadOrCreateDefaultWorkspace, Workspace } from "../services/workspaceService";
import { loadWorkspaceShallow } from "../services/workspaceTreeService";
import { useDebouncedFileSave } from "./useDebouncedFileSave";
import { useWorkspaceAutoRefresh } from "./useWorkspaceAutoRefresh";
import { useTheme } from "../../theme/themeContext";
import { useOrientation } from "../../theme/useOrientation";
import { useIdeActionBridge } from "./useIdeActionBridge";
import { useKeyboardMouseMode } from "../context/KeyboardMouseContext";
import { PanelErrorBoundary } from "./PanelErrorBoundary";
import { useRecentFiles } from "./editor/useRecentFiles";
import { useWorkspaceOpenFile } from "./useWorkspaceOpenFile";
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
  // Queued "open file and jump to line" request (from project search).
  const [pendingJump, setPendingJump] = useState<{ path: string; line: number; nonce: number } | null>(null);
  const [isSearchVisible, setSearchVisible] = useState(false);
  const requestJump = useCallback((path: string, line: number) => {
    setPendingJump({ path, line, nonce: Date.now() });
  }, []);
  const clearJump = useCallback(() => setPendingJump(null), []);
  const handleOpenSearch = useCallback(() => setSearchVisible(true), []);
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
  const [loadStatus, setLoadStatus] = useState("Starting…");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadSeq, setLoadSeq] = useState(0);
  const lastLoadStatusRef = useRef(0);
  const prevLoadedWsIdRef = useRef<string | null>(null);
  // Speed: stable ref so content-change callback never recreates per keystroke.
  const activeFileRef = useRef<FileNode | null>(null);
  activeFileRef.current = activeFile;
  const lastLocalEditTimeRef = useRef(0);

  useEffect(() => {
    setIsSidebarOpen(!isLandscape);
    if (isLandscape) { setIsLandscapeNavbarHidden(true); isLandscapeNavbarHiddenRef.current = true; navbarTurnedOffReasonRef.current = "auto"; }
  }, [isLandscape]);

  useEffect(() => { StatusBar.setHidden(isLandscape, "fade"); }, [isLandscape]);

  // Keystroke-adjacent save loop lives here (needs activeFileRef).
  const { scheduleSave, flush: flushPendingSave } = useDebouncedFileSave(workspace?.id, (filePath) => {
    // Recent-files bump moved OFF the keystroke path: record once per typing
    // pause (when the debounced write lands) instead of per character.
    const current = activeFileRef.current;
    if (current && (current.path || current.name) === filePath) recordRecentFile(current, true);
  });

  // Agent/chat links, project-search hits and explorer taps all open files here.
  const { applyOpenFile, handleSearchOpenMatch, handleSelectFile } = useWorkspaceOpenFile({
    workspace, setActiveFile, recordRecentFile, safeSetBottomTab, requestJump,
    flushPendingSave,
  });

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
          ? await loadWorkspaceShallow(workspaceId, onProgress)
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

  const handleBackToPicker = useCallback(() => { flushPendingSave(); onBackToPicker?.(); }, [flushPendingSave, onBackToPicker]);

  const refreshWorkspace = useCallback(async () => {
    if (!workspace) return;
    try {
      const updated = await loadWorkspaceShallow(workspace.id);
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

  const handleContentChange = useCallback((newContent: string) => {
    const current = activeFileRef.current;
    if (!current) return;
    if (current.content === newContent) return;
    lastLocalEditTimeRef.current = Date.now();
    const targetPath = current.path || current.name;
    const targetId = current.id;
    // Content prop MUST update per keystroke: CodeMirror's anti-echo contract
    // requires RN to converge to the emitted text (stale props would re-inject
    // after the echo TTL as false "external edits"). recordRecentFile is NOT
    // called here anymore — it moved to the debounced-save onFlushed callback
    // (once per typing pause), killing one full-tree render per character.
    // Equality bailouts keep ref identity on echo/no-op emits so memo'd
    // siblings skip the render entirely.
    setActiveFile((prev) => {
      if (!prev || prev.id !== targetId) return prev;
      if (prev.content === newContent) return prev;
      return { ...prev, content: newContent };
    });
    scheduleSave(targetPath, newContent);
  }, [scheduleSave]);

  const {
    selectedNode, modalMode, setModalMode, modalInput, setModalInput, menuPosition,
    handleLongPressNode, confirmAndDeleteNode, handleRenameSubmit, handleCreateNode,
    handleMoveNode, handleRunActiveFile, handleDeleteActiveFile,
  } = useWorkspaceFileActions({
    workspace, setWorkspace, activeFile, setActiveFile, refreshWorkspace,
    onOpenTerminal,
    onOpenPreview: handleOpenInBrowser,
    onRemoveRecentFile: removeRecentFile,
  });

  // Import from phone storage + export project/file (3-dot menu).
  const importExport = useImportExport({
    workspaceId: workspace?.id,
    projectName: workspace?.name,
    activeFile,
    refreshWorkspace,
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
  const {
    sidebarWidthAnim, isDraggingSidebar, resizerPanHandlers,
    edgePanHandlers, handlePullStart, handlePullMove, handlePullEnd,
  } = useSidebarResizer(130, handleToggleCollapse, isSidebarOpen, handleShowSidebar);
  useKeyboardShortcuts({ enabled: keyboardMouseMode, onSwitchTab: safeSetBottomTab });

  const backNav = useSystemBackHandler({ onEditModeChange: handleEditModeChange, onCloseProject: handleBackToPicker, ideVisible: !!isActive });

  const {
    containerStyle, sidebarAnimStyle,
    workspaceStyle, editorContainerStyle, tabContentStyle,
  } = useIDELayoutStyles({
    bgPrimary: theme.bgPrimary,
    bgSecondary: theme.bgSecondary,
    isLandscape,
    insetTop: insets.top,
    insetLeft: insets.left,
    insetRight: insets.right,
    sidebarWidthAnim,
  });

  // Keystroke isolation: the explorer subtree is built as ONE memoized element.
  // Every keystroke re-renders IDELayout via setActiveFile; keeping this element
  // identity stable (workspace + explorer callbacks only, all stable while
  // typing) lets React bail out of reconciling the whole file tree entirely.
  const sidebarElement = useMemo(() => {
    if (!workspace) return null;
    return (
      <Animated.View style={sidebarAnimStyle} pointerEvents={isSidebarOpen ? "auto" : "none"}>
        <PanelErrorBoundary panelName="Explorer" resetKey={workspace.id}>
          <FileExplorer
            projectName={workspace.name}
            workspaceId={workspace.id}
            files={workspace.root.children || []}
            onSelectFile={handleSelectFile}
            activeFileId={activeFile?.id}
            onToggleCollapse={handleToggleCollapse}
            onLongPressNode={handleLongPressNode}
            onCreateFile={handleCreateNode}
            onQuickAddFile={handleQuickAddFile}
            onMoveNode={handleMoveNode}
            onRefresh={refreshWorkspace}
            onOpenSearch={handleOpenSearch}
            resizerPanHandlers={resizerPanHandlers} isDraggingSidebar={isDraggingSidebar}
          />
        </PanelErrorBoundary>
      </Animated.View>
    );
  }, [
    workspace, sidebarAnimStyle, isSidebarOpen, activeFile?.id, handleSelectFile,
    handleToggleCollapse, handleLongPressNode, handleCreateNode, handleQuickAddFile,
    handleMoveNode, refreshWorkspace, handleOpenSearch, resizerPanHandlers, isDraggingSidebar,
  ]);

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
        <View style={editorContainerStyle}>
          {visitedTabs.has("editor") && (
            <View style={[tabContentStyle, bottomTab !== "editor" && styles.hiddenTab]}>
              <PanelErrorBoundary panelName="Editor" resetKey={activeFile?.id || workspace?.id}>
              <EditorView
                fileName={activeFile?.name}
                workspaceName={workspace.name}
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
                jumpSignal={pendingJump}
                onJumpConsumed={clearJump}
                onOpenSearch={handleOpenSearch}
                onDeleteFile={handleDeleteActiveFile}
                onImport={importExport.handleOpenImport}
                onExport={importExport.handleOpenExport}
                onManualSave={flushPendingSave}
                isSidebarOpen={isSidebarOpen}
                onPullStart={handlePullStart} onPullMove={handlePullMove} onPullEnd={handlePullEnd}
                edgePanHandlers={edgePanHandlers}
                sidebar={sidebarElement}
              />
              </PanelErrorBoundary>
            </View>
          )}

          {visitedTabs.has("terminal") && (
            <View style={[tabContentStyle, bottomTab !== "terminal" && styles.hiddenTab]}>
              <PanelErrorBoundary panelName="Terminal" resetKey={workspace?.id}>
              <MemoTerminalView key={workspace?.id || "none"} workspaceId={workspace?.id} visible={bottomTab === "terminal"} />
              </PanelErrorBoundary>
            </View>
          )}
          {/* Browser preview is the one tab that is NOT kept alive in the
              background: a mounted WebView keeps its renderer resident even
              under display:none, and this tab is the least-reused of the four.
              It remounts (and reloads initialUrl) on return. */}
          {bottomTab === "browser" && (
            <View style={tabContentStyle}>
              <PanelErrorBoundary panelName="Browser" resetKey={workspace?.id}>
              <MemoWebBrowserPreview initialUrl={browserUrl} workspaceId={workspace?.id} onUrlChange={setBrowserUrl} />
              </PanelErrorBoundary>
            </View>
          )}
          {visitedTabs.has("git") && (
            <View style={[tabContentStyle, bottomTab !== "git" && styles.hiddenTab]}>
              <PanelErrorBoundary panelName="Git" resetKey={workspace?.id}>
              <MemoGitHubDesktopView workspaceId={workspace?.id} projectName={workspace?.name} visible={bottomTab === "git"} onSyncWorkspace={refreshWorkspace} />
              </PanelErrorBoundary>
            </View>
          )}
          {/* Host is kept alive like Git rather than remounted like Browser: it
              subscribes to the hosting service, and a running server + tunnel
              must not be dropped just because the user glanced at the editor.
              The panel is switched on from Settings -> BOTTOM BAR NAVIGATION. */}
          {visitedTabs.has("host") && (
            <View style={[tabContentStyle, bottomTab !== "host" && styles.hiddenTab]}>
              <PanelErrorBoundary panelName="Host" resetKey={workspace?.id}>
                <HostingPanel
                  workspaceId={workspace?.id}
                  projectName={workspace?.name}
                  rootNames={(workspace?.root?.children || []).map((n) => n.name)}
                  onOpenBrowser={handleOpenInBrowser}
                />
              </PanelErrorBoundary>
            </View>
          )}
        </View>
      </View>

      {/* Bottom Panel Toggle Bar */}
      {!isKeyboardVisible && (
        <IDEBottomBar
          bottomTab={bottomTab}
          onChangeTab={safeSetBottomTab}
          runningTaskCount={0}
          compact={isLandscape}
          visibleTabs={visibleTabs}
          isLandscapeNavbarHidden={isLandscapeNavbarHidden}
          onHideNavbar={isLandscape || keyboardMouseMode ? handleHideNavbar : undefined}
          onShowNavbar={handleShowNavbar}
          keyboardMouseMode={keyboardMouseMode}
        />
      )}

      <IDEModals
        modalMode={modalMode} selectedNode={selectedNode} menuPosition={menuPosition}
        modalInput={modalInput} onChangeInput={setModalInput} onCloseFileModal={handleCloseFileModal}
        onSelectRename={handleSelectRename} onSelectAdd={handleSelectAdd}
        onDeleteConfirm={confirmAndDeleteNode} onRenameSubmit={handleRenameSubmit}
        onAddSubmit={handleAddSubmit} onBackToOptions={handleBackToOptions}
        workspaceId={workspace?.id}
        isSettingsVisible={isSettingsModalVisible} onCloseSettings={handleCloseSettings}
        refreshWorkspace={refreshWorkspace}
        isMarketplaceVisible={isMarketplaceVisible} onCloseMarketplace={handleCloseMarketplace}
        isSearchVisible={isSearchVisible} onCloseSearch={() => setSearchVisible(false)}
        onSearchOpenMatch={handleSearchOpenMatch}
        io={importExport} projectName={workspace?.name} fileName={activeFile?.name}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hiddenTab: { display: "none" },
});
