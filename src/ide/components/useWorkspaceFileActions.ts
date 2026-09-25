import { useState, useCallback, useRef } from "react";
import { showAppDialog } from "../services/appDialog";
import { FileNode } from "../types";
import { moveNodeInTree } from "./fileExplorerUtils";
import {
  createFileInWorkspace,
  deleteNodeInWorkspace,
  renameNodeInWorkspace,
  moveNodeInWorkspace,
  saveFileContent,
  Workspace,
} from "../services/workspaceService";
import { resolveRunPlan, executeRunPlan } from "../services/runService";

interface UseWorkspaceFileActionsProps {
  workspace: Workspace | null;
  setWorkspace: (ws: Workspace | null) => void;
  activeFile: FileNode | null;
  setActiveFile: React.Dispatch<React.SetStateAction<FileNode | null>>;
  refreshWorkspace: () => Promise<void>;
  onOpenTerminal?: () => void;
  onOpenPreview?: (url: string) => void;
}

export function useWorkspaceFileActions({
  workspace,
  setWorkspace,
  activeFile,
  setActiveFile,
  refreshWorkspace,
  onOpenTerminal,
  onOpenPreview,
}: UseWorkspaceFileActionsProps) {
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [modalMode, setModalMode] = useState<"none" | "options" | "rename" | "add">("none");
  const [modalInput, setModalInput] = useState("");
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number }>({ x: 50, y: 150 });
  const [isRunning, setIsRunning] = useState(false);

  // Refs for rapidly-changing values to keep callbacks stable
  const activeFileRef = useRef(activeFile);
  activeFileRef.current = activeFile;
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const selectedNodeRef = useRef(selectedNode);
  selectedNodeRef.current = selectedNode;
  const modalInputRef = useRef(modalInput);
  modalInputRef.current = modalInput;

  const handleLongPressNode = useCallback((node: FileNode, coords: { x: number; y: number }) => {
    setSelectedNode(node);
    setMenuPosition({
      x: Math.min(Math.max(coords.x, 10), 180),
      y: Math.min(coords.y, 450),
    });
    setModalMode("options");
  }, []);

  const confirmAndDeleteNode = useCallback(() => {
    const ws = workspaceRef.current;
    const sel = selectedNodeRef.current;
    if (!ws || !sel) return;
    const targetPath = sel.path || sel.name;
    showAppDialog({ title: "Confirm Delete", message: `Delete "${sel.name}"?`, buttons: [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteNodeInWorkspace(ws.id, targetPath);
            await refreshWorkspace();
            const af = activeFileRef.current;
            if (af && (af.id === sel.id || af.path === sel.path)) {
              setActiveFile(null);
            }
            setModalMode("none");
          } catch (e) {
            showAppDialog({ title: "Error", message: "Failed to delete item" });
          }
        },
      },
    ] });
  }, [refreshWorkspace, setActiveFile]);

  const handleRenameSubmit = useCallback(async () => {
    const ws = workspaceRef.current;
    const sel = selectedNodeRef.current;
    const input = modalInputRef.current;
    if (!ws || !sel || !input.trim()) return;
    const targetPath = sel.path || sel.name;
    try {
      await renameNodeInWorkspace(ws.id, targetPath, input.trim());
      await refreshWorkspace();
      setModalMode("none");
      setModalInput("");
    } catch (e) {
      showAppDialog({ title: "Error", message: "Failed to rename item" });
    }
  }, [refreshWorkspace]);

  const handleCreateNode = useCallback(async (inputName: string) => {
    const ws = workspaceRef.current;
    const sel = selectedNodeRef.current;
    if (!ws || !inputName.trim()) return;
    const fileName = inputName.trim();
    const isFolder = fileName.endsWith("/");
    const cleanName = isFolder ? fileName.slice(0, -1) : fileName;

    let targetPath = cleanName;
    if (sel && sel.type === "folder") {
      const parentFolder = sel.path || sel.name;
      targetPath = `${parentFolder}/${cleanName}`;
    }

    try {
      const newNode = await createFileInWorkspace(ws.id, targetPath, "");
      if (!isFolder) setActiveFile(newNode);
      await refreshWorkspace();
    } catch (_) {}
  }, [refreshWorkspace, setActiveFile]);

  const handleMoveNode = useCallback(async (source: FileNode, targetFolder: FileNode | null) => {
    const ws = workspaceRef.current;
    if (!ws) return;
    try {
      const targetFolderId = targetFolder ? targetFolder.id : null;
      const updatedRoot = moveNodeInTree(ws.root, source.id, targetFolderId, ws.id);

      const sourcePath = source.path || source.name;
      const targetPath = targetFolder ? targetFolder.path || targetFolder.name : null;
      const fileName = sourcePath.split("/").pop() || sourcePath;
      const newPath = targetPath ? `${targetPath}/${fileName}` : fileName;

      setWorkspace({
        ...ws,
        root: updatedRoot,
      });

      const af = activeFileRef.current;
      if (af && (af.id === source.id || af.path === sourcePath)) {
        const newId = `${ws.id}-${newPath.replace(/\//g, "-")}`;
        setActiveFile((prev) => (prev ? { ...prev, path: newPath, id: newId } : null));
      }

      await moveNodeInWorkspace(ws.id, sourcePath, targetPath);
    } catch (e: any) {
      console.error("Move Error:", e);
      showAppDialog({ title: "Move Error", message: e.message || "Failed to move file" });
    }
  }, [setWorkspace, setActiveFile]);

  const handleRunActiveFile = useCallback(async (code: string, fileName: string) => {
    const ws = workspaceRef.current;
    const af = activeFileRef.current;
    if (!ws || !af || isRunning) return;
    const filePath = af.path || af.name;
    setIsRunning(true);
    try {
      // Persist first so the guest executes exactly what's on screen.
      try {
        await saveFileContent(ws.id, filePath, code);
      } catch (_) {}
      const rootNames = (ws.root.children || []).map((n) => n.name);
      const plan = await resolveRunPlan(ws.id, filePath, rootNames);
      await executeRunPlan(ws.id, plan, {
        onOpenTerminal: () => onOpenTerminal?.(),
        onOpenBrowser: (url) => onOpenPreview?.(url),
      });
    } catch (err: any) {
      showAppDialog({ title: "Run Error", message: err?.message || String(err) });
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, onOpenTerminal, onOpenPreview]);

  return {
    selectedNode,
    setSelectedNode,
    modalMode,
    setModalMode,
    modalInput,
    setModalInput,
    menuPosition,
    setMenuPosition,
    handleLongPressNode,
    confirmAndDeleteNode,
    handleRenameSubmit,
    handleCreateNode,
    handleMoveNode,
    handleRunActiveFile,
    isRunning,
  };
}
