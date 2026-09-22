import { useState, useEffect, useRef } from "react";
import {
  EditorSettings,
  DEFAULT_EDITOR_SETTINGS,
  loadEditorSettings,
  subscribeConfigChanges,
} from "../../services/configService";
import { useKeyboardMouseMode } from "../../context/KeyboardMouseContext";

export interface EditorConfigState {
  editorSettings: EditorSettings;
  keyboardMouseMode: boolean;
}

/**
 * Hook to manage reactive editor settings and peripheral modes.
 * Subscribes to global config changes and maintains synced refs for low-latency keystroke loops.
 */
export function useEditorConfig() {
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(DEFAULT_EDITOR_SETTINGS);
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const keyboardMouseModeRef = useRef(keyboardMouseMode);
  keyboardMouseModeRef.current = keyboardMouseMode;
  const editorSettingsRef = useRef(DEFAULT_EDITOR_SETTINGS);

  useEffect(() => {
    loadEditorSettings().then((s) => {
      editorSettingsRef.current = s;
      setEditorSettings(s);
    });

    const unsub = subscribeConfigChanges((cfg) => {
      if (cfg.editorSettings) {
        const merged: EditorSettings = {
          ...DEFAULT_EDITOR_SETTINGS,
          ...cfg.editorSettings,
        };
        editorSettingsRef.current = merged;
        setEditorSettings(merged);
      }
    });

    return unsub;
  }, []);

  return {
    editorSettings,
    editorSettingsRef,
    keyboardMouseMode,
    keyboardMouseModeRef,
  };
}
