/**
 * Single import surface for the template row marks.
 *
 * The New Project picker adopts this with one line:
 *   import { TemplateLogo } from "./projectIcons";
 * and replaces its MaterialCommunityIcons glyph with:
 *   <TemplateLogo id={t.id} size={22} theme={theme}
 *     color={isSelected ? theme.accent : theme.textSecondary} />
 */
export { TemplateLogo, hasBrandMark, BRAND_PATHS } from "./templateLogos";
export type { TemplateLogoProps, BrandMark } from "./templateLogos";
