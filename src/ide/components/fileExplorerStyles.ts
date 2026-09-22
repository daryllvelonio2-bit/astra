import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRightWidth: 1,
    paddingTop: 8,
    position: 'relative',
  },
  bottomResizeBox: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomResizeBoxActive: {},
  resizeIndicator: {
    width: 28,
    height: 3,
    borderRadius: 2,
  },
  resizeIndicatorActive: {},
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  header: {
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconBtn: {
    padding: 4,
  },
  dragGhost: {
    position: "absolute",
    zIndex: 9999,
    elevation: 25,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    maxWidth: 220,
  },
  dragGhostIcon: {
    marginRight: 6,
  },
  dragGhostText: {
    fontSize: 12,
    fontWeight: "700",
  },
  scroll: {
    flex: 1,
  },
  emptyContainer: {
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 12,
  },
  inlineCreateRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginHorizontal: 4,
    marginVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  inlineInput: {
    flex: 1,
    fontSize: 11.5,
    fontFamily: "monospace",
    paddingVertical: 1,
    paddingHorizontal: 4,
  },
  inlineBtn: {
    padding: 2,
    marginLeft: 2,
  },
  emptySubtext: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: "bold",
  },
  folderContainer: {
    marginVertical: 1,
  },
  folderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  folderHoverTarget: {
    borderWidth: 1,
  },
  folderName: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  folderNameHover: {
    fontWeight: "700",
  },
  childrenContainer: {
    paddingLeft: 12,
  },
  fileWrapper: {
    marginVertical: 1,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  activeFileItem: {},
  fileIconWrapper: {
    marginRight: 6,
  },
  fileName: {
    fontSize: 13,
    flex: 1,
  },
  activeFileName: {
    fontWeight: '600',
  },
  rootDropZone: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 8,
    marginTop: 10,
    marginBottom: 16,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 6,
  },
  rootDropZoneActive: {},
  rootDropZoneText: {
    fontSize: 11,
    fontWeight: "500",
  },
  rootDropZoneTextActive: {
    fontWeight: "700",
  },
  moreActionBtn: {
    padding: 3,
    marginLeft: 2,
    opacity: 0.7,
  },
});
