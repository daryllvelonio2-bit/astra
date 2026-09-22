import { useEffect, useRef } from "react";
import { DeviceEventEmitter } from "react-native";
import { ToggleableBottomTab } from "../services/configService";

interface KeyboardShortcutsOptions {
  enabled: boolean;
  onSwitchTab: (tab: ToggleableBottomTab) => void;
}

/**
 * Global physical keyboard shortcuts:
 * - Ctrl+E: Switch to Editor tab
 * - Ctrl+T: Switch to Terminal tab
 * - Ctrl+B: Switch to Browser tab
 * - Ctrl+G: Switch to Git/GitHub tab
 */
export function useKeyboardShortcuts({ enabled, onSwitchTab }: KeyboardShortcutsOptions) {
  const onSwitchTabRef = useRef(onSwitchTab);
  onSwitchTabRef.current = onSwitchTab;

  useEffect(() => {
    if (!enabled) return;

    // 1. Native Android KeyEvent Dispatcher via DeviceEventEmitter
    const sub = DeviceEventEmitter.addListener("onHardwareShortcut", (data: string) => {
      let targetTab: ToggleableBottomTab | null = null;
      const normalized = (data || "").toLowerCase();
      if (normalized === "editor" || normalized === "ctrl+e") targetTab = "editor";
      else if (normalized === "terminal" || normalized === "ctrl+t") targetTab = "terminal";
      else if (normalized === "browser" || normalized === "ctrl+b") targetTab = "browser";
      else if (normalized === "git" || normalized === "ctrl+g") targetTab = "git";

      if (targetTab) {
        onSwitchTabRef.current(targetTab);
      }
    });

    // 2. Web / DOM Event Listener (capture phase)
    let removeWebListener: (() => void) | undefined;
    if (typeof window !== "undefined" && window.addEventListener) {
      const handleWebKeyDown = (e: KeyboardEvent) => {
        if (!e.ctrlKey && !e.metaKey) return;
        const key = e.key?.toLowerCase();
        let targetTab: ToggleableBottomTab | null = null;
        if (key === "e") targetTab = "editor";
        else if (key === "t") targetTab = "terminal";
        else if (key === "b") targetTab = "browser";
        else if (key === "g") targetTab = "git";

        if (targetTab) {
          e.preventDefault();
          e.stopPropagation();
          onSwitchTabRef.current(targetTab);
        }
      };

      window.addEventListener("keydown", handleWebKeyDown, { capture: true });
      removeWebListener = () => {
        window.removeEventListener("keydown", handleWebKeyDown, { capture: true });
      };
    }

    return () => {
      sub.remove();
      removeWebListener?.();
    };
  }, [enabled]);
}
