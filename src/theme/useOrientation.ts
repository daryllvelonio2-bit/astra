import { useWindowDimensions } from "react-native";

/**
 * Tracks device orientation for responsive layouts.
 * Landscape = width greater than height (short screens collapse chrome).
 */
export function useOrientation() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  return { width, height, isLandscape };
}
