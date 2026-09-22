import React, { useMemo, useRef, useState, useCallback } from "react";
import { View, Text, TextInput, ScrollView, StyleSheet, Platform, NativeSyntheticEvent, NativeScrollEvent, LayoutChangeEvent } from "react-native";
import { CodeToken, getTokenColors } from "../services/syntaxTokenizer";
import { detectIndentStep, computeLineGuides } from "./editor/indentGuideUtils";

interface EditorEditRowProps {
  tokenizedLines: { lineNumber: number; tokens: CodeToken[]; indentWidth?: number }[];
  chunkText: string;
  gutterWidth: number;
  editGutterColor: (lineNum: number) => string;
  textInputRef: React.RefObject<TextInput | null>;
  theme: any;
  onEditChange: (newText: string) => void;
  selection?: { start: number; end: number };
  onSelectionChange: (sel: { start: number; end: number }) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  isEditing?: boolean;
  keyboardMouseMode?: boolean;
  cursorLine?: number;
  showIndentGuides?: boolean;
  tabSize?: number;
  fontSize?: number;
  lineHeight?: number;
  maxLineLength?: number;
  isPasting?: boolean;
}

const LINE_HEIGHT = 20;
const FONT_SIZE = 14;
const GUTTER_FONT_SIZE = 12;
const FONT_FAMILY = Platform.OS === "ios" ? "Menlo" : "monospace";
// Monospace advance at 13px is ~7.8px; deliberately overestimated so the
// input is always at least as wide as its longest line -> never soft-wraps.
const CHAR_WIDTH = 8.5;
// Cap: absurdly long single lines fall back to wrap rather than GPU crash.
const MAX_NOWRAP_CHARS = 1800;

/**
 * Dual-Layer Editor Row for EditorView:
 * 1. Pinned gutter on the left with line numbers and error indicators.
 * 2. Syntax Highlight Layer: Renders tokens in full color via native Text
 *    components (bypassing Android ReactEditText child styling limitations).
 * 3. Transparent TextInput Overlay (in Edit Mode): Handles keyboard input,
 *    cursor positioning, and selection without overriding token colors.
 */
export const EditorEditRow = React.memo(function EditorEditRow({
  tokenizedLines,
  chunkText,
  gutterWidth,
  editGutterColor,
  textInputRef,
  theme,
  onEditChange,
  selection,
  onSelectionChange,
  onFocus,
  onBlur,
  isEditing = true,
  keyboardMouseMode = false,
  cursorLine,
  showIndentGuides = true,
  tabSize = 2,
  fontSize = FONT_SIZE,
  lineHeight = LINE_HEIGHT,
  maxLineLength,
  isPasting = false,
}: EditorEditRowProps) {
  const tokenPalette = useMemo(() => getTokenColors(theme), [theme]);

  const tokenStyleMap = useMemo(() => {
    const map: Record<string, { color: string; fontStyle?: "italic" | "normal" }> = {};
    for (const [type, color] of Object.entries(tokenPalette)) {
      map[type] = { color: color || theme.textPrimary };
    }
    map.plain = { color: tokenPalette.plain || theme.textPrimary };
    map.comment = { color: tokenPalette.comment || theme.textMuted, fontStyle: "italic" };
    return map;
  }, [tokenPalette, theme]);

  const estCharWidth = fontSize * 0.65;
  const monoCharWidth = fontSize * 0.6;
  const gutterFontSize = Math.max(9, fontSize - 2);

  const indentStep = useMemo(
    () => (isEditing ? 2 : detectIndentStep(tokenizedLines, tabSize)),
    [tokenizedLines, tabSize, isEditing]
  );

  // Indent guides are omitted during active editing to eliminate hundreds of native View allocations
  const lineGuides = useMemo(() => {
    if (!showIndentGuides || isEditing || tokenizedLines.length > 300) return [];
    return computeLineGuides(tokenizedLines, showIndentGuides, indentStep, monoCharWidth);
  }, [tokenizedLines, showIndentGuides, isEditing, indentStep, monoCharWidth]);

  const guideColor =
    theme.editorIndentGuide ||
    (theme.isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.09)");

  // Fast-path: calculate width from longest line in chunkText, using precomputed maxLineLength when available
  const contentWidth = useMemo(() => {
    let max = maxLineLength;
    if (max === undefined) {
      max = 0;
      const lines = chunkText.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > max) max = lines[i].length;
      }
    }
    return Math.ceil(Math.min(max, MAX_NOWRAP_CHARS) * estCharWidth) + 50;
  }, [chunkText, estCharWidth, maxLineLength]);

  const hScrollRef = useRef<ScrollView | null>(null);
  const hViewWRef = useRef(0);
  const hScrollXRef = useRef(0);

  // Keep the cursor horizontally visible while typing long lines.
  const followCursorX = (offset: number) => {
    const vw = hViewWRef.current;
    if (!vw) return;
    const upto = chunkText.slice(0, Math.max(0, Math.min(offset, chunkText.length)));
    const col = upto.length - (upto.lastIndexOf("\n") + 1);
    const x = col * monoCharWidth + 6;
    const sx = hScrollXRef.current;
    if (x < sx + 4) {
      hScrollRef.current?.scrollTo({ x: Math.max(0, x - 40), animated: false });
    } else if (x > sx + vw - 60) {
      hScrollRef.current?.scrollTo({ x: x - vw + 80, animated: false });
    }
  };

  const handleSelChange = (sel: { start: number; end: number }) => {
    followCursorX(sel.start);
    onSelectionChange(sel);
  };

  const handleHLayout = (e: LayoutChangeEvent) => {
    hViewWRef.current = e.nativeEvent.layout.width;
  };

  const handleHScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    hScrollXRef.current = e.nativeEvent.contentOffset.x;
  };

  // Measure the native TextInput's actual per-line height at runtime.
  // On Android, EditText's internal line spacing can differ from the RN lineHeight
  // prop due to font metric rounding and density conversion. The error compounds
  // per-line, causing the highlight to drift onto the wrong line for lower lines.
  const [measuredLH, setMeasuredLH] = useState(lineHeight);
  const measuredLHRef = useRef(lineHeight);

  // Reset when lineHeight prop changes (pinch-zoom / font size change)
  const prevLineHeightRef = useRef(lineHeight);
  if (prevLineHeightRef.current !== lineHeight) {
    prevLineHeightRef.current = lineHeight;
    measuredLHRef.current = lineHeight;
    setMeasuredLH(lineHeight);
  }

  const handleContentSizeChange = useCallback(
    (e: { nativeEvent: { contentSize: { height: number; width: number } } }) => {
      const h = e.nativeEvent.contentSize.height;
      let n = 1;
      for (let i = 0; i < chunkText.length; i++) {
        if (chunkText.charCodeAt(i) === 10) n++;
      }
      if (n > 2) {
        // 16 = paddingTop(8) + paddingBottom(8) from editorInput style
        const measured = (h - 16) / n;
        if (
          Math.abs(measured - lineHeight) <= lineHeight * 0.35 &&
          Math.abs(measured - measuredLHRef.current) > 0.05
        ) {
          measuredLHRef.current = measured;
          setMeasuredLH(measured);
        }
      }
    },
    [chunkText, lineHeight]
  );

  // In edit mode, use the measured native line height; in view mode use the prop
  // (view mode uses flexbox layout which is pixel-exact).
  const highlightLH = isEditing ? measuredLH : lineHeight;

  const activeLineIndex = useMemo(() => {
    if (!cursorLine || tokenizedLines.length === 0) return -1;
    const firstLine = tokenizedLines[0].lineNumber;
    const approxIdx = cursorLine - firstLine;
    if (approxIdx >= 0 && approxIdx < tokenizedLines.length && tokenizedLines[approxIdx]?.lineNumber === cursorLine) {
      return approxIdx;
    }
    return tokenizedLines.findIndex((l) => l.lineNumber === cursorLine);
  }, [cursorLine, tokenizedLines]);

  return (
    <View style={[styles.editorRow, { backgroundColor: theme.bgPrimary }]}>
      {/* Pinned Gutter on the left (transparent background, numbers only) */}
      <View
        style={[
          styles.gutterContainer,
          { width: gutterWidth, backgroundColor: "transparent" },
        ]}
      >
        {activeLineIndex >= 0 && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 8 + activeLineIndex * highlightLH,
              left: 0,
              right: 0,
              height: highlightLH,
              backgroundColor: theme.isDark
                ? "rgba(255, 255, 255, 0.055)"
                : "rgba(0, 0, 0, 0.04)",
              zIndex: 0,
            }}
          />
        )}
        {tokenizedLines.map((line) => {
          const isCurrentLine = cursorLine === line.lineNumber;
          const color = isCurrentLine
            ? theme.textPrimary
            : editGutterColor(line.lineNumber);
          const isError = color === theme.accentRed;
          return (
            <Text
              key={`g-${line.lineNumber}`}
              style={[
                styles.gutterText,
                { color, fontSize: gutterFontSize, height: lineHeight, lineHeight },
                (isError || isCurrentLine) && styles.gutterTextBold,
              ]}
              numberOfLines={1}
            >
              {isError && line.lineNumber < 1000 ? `●${line.lineNumber}` : line.lineNumber}
            </Text>
          );
        })}
      </View>

      {/* Horizontally scrollable code area */}
      <ScrollView
        horizontal
        ref={hScrollRef}
        showsHorizontalScrollIndicator={true}
        style={styles.horizontalScroll}
        contentContainerStyle={styles.editHorizontalContent}
        onLayout={handleHLayout}
        onScroll={handleHScroll}
        scrollEventThrottle={16}
      >
        <View style={[styles.codeContainer, { width: contentWidth, minWidth: "100%" }]}>
          {/* Active Focused Line Highlight (covers the whole line) */}
          {activeLineIndex >= 0 && (
            <View
              pointerEvents="none"
              style={[
                styles.activeLineHighlight,
                {
                  top: 8 + activeLineIndex * highlightLH,
                  height: highlightLH,
                  width: Math.max(contentWidth, 3000),
                  backgroundColor: theme.isDark
                    ? "rgba(255, 255, 255, 0.055)"
                    : "rgba(0, 0, 0, 0.04)",
                },
              ]}
            />
          )}
          {/* Indent Guide Background Underlay (renders in View Mode without blocking touches) */}
          {showIndentGuides && !isEditing && (
            <View style={[StyleSheet.absoluteFill, styles.guideUnderlay]} pointerEvents="none">
              {tokenizedLines.map((line, idx) => {
                const guides = lineGuides[idx];
                if (!guides || guides.length === 0) {
                  return <View key={`g-${line.lineNumber}`} style={[styles.guideLineBox, { height: lineHeight }]} />;
                }
                return (
                  <View key={`g-${line.lineNumber}`} style={[styles.guideLineBox, { height: lineHeight }]}>
                    {guides.map((gLeft) => (
                      <View
                        key={`gl-${gLeft}`}
                        style={[styles.indentGuide, { left: gLeft, backgroundColor: guideColor }]}
                      />
                    ))}
                  </View>
                );
              })}
            </View>
          )}

          {!isEditing ? (
            /* View Mode: Vibrant Syntax Highlighted Code (rendered with full native Text colors) */
            <View style={styles.syntaxLayer}>
              {tokenizedLines.map((line) => (
                <View key={`line-${line.lineNumber}`} style={[styles.codeLineBox, { height: lineHeight }]}>
                  <Text style={[styles.codeLineText, { fontSize, lineHeight, color: theme.textPrimary }]} numberOfLines={1}>
                    {line.tokens.length === 0
                      ? " "
                      : line.tokens.map((tok, tIdx) => (
                          <Text key={`tok-${tIdx}`} style={tokenStyleMap[tok.type] || { color: theme.textPrimary }}>
                            {tok.text}
                          </Text>
                        ))}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            /* Edit Mode: Single-layer TextInput with ultra-optimized flat token spans */
            <TextInput
              ref={textInputRef}
              style={[
                styles.editorInput,
                {
                  width: contentWidth,
                  fontSize,
                  lineHeight,
                  color: theme.textPrimary,
                },
              ]}
              multiline
              scrollEnabled={false}
              editable={true}
              blurOnSubmit={false}
              showSoftInputOnFocus={!keyboardMouseMode}
              inputMode={keyboardMouseMode ? "none" : undefined}
              keyboardType={keyboardMouseMode ? "visible-password" : "default"}
              onChangeText={onEditChange}
              selection={selection}
              onSelectionChange={(e) => handleSelChange(e.nativeEvent.selection)}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              importantForAutofill="no"
              disableFullscreenUI={true}
              textAlignVertical="top"
              onFocus={onFocus}
              onBlur={onBlur}
              cursorColor={theme.accent}
              selectionColor={Platform.OS === "android" ? `${theme.accent}45` : undefined}
              underlineColorAndroid="transparent"
              onContentSizeChange={handleContentSizeChange}
            >
              {tokenizedLines.length > 250 || isPasting ? (
                chunkText
              ) : (
                <Text key="editor-tokens" style={{ color: theme.textPrimary }}>
                  {tokenizedLines.map((line, lIdx) => {
                    const isNearCursor =
                      tokenizedLines.length <= 60 ||
                      !cursorLine ||
                      Math.abs(line.lineNumber - cursorLine) <= 30;
                    return (
                      <React.Fragment key={`l-${line.lineNumber}`}>
                        {line.tokens.length === 0 ? null : isNearCursor ? (
                          line.tokens.map((tok, tIdx) => (
                            <Text key={`tok-${tIdx}`} style={tokenStyleMap[tok.type] || { color: theme.textPrimary }}>
                              {tok.text}
                            </Text>
                          ))
                        ) : (
                          <Text>{line.tokens.map((t) => t.text).join("")}</Text>
                        )}
                        {lIdx < tokenizedLines.length - 1 ? "\n" : ""}
                      </React.Fragment>
                    );
                  })}
                </Text>
              )}
            </TextInput>
          )}
        </View>
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  editorRow: {
    flexDirection: "row",
    minHeight: "100%",
  },
  gutterContainer: {
    paddingTop: 8,
    paddingBottom: 8,
    paddingRight: 4,
    alignItems: "flex-end",
  },
  gutterLineBox: {
    height: LINE_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  gutterText: {
    fontFamily: FONT_FAMILY,
    fontSize: GUTTER_FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    textAlign: "right",
    width: "100%",
    includeFontPadding: false,
  },
  gutterTextBold: {
    fontWeight: "700",
  },
  activeLineHighlight: {
    position: "absolute",
    left: 0,
    zIndex: 0,
  },
  horizontalScroll: {
    flex: 1,
  },
  editHorizontalContent: {
    minWidth: "100%",
  },
  codeContainer: {
    position: "relative",
  },
  syntaxLayer: {
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 6,
    paddingRight: 24,
  },
  codeLineBox: {
    height: LINE_HEIGHT,
    justifyContent: "center",
    position: "relative",
  },
  guideUnderlay: {
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 6,
    paddingRight: 24,
  },
  guideLineBox: {
    height: LINE_HEIGHT,
    position: "relative",
  },
  indentGuide: {
    position: "absolute",
    width: 1,
    top: 0,
    bottom: 0,
  },
  codeLineText: {
    fontFamily: FONT_FAMILY,
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    includeFontPadding: false,
  },
  tokenText: {
    fontFamily: FONT_FAMILY,
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    includeFontPadding: false,
  },
  commentText: {
    fontStyle: "italic",
  },
  editorInput: {
    fontFamily: FONT_FAMILY,
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 6,
    paddingRight: 24,
    minWidth: "100%",
    margin: 0,
    borderWidth: 0,
    textAlignVertical: "top",
    includeFontPadding: false,
  },
});
