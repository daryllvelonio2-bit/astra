import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TextInput,
  GestureResponderEvent,
} from "react-native";
import { EditorEditRow } from "../EditorEditRow";
import { tokenizeCode, CodeToken } from "../../services/syntaxTokenizer";
import { computeCursorOffset } from "../editorCursorUtils";

interface ContinuationSplitViewProps {
  content: string;
  fileName?: string;
  theme: any;
  fontSize: number;
  lineHeight: number;
  gutterWidth: number;
  isEditing: boolean;
  keyboardMouseMode: boolean;
  textInputRef: React.RefObject<TextInput | null>;
  onEditChange: (text: string) => void;
  selection?: { start: number; end: number };
  onSelectionChange: (sel: { start: number; end: number }) => void;
  editGutterColor: (lineNum: number) => string;
  cursorLine?: number;
  showIndentGuides: boolean;
  tabSize?: number;
  onCloseSplit?: () => void;
  onEnterEditMode?: (offset: number) => void;
  tokenizedLines?: { lineNumber: number; tokens: CodeToken[]; indentWidth?: number }[];
  maxLineLength?: number;
  isPasting?: boolean;
}

/**
 * Dual-Column Split Screen Editor for Landscape Mode.
 * Both columns are 100% editable:
 * - Left column displays the document from the start.
 * - Right column displays the continuation lines (offset by linesPerPage) or can scroll freely.
 * - Both columns feature active syntax highlighting, gutter line numbering, and TextInput editing.
 * - Tapping or double-tapping either pane focuses editing at that exact line and offset.
 */
export function ContinuationSplitView({
  content,
  fileName,
  theme,
  fontSize,
  lineHeight,
  gutterWidth,
  isEditing,
  keyboardMouseMode,
  textInputRef,
  onEditChange,
  selection,
  onSelectionChange,
  editGutterColor,
  cursorLine,
  showIndentGuides,
  tabSize,
  onEnterEditMode,
  tokenizedLines,
  maxLineLength,
  isPasting,
}: ContinuationSplitViewProps) {
  const [activePane, setActivePane] = useState<"left" | "right">("left");
  const leftScrollRef = useRef<ScrollView | null>(null);
  const rightScrollRef = useRef<ScrollView | null>(null);
  const leftInputRef = useRef<TextInput | null>(null);
  const rightInputRef = useRef<TextInput | null>(null);

  const containerHeightRef = useRef<number>(360);
  const leftScrollYRef = useRef<number>(0);
  const rightScrollYRef = useRef<number>(0);
  const isSyncingScrollRef = useRef<boolean>(false);
  const lastTapRef = useRef<number>(0);
  const hasInitializedRightScrollRef = useRef<boolean>(false);

  // Sync external textInputRef to whichever pane is currently active
  useEffect(() => {
    if (!textInputRef) return;
    const activeRef = activePane === "left" ? leftInputRef.current : rightInputRef.current;
    if (activeRef) {
      (textInputRef as React.MutableRefObject<TextInput | null>).current = activeRef;
    }
  }, [activePane, textInputRef, isEditing]);

  const rawLines = useMemo(() => (content || "").split("\n"), [content]);
  const totalLines = Math.max(rawLines.length, 1);

  // Number of lines visible vertically in one column
  const linesPerPage = Math.max(
    8,
    Math.floor(containerHeightRef.current / lineHeight)
  );

  // Initialize right pane continuation scroll position once container layout is known
  const initializeContinuationScroll = (height: number) => {
    containerHeightRef.current = height;
    if (!hasInitializedRightScrollRef.current && totalLines > linesPerPage) {
      hasInitializedRightScrollRef.current = true;
      const continuationY = linesPerPage * lineHeight;
      setTimeout(() => {
        rightScrollRef.current?.scrollTo({ y: continuationY, animated: false });
        rightScrollYRef.current = continuationY;
      }, 50);
    }
  };

  // Synchronize continuation scroll in view mode
  const handleLeftScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    leftScrollYRef.current = y;
    if (!isEditing && !isSyncingScrollRef.current) {
      isSyncingScrollRef.current = true;
      const targetRightY = y + linesPerPage * lineHeight;
      rightScrollRef.current?.scrollTo({ y: targetRightY, animated: false });
      rightScrollYRef.current = targetRightY;
      setTimeout(() => {
        isSyncingScrollRef.current = false;
      }, 30);
    }
  };

  const handleRightScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    rightScrollYRef.current = y;
    if (!isEditing && !isSyncingScrollRef.current) {
      isSyncingScrollRef.current = true;
      const targetLeftY = Math.max(0, y - linesPerPage * lineHeight);
      leftScrollRef.current?.scrollTo({ y: targetLeftY, animated: false });
      leftScrollYRef.current = targetLeftY;
      setTimeout(() => {
        isSyncingScrollRef.current = false;
      }, 30);
    }
  };

  // Handle double-tap to enter edit mode in either pane
  const handlePaneTap = (pane: "left" | "right", e: GestureResponderEvent) => {
    if (isEditing) return;
    const now = Date.now();
    if (now - lastTapRef.current < 350) {
      const scrollY = pane === "left" ? leftScrollYRef.current : rightScrollYRef.current;
      const locationY = e.nativeEvent.locationY;
      const approxLine = Math.max(0, Math.min(Math.floor((scrollY + locationY) / lineHeight), totalLines - 1));
      const codeStartX = gutterWidth + 6;
      const locX = e.nativeEvent.locationX;
      const charWidth = fontSize * 0.6;
      const approxCol = locX > codeStartX ? Math.floor((locX - codeStartX) / charWidth) : 0;
      const offset = computeCursorOffset(content, approxLine, 0, approxCol);

      setActivePane(pane);
      onEnterEditMode?.(offset);
    }
    lastTapRef.current = now;
  };

  // Use pre-computed tokens from EditorView if available, otherwise tokenize
  const displayTokens = useMemo(() => {
    if (tokenizedLines && tokenizedLines.length > 0) return tokenizedLines;
    return tokenizeCode(content || "", fileName, 1);
  }, [tokenizedLines, content, fileName]);

  return (
    <View
      style={[styles.container, { backgroundColor: theme.bgPrimary }]}
      onLayout={(e) => initializeContinuationScroll(e.nativeEvent.layout.height)}
    >
      {/* Left Column: Primary View / Editor */}
      <View style={[styles.column, { borderRightColor: theme.border }]}>
        <ScrollView
          ref={leftScrollRef}
          style={styles.paneScroll}
          contentContainerStyle={{ paddingBottom: 24 }}
          onScroll={handleLeftScroll}
          scrollEventThrottle={32}
          keyboardShouldPersistTaps="handled"
          onTouchEnd={(e) => handlePaneTap("left", e)}
        >
          <EditorEditRow
            isEditing={isEditing}
            keyboardMouseMode={keyboardMouseMode}
            tokenizedLines={displayTokens}
            chunkText={content}
            gutterWidth={gutterWidth}
            editGutterColor={editGutterColor}
            cursorLine={activePane === "left" ? cursorLine : undefined}
            textInputRef={leftInputRef}
            theme={theme}
            onEditChange={onEditChange}
            selection={activePane === "left" ? selection : undefined}
            onSelectionChange={onSelectionChange}
            onFocus={() => setActivePane("left")}
            showIndentGuides={showIndentGuides}
            tabSize={tabSize}
            fontSize={fontSize}
            lineHeight={lineHeight}
            maxLineLength={maxLineLength}
            isPasting={isPasting}
          />
        </ScrollView>
      </View>

      {/* Right Column: Continuation View / Editor */}
      <View style={styles.column}>
        <ScrollView
          ref={rightScrollRef}
          style={styles.paneScroll}
          contentContainerStyle={{ paddingBottom: 24 }}
          onScroll={handleRightScroll}
          scrollEventThrottle={32}
          keyboardShouldPersistTaps="handled"
          onTouchEnd={(e) => handlePaneTap("right", e)}
        >
          <EditorEditRow
            isEditing={isEditing}
            keyboardMouseMode={keyboardMouseMode}
            tokenizedLines={displayTokens}
            chunkText={content}
            gutterWidth={gutterWidth}
            editGutterColor={editGutterColor}
            cursorLine={activePane === "right" ? cursorLine : undefined}
            textInputRef={rightInputRef}
            theme={theme}
            onEditChange={onEditChange}
            selection={activePane === "right" ? selection : undefined}
            onSelectionChange={onSelectionChange}
            onFocus={() => setActivePane("right")}
            showIndentGuides={showIndentGuides}
            tabSize={tabSize}
            fontSize={fontSize}
            lineHeight={lineHeight}
            maxLineLength={maxLineLength}
            isPasting={isPasting}
          />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
  },
  column: {
    flex: 1,
    borderRightWidth: 1,
    position: "relative",
  },
  paneScroll: {
    flex: 1,
  },
});
