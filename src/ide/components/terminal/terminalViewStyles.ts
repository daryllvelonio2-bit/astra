import { StyleSheet } from "react-native";

export const terminalViewStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  /** Header + viewport column: flex in normal flow, explicit height when locked. */
  content: {
    flex: 1,
  },
  floatingBar: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  viewport: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  viewportInner: {
    flex: 1,
    minHeight: "100%",
  },
  viewportContent: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: "100%",
  },
  toastContainer: {
    position: "absolute",
    top: 40,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    zIndex: 999,
    opacity: 0.95,
  },
  toastText: {
    fontSize: 11,
    fontWeight: "600",
    fontFamily: "monospace",
  },
  hiddenInput: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    opacity: 0.01,
  },
  splitWrapper: {
    flex: 1,
  },
  splitCol: {
    flexDirection: "column",
  },
  splitRow: {
    flexDirection: "row",
  },
  paneContainer: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "transparent",
  },
  paneViewport: {
    flex: 1,
  },
  dividerHorizontal: {
    height: 2,
  },
  dividerVertical: {
    width: 2,
  },
});
