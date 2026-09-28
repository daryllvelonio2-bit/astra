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
 * Geometry: the body fills the whole screen and NEVER moves; the top blocks
 * float over it and are the only thing lifted. An earlier design translated
 * the body by the same amount, which kept its box size constant (good for the
 * scroll range) but vacated a band at the bottom of the screen that painted
 * over the README. Floating the header instead keeps the box size constant
 * AND leaves nothing uncovered — the body simply gains the pixels the header
 * released.
 *
 * The scroll content carries a `topInset` spacer the height of the floating
 * block, so at rest no row starts hidden underneath it, and it scrolls away
 * with the rest of the content.
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
   * The floating block's height: the distance it travels, and the inset the
   * scroll content reserves so nothing hides underneath it at rest. It
   * re-reports whenever a child appears, wraps or resizes.
   */
  const onTopLayout = useCallback((e: LayoutChangeEvent) => {
    setTopHeight(e.nativeEvent.layout.height);
  }, []);

  /** The body is absolute-fill, so its height is the whole viewport and never
   *  changes — which is what keeps the scroll range stable. */
  const onBodyLayout = useCallback((e: LayoutChangeEvent) => {
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

  return { onScroll, onTopLayout, onBodyLayout, onReadmeLayout, onContentHeight, liftStyle, reset, topHeight };
}