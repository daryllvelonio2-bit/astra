import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, BackHandler } from "react-native";

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
      if (isEditingRef.current) {
        setExitEditSignal((s) => s + 1);
        return true;
      }
      Alert.alert("Close project?", "Leave the editor and go back to your projects?", [
        { text: "Stay", style: "cancel" },
        { text: "Close project", style: "destructive", onPress: () => onCloseProjectRef.current() },
      ]);
      return true;
    });
    return () => sub.remove();
  }, [ideVisible]);

  return { handleEditModeChange, exitEditSignal };
}
