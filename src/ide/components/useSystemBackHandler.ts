import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler } from "react-native";
import { showAppDialog } from "../services/appDialog";
import { tryCloseFindPanel } from "../services/findPanelBackPress";

interface SystemBackHandlerOptions {
  /** Original edit-mode handler (sidebar parking etc.). */
  onEditModeChange: (editing: boolean) => void;
  /** Close-project action (flush saves + back to picker). */
  onCloseProject: () => void;
  /** False while the project picker covers the IDE (it stays mounted). */
  ideVisible: boolean;
}

/**
 * System back button / back gesture (Android):
 * - in edit mode -> exits edit mode only, the app stays open;
 * - otherwise -> asks before closing the project, never kills the app.
 */
export function useSystemBackHandler({ onEditModeChange, onCloseProject, ideVisible }: SystemBackHandlerOptions) {
  const isEditingRef = useRef(false);
  const [exitEditSignal, setExitEditSignal] = useState(0);
  const onEditModeChangeRef = useRef(onEditModeChange);
  const onCloseProjectRef = useRef(onCloseProject);
  onEditModeChangeRef.current = onEditModeChange;
  onCloseProjectRef.current = onCloseProject;

  const handleEditModeChange = useCallback((editing: boolean) => {
    isEditingRef.current = editing;
    onEditModeChangeRef.current(editing);
  }, []);

  useEffect(() => {
    if (!ideVisible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      // Floating find panel first — it has no close button of its own.
      if (tryCloseFindPanel()) return true;
      if (isEditingRef.current) {
        setExitEditSignal((s) => s + 1);
        return true;
      }
      showAppDialog({ title: "Close project?", message: "Leave the editor and go back to your projects?", buttons: [
        { text: "Stay", style: "cancel" },
        { text: "Close project", style: "destructive", onPress: () => onCloseProjectRef.current() },
      ] });
      return true;
    });
    return () => sub.remove();
  }, [ideVisible]);

  return { handleEditModeChange, exitEditSignal };
}
