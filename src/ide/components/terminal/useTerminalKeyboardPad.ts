import { useState, useRef, useEffect } from "react";
import { LayoutChangeEvent, Platform } from "react-native";
import { useAccurateKeyboard } from "../../../theme/useAccurateKeyboard";
import { useOrientation } from "../../../theme/useOrientation";

/**
 * Calculates adaptive keyboard padding for TerminalView:
 * - On Android with adjustResize, the OS automatically shrinks the window to sit
 *   directly on top of the soft keyboard. keyboardPad is 0 so ExtraKeysBar sits
 *   flush on the keyboard without double-elevation.
 * - In landscape or when the window never shrank, apply the reported keyboard
 *   height as padding so the strip and prompt are lifted instead of buried.
 * - Tracks portrait and landscape closed heights separately to prevent
 *   cross-orientation measurement contamination.
 * - On iOS, padding is applied using keyboardOffset.
 */
export function useTerminalKeyboardPad(visible = true) {
  const { isLandscape, height: screenHeight } = useOrientation();
  const { isKeyboardVisible, keyboardOffset } = useAccurateKeyboard(0);
  const effectiveKeyboardHeight = isKeyboardVisible ? keyboardOffset : 0;
  const [containerHeight, setContainerHeight] = useState(0);

  const closedPortraitHeightRef = useRef(0);
  const closedLandscapeHeightRef = useRef(0);

  useEffect(() => {
    // Invalidate container height on orientation change so fresh layout applies
    setContainerHeight(0);
  }, [isLandscape]);

  useEffect(() => {
    if (!isKeyboardVisible && containerHeight > 0) {
      if (isLandscape) {
        closedLandscapeHeightRef.current = Math.max(closedLandscapeHeightRef.current, containerHeight);
      } else {
        closedPortraitHeightRef.current = Math.max(closedPortraitHeightRef.current, containerHeight);
      }
    }
  }, [isKeyboardVisible, containerHeight, isLandscape]);

  const activeClosedRef = isLandscape ? closedLandscapeHeightRef : closedPortraitHeightRef;
  const closedHeight = activeClosedRef.current > 0 ? activeClosedRef.current : (containerHeight > 0 ? containerHeight : screenHeight);

  const osReclaimed =
    isKeyboardVisible && closedHeight > 0 && containerHeight > 0
      ? Math.max(0, closedHeight - containerHeight)
      : 0;

  const keyboardPad =
    isKeyboardVisible
      ? (isLandscape || Platform.OS !== "android"
          ? effectiveKeyboardHeight
          : Math.max(0, effectiveKeyboardHeight - osReclaimed))
      : 0;

  const currentVisibleHeight = containerHeight > 0
    ? Math.max(0, containerHeight - keyboardPad)
    : 0;
  const visibleRows = isKeyboardVisible && currentVisibleHeight > 0
    ? Math.max(0, Math.floor((currentVisibleHeight - 72) / 18))
    : 0;

  const stateRef = useRef({
    isKeyboardVisible: false,
    visibleRows: 0,
    keyboardPad: 0,
    closedContainerHeight: 0,
  });

  if (visible) {
    stateRef.current = {
      isKeyboardVisible,
      visibleRows,
      keyboardPad,
      closedContainerHeight: closedHeight,
    };
  }

  return {
    isKeyboardVisible: visible ? isKeyboardVisible : stateRef.current.isKeyboardVisible,
    visibleRows: visible ? visibleRows : stateRef.current.visibleRows,
    keyboardPad: visible ? keyboardPad : stateRef.current.keyboardPad,
    closedContainerHeight: visible ? closedHeight : stateRef.current.closedContainerHeight,
    onContainerLayout: (e: LayoutChangeEvent) => {
      if (!visible) return;
      const h = e?.nativeEvent?.layout?.height;
      if (h && h > 0) {
        if (!isKeyboardVisible) {
          if (isLandscape) {
            closedLandscapeHeightRef.current = Math.max(closedLandscapeHeightRef.current, h);
          } else {
            closedPortraitHeightRef.current = Math.max(closedPortraitHeightRef.current, h);
          }
        }
        setContainerHeight(h);
      }
    },
  };
}
