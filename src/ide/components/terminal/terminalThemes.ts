import { ThemeColors } from "../../../theme/themeContext";

export interface TerminalTheme {
  id: string;
  name: string;
  isDark?: boolean;
  background: string;
  foreground: string;
  cursor: string;
  promptUser: string;
  promptPath: string;
  cardBg: string;
  borderColor: string;
  accent: string;
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
}

/**
 * Dynamically converts the active global ThemeColors from useTheme() into
 * a TerminalTheme, guaranteeing zero hardcoded colors and strict adherence to
 * the user's global theme selection.
 */
export function themeToTerminalTheme(theme: ThemeColors): TerminalTheme {
  const isLight = !theme.isDark;
  return {
    id: theme.id,
    name: theme.name,
    isDark: theme.isDark,
    background: theme.bgPrimary,
    foreground: theme.textPrimary,
    cursor: theme.accent,
    promptUser: theme.accentGreen,
    promptPath: theme.accentCyan || theme.accent,
    cardBg: theme.bgSecondary,
    borderColor: theme.border,
    accent: theme.accent,
    black: isLight ? "#1e293b" : "#484f58",
    red: theme.accentRed,
    green: theme.accentGreen,
    yellow: theme.accentGold,
    blue: theme.accent,
    magenta: theme.accentPurple,
    cyan: theme.accentCyan,
    white: theme.textPrimary,
    brightBlack: theme.textSecondary,
    brightRed: theme.accentRed,
    brightGreen: theme.accentGreen,
    brightYellow: theme.accentGold,
    brightBlue: theme.accent,
    brightMagenta: theme.accentPurple,
    brightCyan: theme.accentCyan,
    brightWhite: isLight ? theme.textPrimary : "#ffffff",
  };
}

/**
 * Dynamically generates full 16-color ANSI options for xterm.js directly
 * from the active global theme colors (or TerminalTheme wrapper).
 */
export function getXtermTheme(theme: ThemeColors | TerminalTheme): Record<string, string> {
  if ("bgPrimary" in theme) {
    const t = theme as ThemeColors;
    const isLight = !t.isDark;
    return {
      background: t.bgPrimary,
      foreground: t.textPrimary,
      cursor: t.accent,
      cursorAccent: t.bgPrimary,
      selectionBackground: isLight ? "#bfdbfe" : `${t.accent}40`,
      selectionForeground: t.textPrimary,
      black: isLight ? "#1e293b" : "#484f58",
      red: t.accentRed,
      green: t.accentGreen,
      yellow: t.accentGold,
      blue: t.accent,
      magenta: t.accentPurple,
      cyan: t.accentCyan,
      white: t.textPrimary,
      brightBlack: t.textSecondary,
      brightRed: t.accentRed,
      brightGreen: t.accentGreen,
      brightYellow: t.accentGold,
      brightBlue: t.accent,
      brightMagenta: t.accentPurple,
      brightCyan: t.accentCyan,
      brightWhite: isLight ? t.textPrimary : "#ffffff",
    };
  }

  const tt = theme as TerminalTheme;
  const isLight = tt.isDark === false || tt.id === "light";
  return {
    background: tt.background,
    foreground: tt.foreground,
    cursor: tt.cursor,
    cursorAccent: tt.background,
    selectionBackground: isLight ? "#bfdbfe" : `${tt.accent}40`,
    selectionForeground: tt.foreground,
    black: tt.black || (isLight ? "#1e293b" : tt.cardBg),
    red: tt.red || (isLight ? "#cf222e" : "#ff7b72"),
    green: tt.green || (isLight ? "#116329" : "#3fb950"),
    yellow: tt.yellow || (isLight ? "#9e6a03" : "#d29922"),
    blue: tt.blue || (isLight ? "#0969da" : tt.accent),
    magenta: tt.magenta || (isLight ? "#8250df" : "#bc8cff"),
    cyan: tt.cyan || (isLight ? "#1b7c83" : "#39c5cf"),
    white: tt.white || tt.foreground,
    brightBlack: tt.brightBlack || (isLight ? "#57606a" : "#6e7681"),
    brightRed: tt.brightRed || (isLight ? "#a40e26" : "#ffa198"),
    brightGreen: tt.brightGreen || (isLight ? "#1a7f37" : "#56d364"),
    brightYellow: tt.brightYellow || (isLight ? "#633c01" : "#e3b341"),
    brightBlue: tt.brightBlue || (isLight ? "#218bff" : "#79c0ff"),
    brightMagenta: tt.brightMagenta || (isLight ? "#a475f9" : "#d2a8ff"),
    brightCyan: tt.brightCyan || (isLight ? "#3192aa" : "#56d4dd"),
    brightWhite: tt.brightWhite || (isLight ? tt.foreground : "#ffffff"),
  };
}
