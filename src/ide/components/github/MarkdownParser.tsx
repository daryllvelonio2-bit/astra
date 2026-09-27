import React from "react";
import { View, Text, Image, ImageStyle, StyleProp } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { ThemeColors } from "../../../theme/themeContext";

/**
 * README renderer — no native deps. HTML is first normalized to markdown
 * (markdownHtml.ts), then parsed block-by-block: headings, paragraphs,
 * lists, quotes, code, hr, tables, images; plus the structural containers
 * GitHub READMEs lean on: <div align=center> / <center> (centered group),
 * <details>/<summary> (collapsible). Line-by-line, one pass.
 */

export type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "para"; text: string; align?: "center" }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "code"; lang: string; text: string }
  | { type: "hr" }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "img"; alt: string; src: string; width?: number; align?: "center" }
  | { type: "row"; items: { src: string; width?: number }[] }
  | { type: "group"; align: "center"; children: MarkdownBlock[] }
  | { type: "details"; summary: string; children: MarkdownBlock[] };

const OPEN = /^<(p|div|center)\b([^>]*)>/i;
const CLOSE = /^<\/(p|div|center|details|summary)>/i;
const ALIGNED_OPEN = /^<(p|div|center)\b[^>]*align\s*=\s*["']?center["']?[^>]*>/i;

/** Peek at the rest of a container block: find its matching close (nesting-aware). */
function findClose(lines: string[], start: number, tag: string): number {
  let depth = 0;
  const openRe = new RegExp(`<${tag}\\b`, "i");
  const closeRe = new RegExp(`</${tag}>`, "i");
  for (let j = start; j < lines.length; j++) {
    const l = lines[j];
    depth += (l.match(openRe) || []).length;
    depth -= (l.match(closeRe) || []).length;
    if (depth <= 0 && closeRe.test(l)) return j;
  }
  return lines.length - 1;
}

export function parseMarkdown(src: string): MarkdownBlock[] {
  return parseBlocks(src.replace(/\r\n/g, "\n").split("\n"));
}

/** shields.io badge URLs carry their own text: /badge/LABEL-MESSAGE-COLOR.
 *  React Native cannot decode SVG, so draw the pill from the URL instead. */
const SHIELDS_NAMED: Record<string, string> = {
  blue: "#007ec6", brightgreen: "#44cc11", green: "#97ca00", orange: "#fe7d37",
  red: "#e05d44", yellow: "#dfb317", yellowgreen: "#a4a61d", blueviolet: "#8a2be2",
  lightgrey: "#9f9f9f", gray: "#555555", grey: "#555555", lightryellow: "#cccc33",
  critical: "#d63a3a", informationals: "#007ec6", inactive: "#9f9f9f",
};

export function parseShieldsBadge(
  uri: string
): { label: string; message: string; color: string; big: boolean } | null {
  const m = /img\.shields\.io\/badge\/([^?]+)(\?.*)?$/i.exec(uri);
  if (!m) return null;
  const big = /style=(?:for-the-badge|social)/.test(m[2] || "");
  const segs = m[1]
    .replace(/--/g, "\u0002")
    .split("-")
    .map((s) => decodeURIComponent(s.replace(/\u0002/g, "-")).replace(/_/g, " "));
  if (segs.length < 2) return null;
  const label = segs[0];
  const rawColor = segs[segs.length - 1];
  const message = segs.slice(1, segs.length - 1).join("-") || " ";
  let color = /^[\da-f]{3,6}$/i.test(rawColor) ? `#${rawColor}` : SHIELDS_NAMED[rawColor.toLowerCase()] || "#4c1";
  if (segs.length < 3) {
    // label-only badge: single pill
    return { label: "", message: label, color, big };
  }
  return { label, message, color, big };
}

/** A drawn badge pill (matches shields.io styling closely enough). */
export function BadgePill({
  uri,
}: {
  uri: string;
}) {
  const b = parseShieldsBadge(uri);
  if (!b) return null;
  const h = b.big ? 26 : 20;
  const fs = b.big ? 11 : 9.5;
  return (
    <View style={{ flexDirection: "row", alignSelf: "center", overflow: "hidden", borderRadius: b.big ? 4 : 3, height: h, margin: 2 }}>
      {!!b.label && (
        <Text style={{ backgroundColor: "#555", color: "#fff", fontSize: fs, fontWeight: "700", paddingHorizontal: b.big ? 8 : 6, lineHeight: h + 2 }}>
          {b.label}
        </Text>
      )}
      <Text style={{ backgroundColor: b.color, color: "#fff", fontSize: fs, fontWeight: "700", paddingHorizontal: b.big ? 8 : 6, lineHeight: h + 2 }}>
        {b.message}
      </Text>
    </View>
  );
}

/** <Image> that renders nothing on load failure (RN cannot decode SVG —
 *  shields.io badges are SVG by default; a broken-image box is worse than
 *  blank space). */
export function SafeImage({
  uri,
  style,
}: {
  uri: string;
  style?: StyleProp<ImageStyle>;
}) {
  const [failed, setFailed] = React.useState(false);
  if (!uri || !/^https?:/i.test(uri)) return null;
  if (parseShieldsBadge(uri)) return <BadgePill uri={uri} />;
  if (failed) return null;
  return <Image source={{ uri }} style={style} resizeMode="contain" onError={() => setFailed(true)} />;
}

/** Parse one line-range into blocks. Used recursively for containers. */
function parseBlocks(lines: string[], opts?: { align?: "center" }): MarkdownBlock[] {
  const out: MarkdownBlock[] = [];
  const align = opts?.align;
  let i = 0;

  const pushPara = (buf: string) => {
    const t = buf.trim();
    if (!t) return;
    const IMG_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
    const tokens = t.match(IMG_RE);
    const rest = t.replace(IMG_RE, "").trim();
    if (tokens && tokens.length > 1 && !rest) {
      // badge row: images side by side, wrapping like GitHub
      const items = tokens.map((tok) => {
        const g = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/.exec(tok)!;
        const w = /^w=(\d+)$/.exec(g[3] || "")?.[1];
        return { src: g[2], width: w ? Number(w) : undefined };
      });
      out.push({ type: "row", items });
      return;
    }
    const img = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/.exec(t);
    if (img) {
      const w = /^w=(\d+)$/.exec(img[3] || "")?.[1];
      out.push({ type: "img", alt: img[1], src: img[2], width: w ? Number(w) : undefined, align });
    } else {
      out.push({ type: "para", text: t, align });
    }
  };

  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) {
      i++;
      continue;
    }
    // orphan closing tag (opener folded elsewhere) — never let it stall the loop
    if (CLOSE.test(line)) {
      i++;
      continue;
    }

    // structural container: <div align="center"> ... </div>  /  <center> / <p align=center>
    const ao = ALIGNED_OPEN.exec(line);
    if (ao) {
      const tag = ao[1].toLowerCase();
      const closeRe = new RegExp(`</${tag}>`, "i");
      if (closeRe.test(line)) {
        pushPara(line.replace(new RegExp(`</?${tag}\\b[^>]*>`, "gi"), " "));
        i++;
        continue;
      }
      const end = findClose(lines, i + 1, tag);
      const inner = lines.slice(i + 1, end);
      i = Math.max(end + 1, i + 1);
      out.push({ type: "group", align: "center", children: parseBlocks(inner, { align: "center" }) });
      continue;
    }
    // stray container (div/center/p without alignment) — fold into a paragraph
    const anyOpen = OPEN.exec(line);
    if (anyOpen) {
      const tag = anyOpen[1].toLowerCase();
      const closeRe = new RegExp(`</${tag}>`, "i");
      if (closeRe.test(line)) {
        pushPara(line.replace(new RegExp(`</?${tag}\\b[^>]*>`, "gi"), " "));
        i++;
        continue;
      }
      const end = findClose(lines, i + 1, tag);
      const inner = lines
        .slice(i + 1, end)
        .map((l) => l.replace(new RegExp(`</?${tag}\\b[^>]*>`, "gi"), " "));
      i = Math.max(end + 1, i + 1);
      pushPara(inner.join("\n"));
      continue;
    }
    // <details> collapsible
    if (/^<details\b/i.test(line)) {
      const end = findClose(lines, i, "details");
      const inner = lines.slice(i, end + 1).filter((l) => !/^<\/?details>/i.test(l.trim()));
      i = end + 1;
      let summary = "Details";
      const body: string[] = [];
      let inSum = false;
      for (const l of inner) {
        const t = l.trim();
        if (/^<summary>/i.test(t)) {
          inSum = true;
          const rest = t.replace(/^<summary>/i, "").replace(/<\/summary>$/i, "");
          if (rest && !/<\/summary>/i.test(t)) summary = rest;
          else if (/<\/summary>/i.test(t)) {
            summary = t.replace(/^<summary>/i, "").replace(/<\/summary>$/i, "");
            inSum = false;
          }
          continue;
        }
        if (inSum) {
          if (/<\/summary>/i.test(t)) {
            summary = (summary + " " + t.replace(/<\/summary>$/i, "")).trim();
            inSum = false;
          } else summary = (summary + " " + t).trim();
          continue;
        }
        body.push(l);
      }
      out.push({ type: "details", summary, children: parseBlocks(body) });
      continue;
    }
    if (/^<\/?summary>/i.test(line)) {
      i++;
      continue;
    }

    // fenced code
    const fence = /^\s*(```|~~~)\s*([^\s`]*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s*${fence[1]}`).test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++;
      out.push({ type: "code", lang: fence[2], text: body.join("\n") });
      continue;
    }

    // heading
    const head = /^(#{1,6})\s+(.*)$/.exec(line);
    if (head) {
      out.push({ type: "heading", level: head[1].length, text: head[2].trim().replace(/#+\s*$/, "") });
      i++;
      continue;
    }

    // hr
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      out.push({ type: "hr" });
      i++;
      continue;
    }

    // table
    if (line.includes("|") && i + 1 < lines.length && /^\|?[\s:|-]+\|?$/.test(lines[i + 1].trim()) && lines[i + 1].includes("-")) {
      const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      const header = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(cells(lines[i]));
        i++;
      }
      out.push({ type: "table", header, rows });
      continue;
    }

    // blockquote
    if (/^\s*>/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        q.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push({ type: "quote", lines: q });
      continue;
    }

    // lists
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (i < lines.length && (/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) || (lines[i].trim() && /^\s{2,}\S/.test(lines[i])))) {
        if (/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ""));
        else if (items.length) items[items.length - 1] += " " + lines[i].trim();
        i++;
        if (i < lines.length && !lines[i].trim() && i + 1 < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i + 1])) i++;
      }
      out.push({ type: ordered ? "ol" : "ul", items });
      continue;
    }

    // paragraph
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !ALIGNED_OPEN.test(lines[i]) &&
      !/^<\s*(\/)?(p\b|div|center|details|summary)/i.test(lines[i].trim()) &&
      !/^\s*(```|~~~)/.test(lines[i]) &&
      !/^(#{1,6})\s/.test(lines[i].trim()) &&
      !/^\s*>/.test(lines[i]) &&
      !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      buf.push(lines[i]);
      i++;
    }
    pushPara(buf.join("\n"));
  }
  return out;
}

/** Inline markdown -> React children: bold/italic/code/links, and inline
 *  images — including linked badges [![img](src)](href), which render as a
 *  tappable nested <Text><Image/></Text> (RN centers inline content). */
export function renderInline(text: string, theme: ThemeColors, key: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  const clean = (s: string) => s.replace(/\\([`*_~\[\]])/g, "$1");
  const inlineBadge = (uri: string, width: number | undefined, k: string) => {
    const b = parseShieldsBadge(uri);
    if (b) {
      // Text-only pill: nesting a View inside Text crashes RN
      const h = b.big ? 24 : 18;
      const fs = b.big ? 10.5 : 9;
      const pill = { fontSize: fs, fontWeight: "700" as const, color: "#fff", paddingHorizontal: 4 };
      return (
        <Text key={k}>
          {!!b.label && <Text style={{ ...pill, backgroundColor: "#555" }}>{b.label} </Text>}
          <Text style={{ ...pill, backgroundColor: b.color }}>{b.message}</Text>
          {" "}
        </Text>
      );
    }
    return (
      <Image
        key={k}
        source={{ uri }}
        style={width && width <= 240 ? { width, height: Math.max(16, Math.round(width * 0.22)) } : { width: "100%", height: 150 }}
        resizeMode="contain"
      />
    );
  };
  const badge = (uri: string, width: number | undefined, href?: string, k?: string) => {
    const img = inlineBadge(uri, width, k || "b");
    return href ? (
      <Text key={`${k}-w`} onPress={() => void WebBrowser.openBrowserAsync(href.startsWith("http") ? href : `https://${href}`)}>
        {img}
      </Text>
    ) : img;
  };

  // linked-badge -> sentinel, stashed so the plain-link regex never splits it
  const stashed: React.ReactNode[] = [];
  const scan = text.replace(
    /\[!\[([^\]]*)\]\(([^)\s]+)(?:\s+"w=(\d+)")?\)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    (_m, _alt, src, w, href) => {
      stashed.push(badge(src, w ? Number(w) : undefined, href, `lb${stashed.length}`));
      return `\u0001${stashed.length - 1}\u0001`;
    }
  );

  const re = /(!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\))|(`[^`]+`)|(\*\*([^*_]+)\*\*)|(__([^_]+)__)|(~~([^~]+)~~)|(\*([^*\s][^*]*)\*)|(_([^_\s][^_]*)_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;

  const pushText = (chunk: string) => {
    // split sentinel out of plain text runs
    const parts = chunk.split(/\u0001(\d+)\u0001/);
    for (let k = 0; k < parts.length; k++) {
      if (k % 2 === 1) {
        nodes.push(stashed[Number(parts[k])]);
      } else if (parts[k]) {
        nodes.push(<Text key={`${key}-t${n++}`}>{clean(parts[k])}</Text>);
      }
    }
  };

  while ((m = re.exec(scan))) {
    if (m.index > last) pushText(scan.slice(last, m.index));
    if (m[1]) {
      const isImg = m[1].startsWith("!");
      const w = /^w=(\d+)$/.exec(m[4] || "")?.[1];
      if (isImg) {
        nodes.push(badge(m[3], w ? Number(w) : undefined, undefined, `im${n++}`));
      } else {
        nodes.push(
          <Text
            key={`${key}-a${n++}`}
            style={{ color: theme.accent }}
            onPress={() => void WebBrowser.openBrowserAsync(m[3].startsWith("http") ? m[3] : `https://${m[3]}`)}
          >
            {m[2] || m[3]}
          </Text>
        );
      }
    } else if (m[5]) {
      nodes.push(
        <Text key={`${key}-c${n++}`} style={{ fontFamily: "monospace", fontSize: 11.5, backgroundColor: "#8882", color: "#e88" }}>
          {m[5].slice(1, -1)}
        </Text>
      );
    } else if (m[6]) {
      nodes.push(<Text key={`${key}-b${n++}`} style={{ fontWeight: "700" }}>{clean(m[7])}</Text>);
    } else if (m[8]) {
      nodes.push(<Text key={`${key}-B${n++}`} style={{ fontWeight: "700" }}>{clean(m[9])}</Text>);
    } else if (m[10]) {
      nodes.push(<Text key={`${key}-s${n++}`} style={{ textDecorationLine: "line-through" }}>{clean(m[11])}</Text>);
    } else if (m[12]) {
      nodes.push(<Text key={`${key}-i${n++}`} style={{ fontStyle: "italic" }}>{clean(m[13])}</Text>);
    } else if (m[14]) {
      nodes.push(<Text key={`${key}-I${n++}`} style={{ fontStyle: "italic" }}>{clean(m[15])}</Text>);
    }
    last = m.index + m[0].length;
  }
  if (last < scan.length) pushText(scan.slice(last));
  return nodes;
}
