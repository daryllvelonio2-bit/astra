import React from "react";
import { Text, Image } from "react-native";
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
  | { type: "group"; align: "center"; children: MarkdownBlock[] }
  | { type: "details"; summary: string; children: MarkdownBlock[] };

const OPEN = /^<(p|div|center|details|summary)\b([^>]*)>/i;
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

/** Parse one line-range into blocks. Used recursively for containers. */
function parseBlocks(lines: string[], opts?: { align?: "center" }): MarkdownBlock[] {
  const out: MarkdownBlock[] = [];
  const align = opts?.align;
  let i = 0;

  const pushPara = (buf: string) => {
    const t = buf.trim();
    if (!t) return;
    const img = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/.exec(t);
    if (img && t === img[0]) {
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

/** Inline markdown -> React <Text> children (bold/italic/code/links/images). */
export function renderInline(text: string, theme: ThemeColors, key: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  const re = /(!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\))|(`[^`]+`)|(\*\*([^*_]+)\*\*)|(__([^_]+)__)|(~~([^~]+)~~)|(\*([^*\s][^*]*)\*)|(_([^_\s][^_]*)_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  const clean = (s: string) => s.replace(/\\([`*_~\[\]])/g, "$1");

  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(<Text key={`${key}-t${n++}`}>{clean(text.slice(last, m.index))}</Text>);
    if (m[1]) {
      const isImg = m[1].startsWith("!");
      const label = m[2];
      const url = m[3];
      const title = m[4];
      const w = /^w=(\d+)$/.exec(title || "")?.[1];
      if (isImg) {
        const width = w ? Number(w) : undefined;
        nodes.push(
          <Image
            key={`${key}-img${n++}`}
            source={{ uri: url }}
            style={
              width && width <= 200
                ? { width, height: Math.max(18, Math.min(48, Math.round(width * 0.24))) }
                : { width: "100%", height: 150 }
            }
            resizeMode="contain"
          />
        );
      } else {
        nodes.push(
          <Text
            key={`${key}-a${n++}`}
            style={{ color: theme.accent }}
            onPress={() => void WebBrowser.openBrowserAsync(url.startsWith("http") ? url : `https://${url}`)}
          >
            {label || url}
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
  if (last < text.length) nodes.push(<Text key={`${key}-t${n++}`}>{clean(text.slice(last))}</Text>);
  return nodes;
}
