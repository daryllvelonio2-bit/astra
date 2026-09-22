import React, { memo, useMemo } from "react";
import { Text, TextStyle, StyleSheet } from "react-native";
import { TerminalTheme, themeToTerminalTheme } from "./terminalThemes";
import { useTheme } from "../../../theme/themeContext";

interface AnsiRendererProps {
  rawText: string;
  isFocused?: boolean;
  fontSize?: number;
  theme?: TerminalTheme;
}

interface TextSpan {
  text: string;
  style: TextStyle;
}

const ANSI_COLORS_DARK: Record<number, string> = {
  30: "#484f58", // black
  31: "#ff7b72", // red
  32: "#7ee787", // green
  33: "#d29922", // yellow
  34: "#79c0ff", // blue
  35: "#d2a8ff", // magenta
  36: "#56d4dd", // cyan
  37: "#f0f6fc", // white
  90: "#8b949e", // bright black (gray)
  91: "#ffa198", // bright red
  92: "#56d364", // bright green
  93: "#e3b341", // bright yellow
  94: "#a5d6ff", // bright blue
  95: "#e2c5ff", // bright magenta
  96: "#79e6ec", // bright cyan
  97: "#ffffff", // bright white
};

// Darkened variants for readability on light terminal backgrounds.
const ANSI_COLORS_LIGHT: Record<number, string> = {
  30: "#24292f",
  31: "#cf222e",
  32: "#116329",
  33: "#9e6a03",
  34: "#0969da",
  35: "#8250df",
  36: "#1b7c83",
  37: "#24292f",
  90: "#57606a",
  91: "#a40e26",
  92: "#1a7f37",
  93: "#9e6a03",
  94: "#0969da",
  95: "#8250df",
  96: "#1b7c83",
  97: "#24292f",
};

const ANSI_BG_COLORS_DARK: Record<number, string> = {
  40: "#0d1117",
  41: "#b62324",
  42: "#238636",
  43: "#9e6a03",
  44: "#1f6feb",
  45: "#8957e5",
  46: "#1b7c83",
  47: "#f0f6fc",
  100: "#30363d",
  101: "#da3633",
  102: "#2ea043",
  103: "#bb8009",
  104: "#388bfd",
  105: "#a371f7",
  106: "#3192aa",
  107: "#ffffff",
};

// Pastel backgrounds for light terminal themes.
const ANSI_BG_COLORS_LIGHT: Record<number, string> = {
  40: "#e9eef5",
  41: "#ffebe9",
  42: "#dafbe1",
  43: "#fff8c5",
  44: "#ddf4ff",
  45: "#fbefff",
  46: "#daf3f5",
  47: "#24292f",
  100: "#d0d7de",
  101: "#ffcecb",
  102: "#aceebb",
  103: "#f5e8a8",
  104: "#b6e3ff",
  105: "#e0c5ff",
  106: "#a9e8ee",
  107: "#24292f",
};

function isLightTerminalTheme(theme: TerminalTheme): boolean {
  return theme.isDark === false || theme.id === "light";
}

/**
 * Parses raw terminal text with ANSI escape codes into React Native TextSpans
 */
function parseAnsiToSpans(
  raw: string,
  defaultColor: string,
  fgPalette: Record<number, string> = ANSI_COLORS_DARK,
  bgPalette: Record<number, string> = ANSI_BG_COLORS_DARK
): TextSpan[] {
  if (!raw) return [];

  // Strip non-color control sequences and tty warning messages
  const cleaned = raw
    .replace(/\/bin\/sh:\s*can't access tty;\s*job control turned off\r?\n?/g, "")
    .replace(/\x1b\[\?2004[hl]/g, "")
    .replace(/\x1b\[\?[0-9]+[hl]/g, "")
    .replace(/\x1b\[[0-9]*[A-Za-z]/g, (match) => {
      return match.endsWith("m") ? match : "";
    })
    .replace(/\x1b[=>]/g, "");

  const spans: TextSpan[] = [];
  const regex = /\x1b\[([0-9;]*)m/g;
  let lastIndex = 0;
  let currentStyle: TextStyle = { color: defaultColor };
  let match: RegExpExecArray | null;

  while ((match = regex.exec(cleaned)) !== null) {
    const textChunk = cleaned.slice(lastIndex, match.index);
    if (textChunk.length > 0) {
      spans.push({ text: textChunk, style: { ...currentStyle } });
    }

    const codeStr = match[1] || "0";
    const codes = codeStr.split(";").map((c) => parseInt(c, 10) || 0);

    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      if (code === 0) {
        currentStyle = { color: defaultColor };
      } else if (code === 1) {
        currentStyle = { ...currentStyle, fontWeight: "bold" };
      } else if (code === 2) {
        currentStyle = { ...currentStyle, opacity: 0.7 };
      } else if (code === 4) {
        currentStyle = { ...currentStyle, textDecorationLine: "underline" };
      } else if (code === 22) {
        currentStyle = { ...currentStyle, fontWeight: "normal", opacity: 1 };
      } else if (code === 24) {
        currentStyle = { ...currentStyle, textDecorationLine: "none" };
      } else if (fgPalette[code]) {
        currentStyle = { ...currentStyle, color: fgPalette[code] };
      } else if (bgPalette[code]) {
        currentStyle = { ...currentStyle, backgroundColor: bgPalette[code] };
      } else if (code === 38 && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
        const colorIdx = codes[i + 2];
        if (fgPalette[30 + (colorIdx % 8)]) {
          currentStyle = { ...currentStyle, color: fgPalette[30 + (colorIdx % 8)] };
        }
        i += 2;
      } else if (code === 48 && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
        const bgIdx = codes[i + 2];
        if (bgPalette[40 + (bgIdx % 8)]) {
          currentStyle = { ...currentStyle, backgroundColor: bgPalette[40 + (bgIdx % 8)] };
        }
        i += 2;
      } else if (code === 39) {
        currentStyle = { ...currentStyle, color: defaultColor };
      } else if (code === 49) {
        currentStyle = { ...currentStyle, backgroundColor: undefined };
      }
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < cleaned.length) {
    spans.push({ text: cleaned.slice(lastIndex), style: { ...currentStyle } });
  }

  return spans;
}

export const AnsiRenderer = memo(function AnsiRenderer({
  rawText,
  isFocused = true,
  fontSize = 12.5,
  theme: customTheme,
}: AnsiRendererProps) {
  const { theme: appTheme } = useTheme();
  const theme = customTheme || themeToTerminalTheme(appTheme);
  // Empty buffer renders just the cursor — never a fake prompt (a hardcoded
  // prompt would freeze a stale directory on screen instead of the real one).
  const displayText = rawText || "";
  // Speed: palettes/parse memoized so parent ticks (timers, keyboard) with
  // identical rawText don't rebuild objects + re-run regex.
  const { spans, dynamicFontSize } = useMemo(() => {
    const light = isLightTerminalTheme(theme);
    const baseFg = light ? ANSI_COLORS_LIGHT : ANSI_COLORS_DARK;
    const baseBg = light ? ANSI_BG_COLORS_LIGHT : ANSI_BG_COLORS_DARK;
    const fgPalette: Record<number, string> = {
      ...baseFg,
      ...(theme.black ? { 30: theme.black } : {}),
      ...(theme.white ? { 37: theme.white } : {}),
      ...(theme.brightBlack ? { 90: theme.brightBlack } : {}),
      ...(theme.brightWhite ? { 97: theme.brightWhite } : {}),
    };
    const bgPalette: Record<number, string> = { ...baseBg };
    // Cap parse input: visible viewport only needs the tail; full flood
    // re-parsed per chunk is O(n) jank. 60k chars preserves scroll context.
    const capped = displayText.length > 60000 ? displayText.slice(-60000) : displayText;
    let parsed = parseAnsiToSpans(capped, theme.foreground, fgPalette, bgPalette);
    // Cap native <Text> count: thousands of spans stall the bridge.
    if (parsed.length > 1500) parsed = parsed.slice(-1500);
    return {
      spans: parsed,
      dynamicFontSize: {
        fontSize,
        lineHeight: Math.round(fontSize * 1.45),
      },
    };
  }, [displayText, theme, fontSize]);

  return (
    <Text style={[styles.baseText, dynamicFontSize, { color: theme.foreground }]}>
      {spans.map((span, index) => (
        <Text key={index} style={[styles.baseText, dynamicFontSize, span.style]}>
          {span.text}
        </Text>
      ))}
      {isFocused && (
        <Text style={[styles.cursor, dynamicFontSize, { color: theme.cursor }]}>
          █
        </Text>
      )}
    </Text>
  );
});

const styles = StyleSheet.create({
  baseText: {
    fontFamily: "monospace",
  },
  cursor: {
    fontFamily: "monospace",
  },
});

