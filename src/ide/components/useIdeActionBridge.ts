import { useEffect, useCallback, useRef } from "react";
import { ideActionService } from "../services/ideActionService";
import { Workspace } from "../services/workspaceService";
import { ToggleableBottomTab } from "../services/configService";

interface UseIdeActionBridgeParams {
  workspace: Workspace | null;
  applyOpenFile: (targetWs: Workspace, rawPath: string) => Promise<void>;
  setBrowserUrl: (url: string) => void;
  safeSetBottomTab: (tab: ToggleableBottomTab) => void;
}

export function useIdeActionBridge({
  workspace,
  applyOpenFile,
  setBrowserUrl,
  safeSetBottomTab,
}: UseIdeActionBridgeParams) {
  const wsRef = useRef(workspace);
  wsRef.current = workspace;
  const applyOpenFileRef = useRef(applyOpenFile);
  applyOpenFileRef.current = applyOpenFile;
  const setBrowserUrlRef = useRef(setBrowserUrl);
  setBrowserUrlRef.current = setBrowserUrl;
  const safeSetBottomTabRef = useRef(safeSetBottomTab);
  safeSetBottomTabRef.current = safeSetBottomTab;

  useEffect(() => {
    const unsubOpenFile = ideActionService.subscribe("OPEN_FILE", async ({ filePath, workspaceId: targetWsId, userInitiated }) => {
      // Background agent actions must never steal focus — only explicit
      // user taps (userInitiated=true) may open + switch tabs.
      if (!userInitiated) return;
      const currentWs = wsRef.current;
      if (targetWsId && currentWs && targetWsId !== currentWs.id) return;
      if (!currentWs || !filePath) return;
      await applyOpenFileRef.current(currentWs, filePath);
    });

    const unsubOpenBrowser = ideActionService.subscribe("OPEN_BROWSER", ({ url, userInitiated }) => {
      if (!url) return;
      if (userInitiated) {
        setBrowserUrlRef.current(url);
        safeSetBottomTabRef.current("browser");
      } else {
        // Silent preload: browser URL updates in background so it's ready
        // when the user visits, but never switches tabs automatically.
        setBrowserUrlRef.current(url);
      }
    });

    const unsubOpenTerminal = ideActionService.subscribe("OPEN_TERMINAL", ({ userInitiated }) => {
      if (!userInitiated) return;
      safeSetBottomTabRef.current("terminal");
    });

    const unsubSwitchTab = ideActionService.subscribe("SWITCH_TAB", ({ tab, userInitiated }) => {
      if (!userInitiated || !tab) return;
      safeSetBottomTabRef.current(tab);
    });

    return () => {
      unsubOpenFile();
      unsubOpenBrowser();
      unsubOpenTerminal();
      unsubSwitchTab();
    };
  }, []);

  const consumePendingActions = useCallback(
    async (ws: Workspace) => {
      try {
        const pFile = ideActionService.consumePendingAction("OPEN_FILE");
        const pBrowser = ideActionService.consumePendingAction("OPEN_BROWSER");
        const pTerm = ideActionService.consumePendingAction("OPEN_TERMINAL");
        const pTab = ideActionService.consumePendingAction("SWITCH_TAB");
        // Sticky pending actions follow the same rule: only user-initiated
        // taps may switch tabs. Background agent emits preload at most.
        if (pBrowser?.payload?.userInitiated && pBrowser.payload.url) {
          setBrowserUrlRef.current(pBrowser.payload.url);
          safeSetBottomTabRef.current("browser");
        } else if (pTerm?.payload?.userInitiated) {
          safeSetBottomTabRef.current("terminal");
        } else if (pTab?.payload?.userInitiated) {
          safeSetBottomTabRef.current(pTab.payload.tab);
        } else if (pBrowser?.payload?.url) {
          setBrowserUrlRef.current(pBrowser.payload.url);
        } else if (pFile?.payload?.userInitiated && pFile?.payload?.filePath && (!pFile.payload.workspaceId || pFile.payload.workspaceId === ws.id)) {
          await applyOpenFileRef.current(ws, pFile.payload.filePath);
        }
      } catch (_) {}
    },
    []
  );

  return { consumePendingActions };
}
