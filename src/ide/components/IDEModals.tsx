import React from "react";
import { FileNode } from "../types";
import { FileActionModal } from "./FileActionModal";
import { SettingsModal } from "./SettingsModal";
import { ExtensionMarketplaceModal } from "./extensions/ExtensionMarketplaceModal";
import { ProjectSearchModal } from "./ProjectSearchModal";
import { ImportExportModals } from "./import/ImportExportModals";
import { useImportExport } from "./import/useImportExport";

type ModalMode = "none" | "options" | "rename" | "add";

interface IDEModalsProps {
  // File actions (long-press node sheet)
  modalMode: ModalMode;
  selectedNode: FileNode | null;
  menuPosition: { x: number; y: number };
  modalInput: string;
  onChangeInput: (text: string) => void;
  onCloseFileModal: () => void;
  onSelectRename: () => void;
  onSelectAdd: () => void;
  onDeleteConfirm: () => void;
  onRenameSubmit: () => void;
  onAddSubmit: () => void;
  onBackToOptions: () => void;

  // Settings / marketplace
  workspaceId?: string;
  isSettingsVisible: boolean;
  onCloseSettings: () => void;
  refreshWorkspace: () => Promise<void>;
  isMarketplaceVisible: boolean;
  onCloseMarketplace: () => void;

  // Project search
  isSearchVisible: boolean;
  onCloseSearch: () => void;
  onSearchOpenMatch: (path: string, line: number) => void;

  // Import / export
  io: ReturnType<typeof useImportExport>;
  projectName?: string;
  fileName?: string;
}

/**
 * IDEModals — every IDE-level overlay in one leaf component, so IDELayout
 * only owns state and stays inside the 500-line budget.
 */
export function IDEModals({
  modalMode, selectedNode, menuPosition, modalInput, onChangeInput,
  onCloseFileModal, onSelectRename, onSelectAdd, onDeleteConfirm,
  onRenameSubmit, onAddSubmit, onBackToOptions,
  workspaceId, isSettingsVisible, onCloseSettings, refreshWorkspace,
  isMarketplaceVisible, onCloseMarketplace,
  isSearchVisible, onCloseSearch, onSearchOpenMatch,
  io, projectName, fileName,
}: IDEModalsProps) {
  return (
    <>
      {modalMode !== "none" && (
        <FileActionModal
          modalMode={modalMode} selectedNode={selectedNode} menuPosition={menuPosition}
          modalInput={modalInput} onChangeInput={onChangeInput} onClose={onCloseFileModal}
          onSelectRename={onSelectRename}
          onSelectAdd={onSelectAdd}
          onDeleteConfirm={onDeleteConfirm} onRenameSubmit={onRenameSubmit}
          onAddSubmit={onAddSubmit}
          onBackToOptions={onBackToOptions}
        />
      )}

      <SettingsModal
        visible={isSettingsVisible} onClose={onCloseSettings}
        workspaceId={workspaceId} onSyncWorkspace={refreshWorkspace}
      />
      <ExtensionMarketplaceModal visible={isMarketplaceVisible} onClose={onCloseMarketplace} />
      <ProjectSearchModal
        visible={isSearchVisible}
        workspaceId={workspaceId}
        onClose={onCloseSearch}
        onOpenMatch={onSearchOpenMatch}
      />

      <ImportExportModals io={io} projectName={projectName} fileName={fileName} />
    </>
  );
}
