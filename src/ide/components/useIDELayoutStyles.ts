import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { Animated } from "react-native";
import { RunningTask } from "../../ai/services/runningTasksService";

interface StylesParams {
  runningTasks: RunningTask[];
  bgPrimary: string;
  bgSecondary?: string;
  isLandscape: boolean;
  insetTop: number;
  insetLeft: number;
  insetRight: number;
  sidebarWidthAnim: Animated.Value;
}

/** Memoized layout styles + running count. Same visuals, stable refs. */
export function useIDELayoutStyles(p: StylesParams) {
  const runningTaskCount = useMemo(
    () => p.runningTasks.reduce((n, t) => (t.status === "running" ? n + 1 : n), 0),
    [p.runningTasks]
  );
  const containerStyle = useMemo(
    () => [
      styles.container,
      {
        backgroundColor: p.bgPrimary,
        paddingTop: p.isLandscape ? 0 : p.insetTop,
        paddingLeft: p.isLandscape ? 0 : p.insetLeft,
        paddingRight: p.isLandscape ? 0 : p.insetRight,
      },
    ],
    [p.bgPrimary, p.isLandscape, p.insetTop, p.insetLeft, p.insetRight]
  );
  const workspaceStyle = useMemo(
    () => [styles.workspace, { backgroundColor: p.bgPrimary }],
    [p.bgPrimary]
  );
  const editorContainerStyle = useMemo(
    () => [styles.editorContainer, { backgroundColor: p.bgPrimary }],
    [p.bgPrimary]
  );
  const tabContentStyle = useMemo(
    () => [styles.tabContent, { backgroundColor: p.bgPrimary }],
    [p.bgPrimary]
  );
  const sidebarAnimStyle = useMemo(
    () => [
      styles.sidebarWrapper,
      {
        backgroundColor: p.bgSecondary || p.bgPrimary,
        width: p.sidebarWidthAnim,
        opacity: p.sidebarWidthAnim.interpolate({
          inputRange: [0, 30],
          outputRange: [0, 1],
          extrapolate: "clamp",
        }),
      },
    ],
    [p.sidebarWidthAnim, p.bgSecondary, p.bgPrimary]
  );
  return {
    runningTaskCount,
    containerStyle,
    workspaceStyle,
    editorContainerStyle,
    tabContentStyle,
    sidebarAnimStyle,
  };
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  workspace: { flex: 1, flexDirection: "row" },
  editorContainer: { flex: 1, position: "relative" },
  tabContent: { flex: 1 },
  sidebarWrapper: { height: "100%", overflow: "hidden" },
});
