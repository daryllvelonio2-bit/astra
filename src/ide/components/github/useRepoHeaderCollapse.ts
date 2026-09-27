import { useCallback, useMemo, useRef, useState } from "react";
import { Animated, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { collapseWindow } from "./repoHeaderCollapse";

export type RepoScrollHandler = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
export type RepoLayoutHandler = (event: LayoutChangeEvent) => void;

/**
 * Drives the repository page's header collapse off the Code tab's scroll
 * position. Both measurements come from onLayout, so the animation
 * self-calibrates per repo — topics row, language bar, tabs and README length
 * all change the geometry — instead of hardcoding pixel budgets.
 *
 * One animated prop does the work: the screen container takes a negative
 * `marginTop`, which in Yoga both lifts it by `collapse` AND grows it by the
 * same amount, so its bottom stays pinned to the screen and the header slides
 * up out of the clipped content area while the body (the flex:1 tab region)
 * takes over the vacated space.
 */
export function useRepoHeaderCollapse() {
  const scrollY = useRef(new Animated.Value(0)).current;
  /** Height of everything above the body (identity row, language bar, tabs). */
  const [topHeight, setTopHeight] = useState(0);
  const [readmeY, setReadmeY] = useState(0);

  const range = useMemo(() => collapseWindow(topHeight, readmeY), [topHeight, readmeY]);

  const wrapStyle = useMemo(() => {
    if (!range) return undefined;
    return {
      marginTop: scrollY.interpolate({
        inputRange: [range.start, range.start + range.distance],
        outputRange: [0, -topHeight],
        extrapolate: "clamp" as const,
      }),
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
   * The body's offset inside the container IS the height of every block above
   * it, and it re-reports whenever one of them appears, wraps or resizes.
   */
  const onBodyLayout = useCallback((e: LayoutChangeEvent) => {
    setTopHeight(e.nativeEvent.layout.y);
  }, []);

  /** The README card's top in scroll-content coordinates — the collapse anchor. */
  const onReadmeLayout = useCallback((e: LayoutChangeEvent) => {
    setReadmeY(e.nativeEvent.layout.y);
  }, []);

  /** Back to a whole header: tab switch, folder navigation, no README. */
  const reset = useCallback(() => {
    scrollY.setValue(0);
    setReadmeY(0);
  }, [scrollY]);

  return { onScroll, onBodyLayout, onReadmeLayout, wrapStyle, reset };
}