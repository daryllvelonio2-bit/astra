import { useState, useCallback, useRef } from "react";

export interface RecentFileItem {
  id?: string;
  path: string;
  name: string;
  lastEdited?: number;
  lastOpened?: number;
}

const MAX_RECENTS = 12;

/**
 * Hook to track recently edited and visited files for seamless navigation
 * in the IDE header.
 */
export function useRecentFiles(workspaceId?: string) {
  const [recentFiles, setRecentFiles] = useState<RecentFileItem[]>([]);
  const lastWorkspaceIdRef = useRef<string | undefined>(workspaceId);

  // Clear or re-initialize if switching workspaces
  if (lastWorkspaceIdRef.current !== workspaceId) {
    lastWorkspaceIdRef.current = workspaceId;
    if (recentFiles.length > 0) {
      setRecentFiles([]);
    }
  }

  const recordRecentFile = useCallback(
    (file: { id?: string; path?: string; name: string }, isEdit: boolean = false) => {
      const filePath = file.path || file.name;
      if (!filePath) return;
      const fileName = file.name || filePath.split("/").pop() || "file";

      setRecentFiles((prev) => {
        const match = (f: RecentFileItem) => f.path === filePath || f.name === fileName;
        const existing = prev.find(match);

        const updated: RecentFileItem = {
          id: file.id || existing?.id,
          path: filePath,
          name: fileName,
          lastEdited: isEdit ? Date.now() : existing?.lastEdited,
          lastOpened: isEdit ? existing?.lastOpened : Date.now(),
        };

        // Only brand-new files join at the front. Anything already listed
        // updates in place — opens and edits never reorder existing entries.
        if (existing) {
          return prev.map((f) => (match(f) ? updated : f));
        }

        return [updated, ...prev].slice(0, MAX_RECENTS);
      });
    },
    []
  );

  const removeRecentFile = useCallback((filePath: string) => {
    setRecentFiles((prev) =>
      prev.filter((f) => f.path !== filePath && f.name !== filePath)
    );
  }, []);

  const clearRecentFiles = useCallback(() => {
    setRecentFiles([]);
  }, []);

  return {
    recentFiles,
    recordRecentFile,
    removeRecentFile,
    clearRecentFiles,
  };
}
