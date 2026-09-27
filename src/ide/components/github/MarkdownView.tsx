import React, { useMemo } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useTheme, ThemeColors } from "../../../theme/themeContext";

/**
 * Minimal markdown renderer for repo READMEs — no native deps. Covers the
 * blocks GitHub READMEs actually use: headings, paragraphs, lists (ul/ol),
 * blockquotes, fenced + indented code, hr, tables, and images; inline:
 * bold, italic, strike, code spans, links. Line-by-line, not recursive,
 * so a 2000-line README costs one pass.
 */

export type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "para"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "code"; lang: string; text: string }
  | { type: "hr" }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "img"; alt: string; src: string };

export function parseMarkdown(src: string): MarkdownBlock[] {
  const out: MarkdownBlock[] = [];
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  let i = 0;

  const pushPara = (buf: string) => {
    const t = buf.trim();
    if (!t) return;
    const img = /^!\[([^\]]*)\]\(([^)\s]+)/.exec(t);
    if (img) out.push({ type: "img", alt: img[1], src: img[2] });
    else out.push({ type: "para", text: t });
  };

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
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
      i++; // closing fence (or EOF)
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
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push({ type: "hr" });
      i++;
      continue;
    }

    // table: header row + separator
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const cells = (row: string) => row.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
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

    // lists (one nesting level: nested items fold into the parent)
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (i < lines.length && (/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) || (lines[i].trim() && /^\s{2,}\S/.test(lines[i])))) {
        if (/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ""));
        else items[items.length - 1] += " " + lines[i].trim();
        i++;
        // blank line followed by another list item keeps going
        if (i < lines.length && !lines[i].trim() && i + 1 < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i + 1])) i++;
      }
      out.push({ type: ordered ? "ol" : "ul", items });
      continue;
    }

    // paragraph: fold plain lines until a blank line or a block starter
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*(```|~~~)/.test(lines[i]) &&
      !/^(#{1,6})\s/.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) &&
      !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    pushPara(buf.join("\n"));
  }
  return out;
}

/** Inline markdown -> React <Text> children (bold/italic/code/links). */
export function renderInline(text: string, theme: ThemeColors, key: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  // tokenize: link [t](u), image ![t](u), code `c`, bold **, italic *, strike ~~
  const re = /(!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\))|(`[^`]+`)|(\*\*([^*_]+)\*\*)|(__([^_]+)__)|(~~([^~]+)~~)|(\*([^*\s][^*]*)\*)|(_([^_\s][^_]*)_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  const clean = (s: string) => s.replace(/\\([`*_~\[\]])/g, "$1");

  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(<Text key={`${key}-t${n++}`}>{clean(text.slice(last, m.index))}</Text>);
    if (m[1]) {
      // link or image
      const isImg = m[1].startsWith("!");
      const label = m[2];
      const url = m[3];
      if (isImg) {
        nodes.push(
          <Image key={`${key}-img${n++}`} source={{ uri: url }} style={{ width: "100%", height: 160, resizeMode: "contain", marginVertical: 6 }} />
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
    } else if (m[4]) {
      nodes.push(
        <Text key={`${key}-c${n++}`} style={mdStyles.code}>
          {m[4].slice(1, -1)}
        </Text>
      );
    } else if (m[5]) {
      nodes.push(<Text key={`${key}-b${n++}`} style={{ fontWeight: "700" }}>{clean(m[6])}</Text>);
    } else if (m[7]) {
      nodes.push(<Text key={`${key}-B${n++}`} style={{ fontWeight: "700" }}>{clean(m[8])}</Text>);
    } else if (m[9]) {
      nodes.push(<Text key={`${key}-s${n++}`} style={{ textDecorationLine: "line-through" }}>{clean(m[10])}</Text>);
    } else if (m[11]) {
      nodes.push(<Text key={`${key}-i${n++}`} style={{ fontStyle: "italic" }}>{clean(m[12])}</Text>);
    } else if (m[13]) {
      nodes.push(<Text key={`${key}-I${n++}`} style={{ fontStyle: "italic" }}>{clean(m[14])}</Text>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(<Text key={`${key}-t${n++}`}>{clean(text.slice(last))}</Text>);
  return nodes;
}

export function MarkdownView({ source }: { source: string }) {
  const { theme } = useTheme();
  const blocks = useMemo(() => parseMarkdown(source), [source]);

  return (
    <View style={{ gap: 8 }}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading": {
            const size = [20, 17, 15, 13.5, 12.5, 12][b.level - 1];
            return (
              <View key={i} style={b.level <= 2 ? mdStyles.hRule : undefined}>
                <Text style={{ color: theme.textPrimary, fontSize: size, fontWeight: "700", paddingTop: b.level <= 2 ? 4 : 0 }}>
                  {renderInline(b.text, theme, `h${i}`)}
                </Text>
              </View>
            );
          }
          case "para":
            return (
              <Text key={i} style={{ color: theme.textSecondary, fontSize: 12.5, lineHeight: 18 }}>
                {renderInline(b.text, theme, `p${i}`)}
              </Text>
            );
          case "ul":
          case "ol":
            return (
              <View key={i} style={{ gap: 3 }}>
                {b.items.map((item, j) => (
                  <View key={j} style={mdStyles.listRow}>
                    <Text style={{ color: theme.textMuted, fontSize: 12.5 }}>{b.type === "ol" ? `${j + 1}.` : "•"}</Text>
                    <Text style={{ flex: 1, color: theme.textSecondary, fontSize: 12.5, lineHeight: 18 }}>
                      {renderInline(item, theme, `li${i}-${j}`)}
                    </Text>
                  </View>
                ))}
              </View>
            );
          case "quote":
            return (
              <View key={i} style={[mdStyles.quote, { borderLeftColor: theme.accent }]}>
                {b.lines.map((l, j) => (
                  <Text key={j} style={{ color: theme.textMuted, fontSize: 12, lineHeight: 17 }}>
                    {renderInline(l, theme, `q${i}-${j}`)}
                  </Text>
                ))}
              </View>
            );
          case "code":
            return (
              <View key={i} style={[mdStyles.codeBlock, { backgroundColor: theme.bgTertiary }]}>
                <Text style={{ color: theme.textPrimary, fontFamily: "monospace", fontSize: 11, lineHeight: 16 }}>
                  {b.text || " "}
                </Text>
              </View>
            );
          case "hr":
            return <View key={i} style={[mdStyles.hr, { backgroundColor: theme.border }]} />;
          case "img":
            return (
              <View key={i}>
                <Image source={{ uri: b.src }} style={mdStyles.image} resizeMode="contain" />
                {!!b.alt && <Text style={{ color: theme.textMuted, fontSize: 10 }}>{b.alt}</Text>}
              </View>
            );
          case "table":
            return (
              <View key={i} style={[mdStyles.table, { borderColor: theme.border }]}>
                <View style={mdStyles.tableRow}>
                  {b.header.map((c, j) => (
                    <Text key={j} style={[mdStyles.tableCell, { color: theme.textPrimary, fontWeight: "700" }]}>
                      {renderInline(c, theme, `th${i}-${j}`)}
                    </Text>
                  ))}
                </View>
                {b.rows.map((row, r) => (
                  <View key={r} style={[mdStyles.tableRow, { borderTopColor: theme.border }]}>
                    {b.header.map((_, c) => (
                      <Text key={c} style={[mdStyles.tableCell, { color: theme.textSecondary }]}>
                        {renderInline(row[c] || "", theme, `td${i}-${r}-${c}`)}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            );
        }
      })}
    </View>
  );
}

const mdStyles = StyleSheet.create({
  hRule: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#8884", paddingBottom: 4 },
  listRow: { flexDirection: "row", gap: 8, paddingLeft: 4 },
  quote: { borderLeftWidth: 3, paddingLeft: 10, gap: 2 },
  code: { fontFamily: "monospace", fontSize: 11.5, backgroundColor: "#8882", color: "#e88" },
  codeBlock: { borderRadius: 8, padding: 10 },
  hr: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
  image: { width: "100%", height: 180, borderRadius: 8, marginVertical: 4, backgroundColor: "#8881" },
  table: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, overflow: "hidden" },
  tableRow: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth },
  tableCell: { flex: 1, fontSize: 11, padding: 6 },
});
