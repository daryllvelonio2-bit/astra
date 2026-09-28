/**
 * Serialize the RN ThemeColors into the shape __cmSetTheme expects.
 * (Extracted from CodeMirrorEditorView to keep the host under 500 lines.)
 */
export function buildCmThemeObj(theme: any): string {
  const obj = {
    isDark: theme.isDark !== false,
    bgPrimary: theme.bgPrimary || "",
    bgSecondary: theme.bgSecondary || "",
    textPrimary: theme.textPrimary || "",
    textMuted: theme.textMuted || "",
    accent: theme.accent || "",
    accentCyan: theme.accentCyan || "",
    accentPurple: theme.accentPurple || "",
    accentGold: theme.accentGold || "",
    accentGreen: theme.accentGreen || "",
    accentRed: theme.accentRed || "",
    tokens: theme.tokenColors
      ? {
          keyword:  theme.tokenColors.keyword  || "",
          comment:  theme.tokenColors.comment  || "",
          string:   theme.tokenColors.string   || "",
          number:   theme.tokenColors.number   || "",
          type:     theme.tokenColors.jsx_tag  || "",
          function: theme.tokenColors.function || "",
          operator: theme.tokenColors.operator || "",
          jsx_tag:  theme.tokenColors.jsx_tag  || "",
          property: theme.tokenColors.property || "",
          boolean:  theme.tokenColors.boolean  || "",
          plain:    theme.tokenColors.plain    || "",
        }
      : undefined,
  };
  return JSON.stringify(obj);
}
