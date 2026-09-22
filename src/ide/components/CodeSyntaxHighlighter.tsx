import React from "react";
import { View, Text, StyleSheet, Platform, ScrollView } from "react-native";
import { TokenizedLine, CodeToken, getTokenColors } from "../services/syntaxTokenizer";
import { CodeDiagnostic } from "../services/codeDiagnosticsService";
import { useTheme } from "../../theme/themeContext";
import { detectIndentStep, computeLineGuides } from "./editor/indentGuideUtils";

interface CodeSyntaxHighlighterProps {
  tokenizedLines: TokenizedLine[];
  fontSize?: number;
  lineHeight?: number;
  gutterWidth?: number;
  theme?: any;
  errorLines?: Map<number, CodeDiagnostic>;
  matchLines?: Set<number>;
  matchUnmatched?: boolean;
  activeLine?: number;
}

const FONT_FAMILY = Platform.OS === "ios" ? "Menlo" : "monospace";

export const CodeSyntaxHighlighter = React.memo(function CodeSyntaxHighlighter({
  tokenizedLines,
  fontSize = 13,
  lineHeight = 20,
  gutterWidth = 24,
  theme: themeProp,
  errorLines,
  matchLines,
  matchUnmatched = false,
  activeLine,
}: CodeSyntaxHighlighterProps) {
  const { theme: globalTheme } = useTheme();
  const theme = themeProp || globalTheme;
  // Speed: palette + guide color were rebuilt per render (every keystroke).
  const tokenPalette = React.useMemo(() => getTokenColors(theme), [theme]);
  const indentStep = React.useMemo(() => detectIndentStep(tokenizedLines, 2), [tokenizedLines]);
  const lineGuides = React.useMemo(() => computeLineGuides(tokenizedLines, true, indentStep), [tokenizedLines, indentStep]);
  const guideColor = theme.editorIndentGuide || (theme.isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.09)");

  const gutterColorFor = (lineNumber: number): string => {
    if (errorLines?.has(lineNumber)) return theme.accentRed;
    if (matchUnmatched && matchLines?.has(lineNumber)) return theme.accentRed;
    if (matchLines?.has(lineNumber)) return theme.accent;
    if (activeLine === lineNumber) return theme.textPrimary;
    return theme.textMuted;
  };

  const lineBgFor = (lineNumber: number): string | undefined => {
    if (errorLines?.has(lineNumber)) return `${theme.accentRed}12`;
    if (matchLines?.has(lineNumber)) return `${theme.accent}15`;
    return undefined;
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
      {/* Pinned Line Number Gutter */}
      <View style={[styles.gutter, { width: gutterWidth }]}>
        {tokenizedLines.map((line) => (
          <View
            key={`gutter-${line.lineNumber}`}
            style={[styles.lineBox, { height: lineHeight }, lineBgFor(line.lineNumber) && { backgroundColor: lineBgFor(line.lineNumber) }]}
          >
            <Text
              style={[
                styles.gutterNum,
                {
                  fontSize: fontSize - 2,
                  lineHeight,
                  color: gutterColorFor(line.lineNumber),
                },
                activeLine === line.lineNumber && { fontWeight: "bold" },
              ]}
            >
              {line.lineNumber}
            </Text>
          </View>
        ))}
      </View>

      {/* Code Text with Horizontal Scroll for Long Lines */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={true}
        style={styles.horizontalScroll}
        contentContainerStyle={styles.codeBodyContent}
      >
        <View style={[styles.codeBody, { backgroundColor: theme.bgPrimary }]}>
          {tokenizedLines.map((line, lIdx) => (
            <View
              key={`line-${line.lineNumber}`}
              style={[styles.lineBox, { height: lineHeight }, lineBgFor(line.lineNumber) && { backgroundColor: lineBgFor(line.lineNumber) }]}
            >
              {/* Indent Guide Lines */}
              {lineGuides[lIdx]?.map((gLeft) => (
                <View
                  key={`gl-${gLeft}`}
                  style={[
                    styles.indentGuide,
                    { left: gLeft, height: lineHeight, backgroundColor: guideColor },
                  ]}
                />
              ))}
              <Text style={[styles.codeLineText, { fontSize, lineHeight, color: theme.textPrimary }]}>
                {line.tokens.map((token: CodeToken, idx: number) => {
                  const tokenColor =
                    token.type === "comment"
                      ? theme.textMuted
                      : (tokenPalette[token.type] || tokenPalette.plain);
                  return (
                    <Text
                      key={idx}
                      style={[
                        styles.tokenText,
                        { color: tokenColor },
                        token.type === "comment" && { fontStyle: "italic", color: theme.textMuted },
                      ]}
                    >
                      {token.text}
                    </Text>
                  );
                })}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    minHeight: "100%",
    paddingVertical: 8,
  },
  gutter: {
    alignItems: "center",
    paddingRight: 2,
  },
  horizontalScroll: {
    flex: 1,
  },
  codeBodyContent: {
    minWidth: "100%",
  },
  lineBox: {
    justifyContent: "center",
    position: "relative",
  },
  gutterNum: {
    fontFamily: FONT_FAMILY,
    textAlign: "center",
    includeFontPadding: false,
  },
  codeBody: {
    paddingLeft: 6,
    paddingRight: 24,
  },
  indentGuide: {
    position: "absolute",
    width: 1,
    top: 0,
    bottom: 0,
    zIndex: 1,
  },
  codeLineText: {
    fontFamily: FONT_FAMILY,
    includeFontPadding: false,
  },
  tokenText: {
    fontFamily: FONT_FAMILY,
    includeFontPadding: false,
  },
});
