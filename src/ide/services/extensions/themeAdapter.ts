import { TokenType, TOKEN_COLORS_DARK, TOKEN_COLORS_LIGHT } from "../syntaxTokenizer";
import type { ThemeColors } from "../../../theme/themeContext";

function normalizeHex(hex?: string): string | undefined {
  if (!hex || typeof hex !== "string") return undefined;
  const trimmed = hex.trim();
  if (!trimmed.startsWith("#")) return undefined;
  return trimmed;
}

function pickFirstColor(colors: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    const val = normalizeHex(colors[k]);
    if (val) return val;
  }
  return undefined;
}

/**
 * Parses VS Code TextMate token colors into Astra's TokenType palette.
 */
export function extractSyntaxTokenColors(
  tokenColors: any[],
  isDark: boolean
): Record<TokenType, string> {
  const base = isDark ? { ...TOKEN_COLORS_DARK } : { ...TOKEN_COLORS_LIGHT };
  if (!Array.isArray(tokenColors)) return base;

  for (const rule of tokenColors) {
    if (!rule || !rule.settings || !rule.settings.foreground) continue;
    const fg = normalizeHex(rule.settings.foreground);
    if (!fg) continue;

    const rawScopes = rule.scope;
    if (!rawScopes) {
      base.plain = fg;
      continue;
    }

    const scopes: string[] = Array.isArray(rawScopes)
      ? rawScopes
      : typeof rawScopes === "string"
      ? rawScopes.split(",").map((s) => s.trim())
      : [];

    for (const scope of scopes) {
      const s = scope.toLowerCase();

      if (s.includes("comment")) {
        base.comment = fg;
      } else if (s.includes("string")) {
        base.string = fg;
      } else if (s.includes("keyword") || s.includes("storage")) {
        base.keyword = fg;
      } else if (
        s.includes("entity.name.function") ||
        s.includes("support.function") ||
        s.includes("meta.function-call") ||
        s.includes("variable.function")
      ) {
        base.function = fg;
      } else if (
        s.includes("entity.name.tag") ||
        s.includes("support.class") ||
        s.includes("entity.name.type") ||
        s.includes("support.type")
      ) {
        base.jsx_tag = fg;
      } else if (s.includes("constant.numeric") || s.includes("number")) {
        base.number = fg;
      } else if (
        s.includes("property") ||
        s.includes("support.type.property-name") ||
        s.includes("variable.object.property")
      ) {
        base.property = fg;
      } else if (s.includes("constant.language.boolean") || s.includes("constant.language")) {
        base.boolean = fg;
      } else if (s.includes("operator") || s.includes("punctuation.accessor")) {
        base.operator = fg;
      }
    }
  }

  return base;
}

/**
 * Checks whether a color is dark by calculating perceived luminance.
 */
function isColorDark(hex: string): boolean {
  const clean = hex.replace("#", "");
  if (clean.length < 6) return true;
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  // Perceived luminance formula (ITU-R BT.709)
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.5;
}

/**
 * Converts a VS Code theme JSON object into an Astra ThemeColors instance.
 */
export function convertVsCodeThemeToThemeColors(
  themeId: string,
  themeLabel: string,
  themeData: any,
  uiTheme?: string
): ThemeColors {
  const colors: Record<string, string> = themeData?.colors || {};

  // Infer dark vs light
  let isDark = true;
  if (themeData?.type === "light" || uiTheme === "vs") {
    isDark = false;
  } else if (themeData?.type === "dark" || uiTheme === "vs-dark") {
    isDark = true;
  } else {
    const bgCheck = colors["editor.background"] || colors["sideBar.background"];
    if (bgCheck) {
      isDark = isColorDark(bgCheck);
    }
  }

  const bgPrimary =
    pickFirstColor(colors, ["editor.background", "sideBar.background"]) ||
    (isDark ? "#0d1117" : "#ffffff");

  const bgSecondary =
    pickFirstColor(colors, ["sideBar.background", "editorGroupHeader.tabsBackground", "titleBar.activeBackground"]) ||
    (isDark ? "#010409" : "#f6f8fa");

  const bgTertiary =
    pickFirstColor(colors, ["activityBar.background", "statusBar.background", "panel.background"]) ||
    (isDark ? "#161b22" : "#eaeef2");

  const bgElevated =
    pickFirstColor(colors, [
      "dropdown.background",
      "quickInput.background",
      "editorWidget.background",
      "menu.background",
    ]) || (isDark ? "#161b22" : "#ffffff");

  const bgInput =
    pickFirstColor(colors, ["input.background", "inputValidation.infoBackground"]) ||
    (isDark ? "#0d1117" : "#ffffff");

  const border =
    pickFirstColor(colors, [
      "sideBar.border",
      "panel.border",
      "editorGroup.border",
      "titleBar.border",
      "checkbox.border",
      "dropdown.border",
    ]) || (isDark ? "#30363d" : "#e1e4e8");

  const borderLight =
    pickFirstColor(colors, ["focusBorder", "input.border", "editorIndentGuide.background"]) ||
    (isDark ? "#30363d" : "#cbd5e1");

  const textPrimary =
    pickFirstColor(colors, ["editor.foreground", "foreground", "sideBar.foreground"]) ||
    (isDark ? "#e6edf3" : "#1f2328");

  const textSecondary =
    pickFirstColor(colors, ["descriptionForeground", "sideBarTitle.foreground", "statusBar.foreground"]) ||
    (isDark ? "#7d8590" : "#57606a");

  const textMuted =
    pickFirstColor(colors, ["editorLineNumber.foreground", "disabledForeground"]) ||
    (isDark ? "#6e7681" : "#8c959f");

  const accent =
    pickFirstColor(colors, [
      "focusBorder",
      "activityBar.activeBorder",
      "badge.background",
      "progressBar.background",
      "button.background",
      "textLink.foreground",
    ]) || (isDark ? "#2f81f7" : "#0969da");

  const accentCyan = pickFirstColor(colors, ["terminal.ansiCyan"]) || (isDark ? "#38bdf8" : "#0284c7");
  const accentPurple = pickFirstColor(colors, ["terminal.ansiMagenta"]) || (isDark ? "#c084fc" : "#7c3aed");
  const accentGold = pickFirstColor(colors, ["terminal.ansiYellow"]) || (isDark ? "#fdd663" : "#d97706");
  const accentGreen =
    pickFirstColor(colors, ["button.background", "terminal.ansiGreen", "activityBarBadge.background"]) ||
    (isDark ? "#2ea043" : "#1a7f37");
  const accentRed =
    pickFirstColor(colors, ["errorForeground", "terminal.ansiRed", "notificationsErrorIcon.foreground"]) ||
    (isDark ? "#f85149" : "#cf222e");

  const tokenColors = extractSyntaxTokenColors(themeData?.tokenColors, isDark);
  if (textPrimary && (!tokenColors.plain || tokenColors.plain === (isDark ? TOKEN_COLORS_DARK.plain : TOKEN_COLORS_LIGHT.plain))) {
    tokenColors.plain = textPrimary;
  }

  return {
    id: themeId,
    name: themeLabel || themeData?.name || "Extension Theme",
    isDark,
    bgPrimary,
    bgSecondary,
    bgTertiary,
    bgElevated,
    bgInput,
    border,
    borderLight,
    borderGlow: `${accent}40`,
    textPrimary,
    textSecondary,
    textMuted,
    accent,
    accentCyan,
    accentPurple,
    accentGold,
    accentGreen,
    accentRed,
    bubbleUser: accent,
    bubbleUserText: "#ffffff",
    bubbleAssistant: bgSecondary,
    bubbleAssistantBorder: border,
    sendButtonBg: accent,
    sendButtonIcon: "#ffffff",
    statusPillBg: bgElevated,
    statusPillBorder: border,
    cardBg: bgSecondary,
    overlay: isDark ? "rgba(0, 0, 0, 0.65)" : "rgba(15, 23, 42, 0.45)",
    tokenColors,
  };
}
