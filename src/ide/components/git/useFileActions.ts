import { useState, useCallback } from "react";
import { Alert, Linking } from "react-native";
import {
  discardFile,
  ignoreFile,
  ignoreExtension,
  buildGitHubFileUrl,
} from "../../services/gitFileActions";
import { Clipboard } from "../../services/clipboardService";
import type { GitFileStatus } from "./types";
import type { FileActionHandlers } from "./GitFileActionsModal";

interface UseFileActionsArgs {
  workspaceId: string | undefined;
  remoteUrl: string | null | undefined;
  currentBranch: string | null | undefined;
  refreshGitState: () => void | Promise<void>;
}

/**
 * State + operations behind the Changes-tab file context menu
 * (discard / ignore / ignore extension / copy path / view on GitHub).
 * Lives outside useGitOperations so each hook stays lean.
 */
export function useFileActions({
  workspaceId,
  remoteUrl,
  currentBranch,
  refreshGitState,
}: UseFileActionsArgs) {
  const [showFileActions, setShowFileActions] = useState(false);
  const [fileActionTarget, setFileActionTarget] = useState<GitFileStatus | null>(null);
  const [fileActionAnchor, setFileActionAnchor] = useState({ x: 0, y: 0 });
  const [fileActionsBusy, setFileActionsBusy] = useState(false);

  const openFileActions = useCallback((file: GitFileStatus, position: { x: number; y: number }) => {
    setFileActionTarget(file);
    setFileActionAnchor(position);
    setShowFileActions(true);
  }, []);

  const closeFileActions = useCallback(() => setShowFileActions(false), []);

  const run = useCallback(
    async (label: string, fn: () => Promise<{ success: boolean; message: string }>) => {
      if (!fileActionTarget || fileActionsBusy) return;
      setFileActionsBusy(true);
      try {
        const res = await fn();
        if (!res.success) Alert.alert(label, res.message);
        await refreshGitState();
      } finally {
        setFileActionsBusy(false);
      }
    },
    [fileActionTarget, fileActionsBusy, refreshGitState]
  );

  const githubUrl = fileActionTarget
    ? buildGitHubFileUrl(remoteUrl, currentBranch, fileActionTarget.path)
    : null;

  const fileActionHandlers: FileActionHandlers = {
    discard: () => run("Discard changes", () => discardFile(workspaceId, fileActionTarget!)),
    ignoreFile: () => run("Ignore file", () => ignoreFile(workspaceId, fileActionTarget!)),
    ignoreExtension: () =>
      run("Ignore extension", () => ignoreExtension(workspaceId, fileActionTarget!)),
    copyPath: () => {
      if (fileActionTarget) Clipboard.setStringAsync(fileActionTarget.path);
    },
    openOnGitHub: () => {
      if (githubUrl) Linking.openURL(githubUrl);
    },
  };

  return {
    showFileActions,
    fileActionTarget,
    fileActionAnchor,
    fileActionsBusy,
    githubUrl,
    openFileActions,
    closeFileActions,
    fileActionHandlers,
  };
}