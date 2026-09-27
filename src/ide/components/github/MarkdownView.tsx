import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "../../../theme/themeContext";
import { normalizeReadmeHtml } from "./markdownHtml";
import { MarkdownBlock, parseMarkdown, renderInline, SafeImage } from "./MarkdownParser";

/**
 * Renders a GitHub README: normalizes HTML (div-align, raw img/kbd/br) into
 * markdown blocks, then lays them out. Centered groups for badge strips,
 * collapsible <details>, width-sized images, and horizontal badge rows.
 */

function badgeHeight(w: number): number {
  return Math.max(18, Math.min(48, Math.round(w * 0.24)));
}

function ImageBlock({
  src,
  width,
  align,
}: {
  src: string;
  width?: number;
  align?: "center";
}) {
  return (
    <SafeImage
      uri={src}
      style={[
        width && width <= 200
          ? { width, height: badgeHeight(width) }
          : { width: "100%", height: 160 },
        mdStyles.image,
        align === "center" && { alignSelf: "center" },
      ]}
    />
  );
}

function Collapsible({ summary, children }: { summary: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={[mdStyles.details, { borderColor: theme.border }]}>
      <TouchableOpacity onPress={() => setOpen((o) => !o)} activeOpacity={0.7} style={mdStyles.summaryRow}>
        <Text style={{ color: theme.textMuted, fontSize: 11 }}>{open ? "▾" : "▸"}</Text>
        <Text style={{ color: theme.accent, fontSize: 12.5, fontWeight: "600", flex: 1 }}>
          {renderInline(summary, theme, "sum")}
        </Text>
      </TouchableOpacity>
      {open && <View style={{ gap: 8, paddingTop: 8 }}>{children}</View>}
    </View>
  );
}

function BlockList({ blocks, align }: { blocks: MarkdownBlock[]; align?: "center" }) {
  const { theme } = useTheme();

  return (
    <View style={{ gap: 8 }}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading": {
            const size = [20, 17, 15, 13.5, 12.5, 12][b.level - 1];
            return (
              <View key={i} style={[b.level <= 2 && mdStyles.hRule, align === "center" && { alignSelf: "center" }]}>
                <Text
                  style={{
                    color: theme.textPrimary,
                    fontSize: size,
                    fontWeight: "700",
                    paddingTop: b.level <= 2 ? 4 : 0,
                    textAlign: align,
                  }}
                >
                  {renderInline(b.text, theme, `h${i}`)}
                </Text>
              </View>
            );
          }
          case "para":
            return (
              <Text key={i} style={{ color: theme.textSecondary, fontSize: 12.5, lineHeight: 18, textAlign: b.align || align }}>
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
            return <ImageBlock key={i} src={b.src} width={b.width} align={b.align || align} />;
          case "row":
            return (
              <View key={i} style={mdStyles.badgeRow}>
                {b.items.map((im, j) => (
                  <ImageBlock key={j} src={im.src} width={im.width} />
                ))}
              </View>
            );
          case "group":
            return (
              <View key={i} style={{ alignItems: "center" }}>
                <BlockList blocks={b.children} align="center" />
              </View>
            );
          case "details":
            return (
              <Collapsible key={i} summary={b.summary}>
                <BlockList blocks={b.children} />
              </Collapsible>
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

export function MarkdownView({ source }: { source: string }) {
  const blocks = useMemo(() => parseMarkdown(normalizeReadmeHtml(source)), [source]);
  return <BlockList blocks={blocks} />;
}

const mdStyles = StyleSheet.create({
  hRule: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#8884", paddingBottom: 4 },
  listRow: { flexDirection: "row", gap: 8, paddingLeft: 4 },
  quote: { borderLeftWidth: 3, paddingLeft: 10, gap: 2 },
  codeBlock: { borderRadius: 8, padding: 10 },
  hr: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
  image: { borderRadius: 4, marginVertical: 2, backgroundColor: "#8881" },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 4 },
  details: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  table: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, overflow: "hidden" },
  tableRow: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth },
  tableCell: { flex: 1, fontSize: 11, padding: 6 },
});
