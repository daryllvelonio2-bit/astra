/**
 * READMEs are half-Markdown, half-raw HTML: badge strips live in
 * `<div align="center">` with `<a><img></a>` children, `<br>` between lines,
 * `<kbd>`/`<strong>` inline. GitHub renders that HTML invisibly; a text
 * renderer must convert it to markdown tokens or the tags show up as noise.
 * This module rewrites HTML into markdown equivalents BEFORE parsing,
 * keeping structural tags (div/p/section/center/details/summary) intact —
 * the parser turns those into centered/collapsible blocks.
 */

const KEEP_STRUCTURAL = /^(div|p|section|center|details|summary)$/i;

/** Pull src/alt/width out of a raw <img> attribute string. Width rides in
 *  the markdown title slot (`![a](u "w=50")`) so the parser can recover it. */
function imgAttrsToMd(attrs: string): string {
  const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] || "";
  const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] || "";
  const width = /\bwidth\s*=\s*["']?(\d+)/i.exec(attrs)?.[1];
  if (!src) return "";
  return `![${alt}](${src}${width ? ` "w=${width}"` : ""})`;
}

export function normalizeReadmeHtml(src: string): string {
  let s = src.replace(/<!--[\s\S]*?-->/g, "");

  // <a href="L"><img ...></a> -> [![alt](img)](L)  (linked badge)
  s = s.replace(
    /<a\s+[^>]*href=["']([^"']*)["'][^>]*>\s*<img\s+([^>]*?)\/?>\s*<\/a>/gi,
    (_m, href, attrs) => `[${imgAttrsToMd(attrs)}](${href})`
  );
  // remaining <img ...> -> ![alt](src)
  s = s.replace(/<img\s+([^>]*?)\/?>/gi, (_m, attrs) => imgAttrsToMd(attrs));
  // <a href="u">text</a> -> [text](u)
  s = s.replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");

  // block-ish tags with markdown equivalents
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, n, t) => `\n${"#".repeat(Number(n))} ${t.trim()}\n`);
  s = s.replace(/<(strong|b)\s*>/gi, "**").replace(/<\/(strong|b)\s*>/gi, "**");
  s = s.replace(/<(em|i)\s*>/gi, "*").replace(/<\/(em|i)\s*>/gi, "*");
  s = s.replace(/<(del|s|strike|ins)\s*>/gi, "~~").replace(/<\/(del|s|strike|ins)\s*>/gi, "~~");
  s = s.replace(/<(code|kbd|samp|tt)\s*>/gi, "`").replace(/<\/(code|kbd|samp|tt)\s*>/gi, "`");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<hr[^>]*>/gi, "\n---\n");

  // strip every other tag (tables, spans, svgs...) but keep structure for the parser
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^<>]*>/g, (m0, name: string) =>
    KEEP_STRUCTURAL.test(name) ? m0 : " "
  );

  // common entities
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
  return s;
}
