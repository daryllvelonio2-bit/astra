import React from "react";
import { DirectoryPickerModal } from "../DirectoryPickerModal";
import { ImportPickerModal } from "./ImportPickerModal";
import { ExportModal } from "./ExportModal";
import { useImportExport } from "./useImportExport";

type ImportExportController = ReturnType<typeof useImportExport>;

interface ImportExportModalsProps {
  /** Controller returned by `useImportExport`. */
  io: ImportExportController;
  projectName?: string;
  /** Name of the open file — enables the single-file export option. */
  fileName?: string;
}

/**
 * ImportExportModals — mounts the import browser, the export popup and the
 * destination folder picker in one place so IDELayout stays readable.
 */
export function ImportExportModals({ io, projectName, fileName }: ImportExportModalsProps) {
  return (
    <>
      <ImportPickerModal
        visible={io.isImportOpen}
        onClose={() => io.setImportOpen(false)}
        onImportFile={io.beginImport}
        onImportFolder={io.beginImport}
        isBusy={io.isImporting}
        progress={io.importProgress}
      />

      <ExportModal
        visible={io.isExportOpen}
        onClose={() => io.setExportOpen(false)}
        projectName={projectName}
        fileName={fileName}
        destDir={io.destDir}
        onChangeDest={() => io.setDestPickerOpen(true)}
        onExportProject={io.runExportProject}
        onExportFile={io.runExportFile}
        isBusy={io.isExporting}
        progress={io.exportProgress}
      />

      <DirectoryPickerModal
        visible={io.isDestPickerOpen}
        initialPath={io.destDir}
        onClose={() => io.setDestPickerOpen(false)}
        onSelectDirectory={(dir) => {
          io.setDestDir(dir);
          io.setDestPickerOpen(false);
        }}
      />
    </>
  );
}
