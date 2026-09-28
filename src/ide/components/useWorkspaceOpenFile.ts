import { useCallback, useRef } from "react";
import { showAppDialog } from "../services/appDialog";
import { Workspace, readFileContent } from "../services/workspaceService";
import { resolveChatPathToRelative } from "../services/chatFileLinkService";
import { isBinaryFileName } from "../services/binaryFileTypes";
import { FileNode } from "../types";

interface UseWorkspaceOpenFileOptions {
  workspace: Workspace | null;
  setActiveFile: React.Dispatch<React.SetStateAction<FileNode | null>>;
  recordRecentFile: (file: { id?: string; path?: string; name: string }, isEdit?: boolean) => void;
  safeSetBottomTab: (tab: "editor") => void;
  requestJump: (path: string, line: number) => void;
  flushPendingSave: () => Promise<void>;
}

/** Opening a binary as text would corrupt it on the first autosave. */
function blockBinaryOpen(fileName: string): boolean {
  if (!isBinaryFileName(fileName)) return false;
  showAppDialog({
    title: "Can't open in the editor",
    message: `"${fileName}" is a binary file. It stays in the project as an asset.`,
  });
  return true;
}

/**
 * useWorkspaceOpenFile — every path that puts a file in the editor:
 * agent/chat links, project-search hits, and explorer taps.
 * Extracted from IDELayout to keep it inside the 500-line budget.
 */
export function useWorkspaceOpenFile({
  workspace,
  setActiveFile,
  recordRecentFile,
  safeSetBottomTab,
  requestJump,
  flushPendingSave,
}: UseWorkspaceOpenFileOptions) {
  // Refs keep the returned callbacks stable for memoized children.
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  // Open a raw agent/chat file path inside the given workspace, normalizing
  // PRoot (/workspace, /workspaces/<id>) and file:// prefixes to relative paths.
  const applyOpenFile = useCallback(
    async (targetWs: Workspace, rawPath: string, line?: number) => {
      const relative = resolveChatPathToRelative(rawPath, targetWs.id);
      if (!relative) return;
      const fileName = relative.split("/").pop() || relative;
      if (blockBinaryOpen(fileName)) return;

      try {
        const content = await readFileContent(targetWs.id, relative);
        const fileNode: FileNode = {
          id: `${targetWs.id}::${relative}`,
          name: fileName,
          type: "file",
          path: relative,
          content: content || "",
        };
        setActiveFile(fileNode);
        recordRecentFile(fileNode, false);
        safeSetBottomTab("editor");
        // Search-result taps carry a line: queue a jump once the editor has
        // loaded this exact file (EditorView consumes and clears the signal).
        if (line && line > 0) requestJump(relative, line);
        if (!content) {
          showAppDialog({
            title: "File opened",
            message: `${fileName} is empty or could not be read at:\n${relative}`,
          });
        }
      } catch (e: any) {
        showAppDialog({ title: "Could not open file", message: e?.message || relative });
      }
    },
    [safeSetBottomTab, recordRecentFile, requestJump]
  );

  // Project-search result tap: open the matched file and queue the line jump.
  const handleSearchOpenMatch = useCallback(
    (path: string, line: number) => {
      const ws = workspaceRef.current;
      if (ws) void applyOpenFile(ws, path, line);
    },
    [applyOpenFile]
  );

  const handleSelectFile = useCallback(
    async (file: any) => {
      const ws = workspaceRef.current;
      if (!file || file.type === "folder" || !ws) return;
      const fileName = file.name || (file.path ? file.path.split("/").pop() : "") || "file";
      const targetPath = file.path || file.name || fileName;
      if (blockBinaryOpen(fileName)) return;

      const selected: FileNode = {
        ...file,
        id: file.id || `${ws.id}::${targetPath}`,
        name: fileName,
        path: targetPath,
        type: "file",
        content: file.content || "",
      };
      setActiveFile(selected);
      recordRecentFile(selected, false);
      safeSetBottomTab("editor");
      // Explorer stays open on file select — it closes only on edit-mode start
      // or manual collapse.
      try {
        await flushPendingSave();
        const content = await readFileContent(ws.id, targetPath);
        setActiveFile((prev) =>
          prev && prev.id === selected.id ? { ...prev, content: content ?? "" } : prev
        );
      } catch (_) {}
    },
    [safeSetBottomTab, flushPendingSave, recordRecentFile, setActiveFile]
  );

  return { applyOpenFile, handleSearchOpenMatch, handleSelectFile };
}
