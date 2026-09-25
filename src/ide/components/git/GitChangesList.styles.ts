import { StyleSheet } from "react-native";

export const gitChangesListStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  subHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  subHeaderLandscape: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  selectAllRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  countText: {
    fontSize: 12,
    fontWeight: "600",
  },
  countTextLandscape: {
    fontSize: 11,
  },
  fileList: {
    flex: 1,
  },
  fileListContent: {
    paddingBottom: 4,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  emptyView: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  emptyTitleLandscape: {
    fontSize: 12.5,
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: "center",
  },
  emptySubtitleLandscape: {
    fontSize: 10.5,
  },
  pushNowBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    marginTop: 8,
  },
  pushNowBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  commitBox: {
    padding: 10,
    borderTopWidth: 1,
    gap: 8,
    flexShrink: 0,
  },
  commitBoxLandscape: {
    padding: 6,
    gap: 5,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  summaryInput: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 0,
    textAlignVertical: "center",
    fontSize: 12,
  },
  summaryInputLandscape: {
    height: 30,
    fontSize: 10.5,
    paddingHorizontal: 6,
    paddingVertical: 0,
    textAlignVertical: "center",
    borderRadius: 4,
  },
  descToggleBtn: {
    width: 28,
    height: 28,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  descToggleBtnLandscape: {
    width: 30,
    height: 30,
  },
  descriptionInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 11.5,
    textAlignVertical: "top",
  },
  descriptionInputLandscape: {
    height: 30,
    fontSize: 10.5,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
  },
  commitBtnRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  commitBtn: {
    flex: 1,
    height: 36,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  commitBtnLandscape: {
    height: 30,
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  commitBtnText: {
    fontSize: 12.5,
    fontWeight: "700",
  },
  commitBtnTextLandscape: {
    fontSize: 10.5,
    fontWeight: "700",
  },
  pushToggle: {
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  pushToggleLandscape: {
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  toggleTrack: {
    width: 30,
    height: 17,
    borderRadius: 9,
    justifyContent: "center",
  },
  toggleThumb: {
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: "#fff",
  },
  toggleThumbOn: {
    alignSelf: "flex-end",
    marginRight: 2,
  },
  toggleThumbOff: {
    alignSelf: "flex-start",
    marginLeft: 2,
  },
  commitPushText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
});
