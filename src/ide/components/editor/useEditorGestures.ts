import { useState, useRef, useEffect, useCallback } from "react";
import { useWindowDimensions, GestureResponderEvent } from "react-native";

export interface UseEditorGesturesOptions {
  initialFontSize?: number;
  onSaveFontSize?: (size: number) => void;
}

export function useEditorGestures({
  initialFontSize = 14,
  onSaveFontSize,
}: UseEditorGesturesOptions = {}) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [fontSize, setFontSize] = useState<number>(initialFontSize);
  const [isSplitScreen, setIsSplitScreen] = useState<boolean>(false);
  const [zoomBadge, setZoomBadge] = useState<string | null>(null);
  const [splitToast, setSplitToast] = useState<string | null>(null);

  const fontSizeRef = useRef<number>(initialFontSize);
  fontSizeRef.current = fontSize;

  const onSaveFontSizeRef = useRef(onSaveFontSize);
  onSaveFontSizeRef.current = onSaveFontSize;

  const zoomTimerRef = useRef<NodeJS.Timeout | null>(null);
  const splitToastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const saveDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Multi-touch tracking refs
  const startDistRef = useRef<number>(0);
  const startAbsDxRef = useRef<number>(0);
  const startFontSizeRef = useRef<number>(initialFontSize);
  const gestureActionTriggeredRef = useRef<boolean>(false);

  // Sync external initialFontSize changes (e.g. from async config load on app startup)
  useEffect(() => {
    if (initialFontSize && initialFontSize !== fontSizeRef.current && startDistRef.current === 0) {
      fontSizeRef.current = initialFontSize;
      startFontSizeRef.current = initialFontSize;
      setFontSize(initialFontSize);
    }
  }, [initialFontSize]);

  const queueSave = useCallback((size: number) => {
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      onSaveFontSizeRef.current?.(size);
    }, 350);
  }, []);

  // Close split-screen gracefully if rotated to portrait
  useEffect(() => {
    if (!isLandscape && isSplitScreen) {
      setIsSplitScreen(false);
    }
  }, [isLandscape, isSplitScreen]);

  const showZoomBadge = useCallback((text: string) => {
    setZoomBadge(text);
    if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
    zoomTimerRef.current = setTimeout(() => {
      setZoomBadge(null);
    }, 1400);
  }, []);

  const showSplitToast = useCallback((text: string) => {
    setSplitToast(text);
    if (splitToastTimerRef.current) clearTimeout(splitToastTimerRef.current);
    splitToastTimerRef.current = setTimeout(() => {
      setSplitToast(null);
    }, 1800);
  }, []);

  const toggleSplitScreen = useCallback(() => {
    if (!isLandscape) {
      showSplitToast("Rotate to landscape for split-screen");
      return;
    }
    setIsSplitScreen((prev) => {
      const next = !prev;
      showSplitToast(
        next ? "Continuation Split-Screen Enabled" : "Single Screen Mode"
      );
      return next;
    });
  }, [isLandscape, showSplitToast]);

  const resetZoom = useCallback(() => {
    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = null;
    }
    fontSizeRef.current = 14;
    startFontSizeRef.current = 14;
    setFontSize(14);
    showZoomBadge("Zoom: 100% (14px)");
    onSaveFontSizeRef.current?.(14);
  }, [showZoomBadge]);

  const zoomIn = useCallback((step = 1) => {
    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = null;
    }
    setFontSize((prev) => {
      const next = Math.min(26, prev + step);
      if (next !== prev) {
        fontSizeRef.current = next;
        startFontSizeRef.current = next;
        const percent = Math.round((next / 14) * 100);
        showZoomBadge(`Zoom: ${percent}% (${next}px)`);
        queueSave(next);
      }
      return next;
    });
  }, [showZoomBadge, queueSave]);

  const zoomOut = useCallback((step = 1) => {
    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = null;
    }
    setFontSize((prev) => {
      const next = Math.max(9, prev - step);
      if (next !== prev) {
        fontSizeRef.current = next;
        startFontSizeRef.current = next;
        const percent = Math.round((next / 14) * 100);
        showZoomBadge(`Zoom: ${percent}% (${next}px)`);
        queueSave(next);
      }
      return next;
    });
  }, [showZoomBadge, queueSave]);

  const handlePinchStart = useCallback((dist: number, absDx: number) => {
    startDistRef.current = dist;
    startAbsDxRef.current = absDx;
    startFontSizeRef.current = fontSizeRef.current;
    gestureActionTriggeredRef.current = false;
  }, []);

  const handlePinchMove = useCallback(
    (currentDist: number, currentAbsDx: number) => {
      if (startDistRef.current <= 0) return;

      // 1. Landscape Split-Screen 2-Finger Gestures
      if (isLandscape) {
        // "2 finger tap together and move away for triggering split screen"
        if (!isSplitScreen && !gestureActionTriggeredRef.current) {
          if (
            startDistRef.current < 130 &&
            currentAbsDx - startAbsDxRef.current > 85
          ) {
            gestureActionTriggeredRef.current = true;
            setIsSplitScreen(true);
            showSplitToast("Continuation Split-Screen Enabled");
            return;
          }
        }

        // "2 finger tap then move closer to turn off split screen"
        if (isSplitScreen && !gestureActionTriggeredRef.current) {
          if (
            startAbsDxRef.current > 100 &&
            startDistRef.current - currentDist > 75
          ) {
            gestureActionTriggeredRef.current = true;
            setIsSplitScreen(false);
            showSplitToast("Continuation Split-Screen Disabled");
            return;
          }
        }
      }

      // 2. Pinch to Zoom
      if (!gestureActionTriggeredRef.current) {
        const ratio = currentDist / startDistRef.current;
        const target = Math.round(startFontSizeRef.current * ratio);
        const clamped = Math.min(26, Math.max(9, target));

        if (clamped !== fontSizeRef.current) {
          fontSizeRef.current = clamped;
          setFontSize(clamped);
          const percent = Math.round((clamped / 14) * 100);
          showZoomBadge(`Zoom: ${percent}% (${clamped}px)`);
          queueSave(clamped);
        }
      }
    },
    [isLandscape, isSplitScreen, showSplitToast, showZoomBadge, queueSave]
  );

  const handlePinchEnd = useCallback(() => {
    if (startDistRef.current > 0) {
      startDistRef.current = 0;
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
      }
      const finalSize = fontSizeRef.current;
      if (finalSize !== startFontSizeRef.current) {
        startFontSizeRef.current = finalSize;
        onSaveFontSizeRef.current?.(finalSize);
      }
    }
  }, []);

  const handleTouchStart = useCallback(
    (e: GestureResponderEvent) => {
      const touches = e.nativeEvent.touches;
      if (touches.length === 2) {
        const t1 = touches[0];
        const t2 = touches[1];
        const dist = Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY);
        const absDx = Math.abs(t2.pageX - t1.pageX);
        handlePinchStart(dist, absDx);
      } else {
        startDistRef.current = 0;
      }
    },
    [handlePinchStart]
  );

  const handleTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      const touches = e.nativeEvent.touches;
      if (touches.length !== 2 || startDistRef.current <= 0) return;

      const t1 = touches[0];
      const t2 = touches[1];
      const currentDist = Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY);
      const currentAbsDx = Math.abs(t2.pageX - t1.pageX);
      handlePinchMove(currentDist, currentAbsDx);
    },
    [handlePinchMove]
  );

  const handleTouchEnd = useCallback(() => {
    handlePinchEnd();
  }, [handlePinchEnd]);

  const lineHeight = Math.round(fontSize * 1.45);
  const charWidth = fontSize * 0.6;

  return {
    fontSize,
    lineHeight,
    charWidth,
    isLandscape,
    isSplitScreen,
    setIsSplitScreen,
    toggleSplitScreen,
    zoomBadge,
    splitToast,
    resetZoom,
    zoomIn,
    zoomOut,
    handlePinchStart,
    handlePinchMove,
    handlePinchEnd,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel: handleTouchEnd,
  };
}
