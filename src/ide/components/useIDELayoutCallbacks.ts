import { useCallback, RefObject } from "react";
import { ToggleableBottomTab } from "../services/configService";

interface FileModalNode {
  name?: string;
}

interface CallbacksParams {
  safeSetBottomTab: (tab: ToggleableBottomTab) => void;
  setIsSidebarOpen: (open: boolean) => void;
  setModalInput: (text: string) => void;
  setModalMode: (mode: any) => void;
  setSettingsModalVisible: (visible: boolean) => void;
  setMarketplaceVisible: (visible: boolean) => void;
  setLoadError: (err: string | null) => void;
  setLoadStatus: (status: string) => void;
  setLoadSeq: (updater: (s: number) => number) => void;
  selectedNode?: FileModalNode | null;
  modalInput: string;
  handleCreateNode: (name: string) => void;
  manualSidebarHiddenRef: RefObject<boolean>;
  isLandscapeNavbarHiddenRef: RefObject<boolean>;
  navbarTurnedOffReasonRef: RefObject<"auto" | "manual" | null>;
  setIsLandscapeNavbarHidden: (hidden: boolean) => void;
}

const MAX_LIVE_TABS = 5;
// Pinned: editor (keep-alive), terminal (shells die on unmount).
// Others reconstruct on revisit — no user data lost.
const PINNED_TABS: ToggleableBottomTab[] = ["editor", "terminal"];

/** Add a tab to the visited set, evicting oldest unpinned tab past the cap. */
export function addVisitedTab(
  prev: Set<ToggleableBottomTab>,
  tab: ToggleableBottomTab
): Set<ToggleableBottomTab> {
  if (prev.has(tab)) return prev;
  const next = new Set(prev);
  next.add(tab);
  while (next.size > MAX_LIVE_TABS) {
    let evicted = false;
    for (const t of next) {
      if (t !== tab && !PINNED_TABS.includes(t)) {
        next.delete(t);
        evicted = true;
        break;
      }
    }
    if (!evicted) break;
  }
  return next;
}

/**
 * Stable IDE callbacks so memoized children don't re-render per parent tick.
 * No behavior change — same state transitions, stable references.
 */
export function useIDELayoutCallbacks(p: CallbacksParams) {
  const {
    safeSetBottomTab, setIsSidebarOpen, setModalInput, setModalMode,
    setSettingsModalVisible, setMarketplaceVisible, setLoadError,
    setLoadStatus, setLoadSeq, selectedNode, modalInput, handleCreateNode,
    manualSidebarHiddenRef, isLandscapeNavbarHiddenRef,
    navbarTurnedOffReasonRef, setIsLandscapeNavbarHidden,
  } = p;

  const handleToggleCollapse = useCallback(() => {
    manualSidebarHiddenRef.current = true;
    setIsSidebarOpen(false);
  }, [manualSidebarHiddenRef, setIsSidebarOpen]);

  const handleQuickAddFile = useCallback(() => {
    setModalInput("");
    setModalMode("add");
  }, [setModalInput, setModalMode]);

  const handleShowSidebar = useCallback(() => {
    manualSidebarHiddenRef.current = false;
    setIsSidebarOpen(true);
  }, [manualSidebarHiddenRef, setIsSidebarOpen]);

  const handleOpenSettings = useCallback(() => setSettingsModalVisible(true), [setSettingsModalVisible]);
  const handleCloseSettings = useCallback(() => setSettingsModalVisible(false), [setSettingsModalVisible]);
  const handleOpenMarketplace = useCallback(() => setMarketplaceVisible(true), [setMarketplaceVisible]);
  const handleCloseMarketplace = useCallback(() => setMarketplaceVisible(false), [setMarketplaceVisible]);
  const handleNavigateToEditor = useCallback(() => safeSetBottomTab("editor"), [safeSetBottomTab]);

  const handleHideNavbar = useCallback(() => {
    setIsLandscapeNavbarHidden(true);
    isLandscapeNavbarHiddenRef.current = true;
    navbarTurnedOffReasonRef.current = "manual";
  }, [setIsLandscapeNavbarHidden, isLandscapeNavbarHiddenRef, navbarTurnedOffReasonRef]);

  const handleShowNavbar = useCallback(() => {
    setIsLandscapeNavbarHidden(false);
    isLandscapeNavbarHiddenRef.current = false;
    navbarTurnedOffReasonRef.current = null;
  }, [setIsLandscapeNavbarHidden, isLandscapeNavbarHiddenRef, navbarTurnedOffReasonRef]);

  const handleRetryLoad = useCallback(() => {
    setLoadError(null);
    setLoadStatus("Retrying…");
    setLoadSeq((s) => s + 1);
  }, [setLoadError, setLoadStatus, setLoadSeq]);

  const handleCloseFileModal = useCallback(() => setModalMode("none"), [setModalMode]);

  const handleSelectRename = useCallback(() => {
    setModalInput(selectedNode?.name || "");
    setModalMode("rename");
  }, [selectedNode?.name, setModalInput, setModalMode]);

  const handleSelectAdd = useCallback(() => {
    setModalInput("");
    setModalMode("add");
  }, [setModalInput, setModalMode]);

  const handleAddSubmit = useCallback(() => {
    setModalMode("none");
    handleCreateNode(modalInput);
    setModalInput("");
  }, [handleCreateNode, modalInput, setModalInput, setModalMode]);

  const handleBackToOptions = useCallback(() => setModalMode("options"), [setModalMode]);

  const handleEditModeChange = useCallback((editing: boolean) => {
    if (editing) {
      if (manualSidebarHiddenRef.current !== false) {
        setIsSidebarOpen(false);
      }
    } else if (manualSidebarHiddenRef.current) {
      setIsSidebarOpen(false);
      if (isLandscapeNavbarHiddenRef.current && navbarTurnedOffReasonRef.current === "auto") {
        setIsLandscapeNavbarHidden(false);
        isLandscapeNavbarHiddenRef.current = false;
        navbarTurnedOffReasonRef.current = null;
      }
    } else {
      setIsSidebarOpen(true);
    }
  }, [setIsSidebarOpen, manualSidebarHiddenRef, isLandscapeNavbarHiddenRef, navbarTurnedOffReasonRef, setIsLandscapeNavbarHidden]);

  return {
    handleToggleCollapse, handleQuickAddFile, handleShowSidebar,
    handleOpenSettings, handleCloseSettings, handleOpenMarketplace,
    handleCloseMarketplace, handleNavigateToEditor,
    handleHideNavbar, handleShowNavbar, handleRetryLoad,
    handleCloseFileModal, handleSelectRename, handleSelectAdd,
    handleAddSubmit, handleBackToOptions, handleEditModeChange,
  };
}
