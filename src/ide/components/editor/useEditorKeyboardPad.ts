import { useState, useEffect, useRef } from "react";
import { useAccurateKeyboard } from "../../../theme/useAccurateKeyboard";

/**
 * Calculates adaptive keyboard offset for EditorView on mobile devices.
 * Accurately handles edge-to-edge screens, system nav bars, and OS window
 * resizing so bottom-docked overlays (error panels, bracket helpers, completion bars)
 * are cleanly leveled above the virtual keyboard rather than covered statically at the bottom.
 */
export function useEditorKeyboardPad(keyboardMouseMode: boolean) {
  const { isKeyboardVisible, keyboardOffset } = useAccurateKeyboard(0);
  const effectiveKeyboardHeight = isKeyboardVisible ? keyboardOffset : 0;
  const [containerHeight, setContainerHeight] = useState(0);
  const closedHeightRef = useRef(0);

  useEffect(() => {
    if (!isKeyboardVisible && containerHeight > 0) {
      closedHeightRef.current = Math.max(closedHeightRef.current, containerHeight);
    }
  }, [isKeyboardVisible, containerHeight]);

  const osReclaimed =
    isKeyboardVisible && closedHeightRef.current > 0 && containerHeight > 0
      ? Math.max(0, closedHeightRef.current - containerHeight)
      : 0;

  const keyboardBottomPadding =
    !keyboardMouseMode && isKeyboardVisible
      ? Math.max(0, effectiveKeyboardHeight - osReclaimed)
      : 0;

  return {
    isKeyboardVisible,
    effectiveKeyboardHeight,
    keyboardBottomPadding,
    setContainerHeight,
  };
}
