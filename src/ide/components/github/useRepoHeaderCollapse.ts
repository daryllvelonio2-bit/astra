import { useCallback, useMemo, useRef, useState } from "react";
import { Animated, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { collapseWindow } from "./repoHeaderCollapse";

export type RepoScrollHandler = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
export type RepoLayoutHandler = (event: LayoutChangeEvent) => void;

/**
 * Drives the repository page's header collapse off the Code tab's scroll
 * position. Every number comes from onLayout / onContentSizeChange, so the
 * animation self-calibrates per repo — topics row, language bar, tabs and
 * README length all change the geometry — instead of hardcoding pixel budgets.
 *
 * Geometry: the header blocks and the tab body are lifted by the same
 * `liftStyle`, so the header slides up out of the clipped screen container
 * while the body's content rises with it. The body's box never changes size,
 * which keeps the list's scrollable range (and therefore the scroll position
 * feeding this animation) constant — a resizing viewport would clamp the
 * offset and fight the collapse.
 */
export function useRepoHeaderCollapse() {
  const scrollY = useRef(new Animated.Value(0)).current;
  /** Height of everything above the body (identity row, language bar, tabs). */
  const [topHeight, setTopHeight] = useState(0);
  const [readmeY, setReadmeY] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const range = useMemo(
    () => collapseWindow(topHeight, readmeY, contentHeight - viewportHeight),
    [topHeight, readmeY, contentHeight, viewportHeight]
  );

  const liftStyle = useMemo(() => {
    if (!range) return undefined;
    return {
      transform: [
        {
          translateY: scrollY.interpolate({
            inputRange: [range.start, range.start + range.distance],
            outputRange: [0, -topHeight],
            extrapolate: "clamp" as const,
          }),
        },
      ],
    };
  }, [range, scrollY, topHeight]);

  // Layout props cannot run on the native driver, so the scroll offset is
  // mirrored into the JS-driven value the style interpolates from.
  const onScroll = useMemo<RepoScrollHandler>(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: false,
      }),
    [scrollY]
  );

  /**
   * The body's offset inside the screen container IS the height of every block
   * above it, and it re-reports whenever one of them appears, wraps or resizes.
   * Its height is the list viewport, which the collapse never changes.
   */
  const onBodyLayout = useCallback((e: LayoutChangeEvent) => {
    setTopHeight(e.nativeEvent.layout.y);
    setViewportHeight(e.nativeEvent.layout.height);
  }, []);

  /** The README card's top in scroll-content coordinates — the collapse anchor. */
  const onReadmeLayout = useCallback((e: LayoutChangeEvent) => {
    setReadmeY(e.nativeEvent.layout.y);
  }, []);

  /** Total scrollable content, for how far the list can actually reach. */
  const onContentHeight = useCallback((_width: number, height: number) => {
    setContentHeight(height);
  }, []);

  /** Back to a whole header: tab switch, folder navigation, no README. */
  const reset = useCallback(() => {
    scrollY.setValue(0);
    setReadmeY(0);
  }, [scrollY]);

  return { onScroll, onBodyLayout, onReadmeLayout, onContentHeight, liftStyle, reset };
}