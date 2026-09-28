import { useCallback, useRef, useState } from "react";
import { showAppDialog } from "../../services/appDialog";
import { FileNode } from "../../types";
import {
  importEntry, targetExists, ImportConflictPolicy, ImportProgress,
} from "../../services/importService";
import {
  exportProjectZip, exportSingleFile, getDefaultExportDir, ExportProgress,
} from "../../services/exportService";

interface UseImportExportOptions {
  workspaceId?: string;
  projectName?: string;
  activeFile?: FileNode | null;
  refreshWorkspace: () => Promise<void>;
}

/** Progress UIs only need ~8 updates/sec; a 2000-file folder must not
 *  cause 2000 React renders (see agents.md: speed first). */
const PROGRESS_THROTTLE_MS = 120;

/**
 * useImportExport — owns the Import/Export modal state and runs the
 * copy-in / write-out work, refreshing the tree when files land.
 */
export function useImportExport({
  workspaceId,
  projectName,
  activeFile,
  refreshWorkspace,
}: UseImportExportOptions) {
  const [isImportOpen, setImportOpen] = useState(false);
  const [isExportOpen, setExportOpen] = useState(false);
  const [isDestPickerOpen, setDestPickerOpen] = useState(false);
  const [destDir, setDestDir] = useState<string>(() => getDefaultExportDir());
  const [isImporting, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [isExporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);

  const lastImportTickRef = useRef(0);
  const lastExportTickRef = useRef(0);

  const handleOpenImport = useCallback(() => setImportOpen(true), []);
  const handleOpenExport = useCallback(() => setExportOpen(true), []);

  const runImport = useCallback(
    async (sourcePath: string, policy: ImportConflictPolicy) => {
      if (!workspaceId) return;
      setImporting(true);
      setImportProgress({ done: 0, total: 0, current: "" });
      lastImportTickRef.current = 0;
      try {
        const outcome = await importEntry({
          workspaceId,
          sourcePath,
          destRelativeDir: "",
          policy,
          onProgress: (p) => {
            const now = Date.now();
            if (p.done < p.total && now - lastImportTickRef.current < PROGRESS_THROTTLE_MS) return;
            lastImportTickRef.current = now;
            setImportProgress(p);
          },
        });
        await refreshWorkspace();

        if (!outcome) {
          showAppDialog({ title: "Import failed", message: "That item is no longer available." });
          return;
        }
        if (outcome.skipped) {
          showAppDialog({ title: "Skipped", message: "An item with that name already exists." });
          return;
        }

        setImportOpen(false);
        if (outcome.failed > 0) {
          showAppDialog({
            title: "Imported with errors",
            message: `${outcome.copied} copied, ${outcome.failed} failed.\n→ ${outcome.targetRelative}`,
          });
        } else {
          showAppDialog({
            title: "Imported",
            message:
              `${outcome.copied} file${outcome.copied === 1 ? "" : "s"} added to the project.\n` +
              `→ ${outcome.targetRelative}`,
          });
        }
      } catch (e: any) {
        showAppDialog({ title: "Import failed", message: e?.message || String(e) });
      } finally {
        setImporting(false);
        setImportProgress(null);
      }
    },
    [workspaceId, refreshWorkspace]
  );

  /** Import with a conflict prompt when the name is already taken. */
  const beginImport = useCallback(
    async (sourcePath: string) => {
      if (!workspaceId || isImporting) return;
      const name = sourcePath.replace(/\/+$/, "").split("/").filter(Boolean).pop() || "";
      if (!name) return;

      let clash = false;
      try {
        clash = await targetExists(workspaceId, name);
      } catch (_) {}

      if (!clash) {
        void runImport(sourcePath, "rename");
        return;
      }

      showAppDialog({
        title: "Already in project",
        message: `"${name}" already exists here.`,
        buttons: [
          { text: "Cancel", style: "cancel" },
          { text: "Keep Both", onPress: () => void runImport(sourcePath, "rename") },
          { text: "Replace", style: "destructive", onPress: () => void runImport(sourcePath, "overwrite") },
        ],
      });
    },
    [workspaceId, isImporting, runImport]
  );

  const runExportProject = useCallback(async () => {
    if (!workspaceId || isExporting) return;
    setExporting(true);
    setExportProgress({ done: 0, total: 0, current: "" });
    lastExportTickRef.current = 0;
    try {
      const outcome = await exportProjectZip({
        workspaceId,
        projectName: projectName || workspaceId,
        destDir,
        onProgress: (p) => {
          const now = Date.now();
          if (p.done < p.total && now - lastExportTickRef.current < PROGRESS_THROTTLE_MS) return;
          lastExportTickRef.current = now;
          setExportProgress(p);
        },
      });
      setExportOpen(false);
      const skippedNote =
        outcome.skipped.length > 0
          ? `\n\nSkipped (too large): ${outcome.skipped.length} file${outcome.skipped.length === 1 ? "" : "s"}`
          : "";
      showAppDialog({
        title: "Project exported",
        message:
          `${outcome.files} file${outcome.files === 1 ? "" : "s"} archived.` +
          `${skippedNote}\n\n${outcome.absolutePath}`,
      });
    } catch (e: any) {
      showAppDialog({ title: "Export failed", message: e?.message || String(e) });
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  }, [workspaceId, projectName, destDir, isExporting]);

  const runExportFile = useCallback(async () => {
    if (!workspaceId || isExporting) return;
    const relative = activeFile?.path || activeFile?.name;
    if (!relative) return;
    setExporting(true);
    setExportProgress(null);
    try {
      const outcome = await exportSingleFile({
        workspaceId,
        relativePath: relative,
        destDir,
        onProgress: setExportProgress,
      });
      setExportOpen(false);
      showAppDialog({
        title: "File exported",
        message: `${relative}\n\n${outcome.absolutePath}`,
      });
    } catch (e: any) {
      showAppDialog({ title: "Export failed", message: e?.message || String(e) });
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  }, [workspaceId, activeFile, destDir, isExporting]);

  return {
    isImportOpen,
    setImportOpen,
    isExportOpen,
    setExportOpen,
    isDestPickerOpen,
    setDestPickerOpen,
    destDir,
    setDestDir,
    isImporting,
    importProgress,
    isExporting,
    exportProgress,
    handleOpenImport,
    handleOpenExport,
    beginImport,
    runExportProject,
    runExportFile,
  };
}
