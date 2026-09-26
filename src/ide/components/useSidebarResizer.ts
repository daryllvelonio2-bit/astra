import { useEffect, useRef, useState } from "react";
import { Animated, Easing, PanResponder } from "react-native";
import { setWorkspaceWatcherPaused } from "./useWorkspaceAutoRefresh";

const MIN_WIDTH = 90;
const MAX_WIDTH = 320;
// Collapse threshold: width dragged to <= 65 triggers auto-minimize
const COLLAPSE_WIDTH_THRESHOLD = 65;

export function useSidebarResizer(
  initialWidth: number = 130,
  onCollapse?: () => void,
  isOpen: boolean = true
) {
  const sidebarWidthAnim = useRef(new Animated.Value(initialWidth)).current;
  const currentWidthRef = useRef(initialWidth);
  const dragStartWidthRef = useRef(initialWidth);
  const lastValidWidthRef = useRef(initialWidth);
  const onCollapseRef = useRef(onCollapse);
  onCollapseRef.current = onCollapse;
  const isCollapsingRef = useRef(false);
  const prevIsOpenRef = useRef(isOpen);
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);

  // Sync animation when reopened externally or via toggle
  useEffect(() => {
    if (prevIsOpenRef.current === false && isOpen === true) {
      const targetWidth = Math.max(MIN_WIDTH, lastValidWidthRef.current || initialWidth);
      currentWidthRef.current = targetWidth;
      sidebarWidthAnim.setValue(0);
      Animated.timing(sidebarWidthAnim, {
        toValue: targetWidth,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, initialWidth, sidebarWidthAnim]);

  useEffect(() => {
    return () => {
      sidebarWidthAnim.stopAnimation();
      setWorkspaceWatcherPaused(false);
    };
  }, [sidebarWidthAnim]);

  const resizerPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 5 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 5 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderGrant: () => {
        if (isCollapsingRef.current) return;
        sidebarWidthAnim.stopAnimation((val) => {
          if (typeof val === "number") {
            currentWidthRef.current = val;
            dragStartWidthRef.current = val;
          }
        });
        setIsDraggingSidebar(true);
        setWorkspaceWatcherPaused(true);
      },
      onPanResponderMove: (_, gestureState) => {
        if (isCollapsingRef.current) return;
        const rawWidth = dragStartWidthRef.current + gestureState.dx;

        let targetWidth: number;
        if (rawWidth > MAX_WIDTH) {
          // Slight rubber-band stretch past max width
          targetWidth = MAX_WIDTH + (rawWidth - MAX_WIDTH) * 0.2;
        } else if (rawWidth >= MIN_WIDTH) {
          // Normal 1:1 smooth resizing
          targetWidth = rawWidth;
          lastValidWidthRef.current = rawWidth;
        } else {
          // Smooth 1:1 tracking down to 0 for responsive minimize gesture
          targetWidth = Math.max(0, rawWidth);
        }

        currentWidthRef.current = targetWidth;
        sidebarWidthAnim.setValue(targetWidth);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isCollapsingRef.current) return;

        const currentW = currentWidthRef.current;
        // Auto-minimize when swiped into collapse zone (<= 65) or smooth left flick (vx < -0.45 while <= 85)
        const shouldMinimize =
          currentW <= COLLAPSE_WIDTH_THRESHOLD ||
          (gestureState.vx < -0.45 && currentW <= 85);

        if (shouldMinimize && onCollapseRef.current) {
          isCollapsingRef.current = true;
          // Calculate duration proportional to remaining distance to maintain uniform velocity
          const animDuration = Math.min(150, Math.max(60, (currentW / COLLAPSE_WIDTH_THRESHOLD) * 150));
          const restoreTarget = Math.max(
            MIN_WIDTH,
            dragStartWidthRef.current >= MIN_WIDTH
              ? dragStartWidthRef.current
              : (lastValidWidthRef.current || initialWidth)
          );
          lastValidWidthRef.current = restoreTarget;

          // Animate smoothly to 0 without re-render interruption during frames
          Animated.timing(sidebarWidthAnim, {
            toValue: 0,
            duration: animDuration,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }).start(() => {
            isCollapsingRef.current = false;
            setIsDraggingSidebar(false);
            setWorkspaceWatcherPaused(false);
            onCollapseRef.current?.();
          });
        } else {
          setIsDraggingSidebar(false);
          setWorkspaceWatcherPaused(false);
          // Snap back safely to at least MIN_WIDTH
          const snapWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, currentW));
          currentWidthRef.current = snapWidth;
          lastValidWidthRef.current = snapWidth;
          Animated.spring(sidebarWidthAnim, {
            toValue: snapWidth,
            useNativeDriver: false,
            bounciness: 2,
            speed: 18,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        if (isCollapsingRef.current) return;
        setIsDraggingSidebar(false);
        setWorkspaceWatcherPaused(false);
        const snapWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, currentWidthRef.current));
        currentWidthRef.current = snapWidth;
        sidebarWidthAnim.setValue(snapWidth);
      },
    })
  ).current;

  return {
    sidebarWidthAnim,
    isDraggingSidebar,
    resizerPanHandlers: resizerPanResponder.panHandlers,
  };
}
