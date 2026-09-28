import React, { useMemo, useRef, useState } from "react";
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { fetchContributionCalendar } from "../../services/gitHubAccountService";
import { ContribCalendar } from "../../services/gitHubTypes";
import { useGitHubResource } from "./useGitHubResource";
import { ContribCell, CELL, GAP, ROWS, SKY, gridWidth } from "./contribPlan";
import { useContribAnimation } from "./useContribAnimation";
import { ContribAnimOverlay } from "./ContribAnimOverlay";

interface DaySlot {
  key: string;
  date: string;
  color: string;
  count: number;
}

interface SelectedDay {
  key: string;
  date: string;
  count: number;
  color: string;
}

interface ColorTier {
  color: string;
  min: number;
  max: number;
  count: number;
}

function formatContribDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(`${dateStr}T00:00:00Z`);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return dateStr;
  }
}

function formatContribCount(count: number): string {
  if (count === 0) return "No contributions";
  if (count === 1) return "1 contribution";
  return `${count.toLocaleString()} contributions`;
}

/**
 * Interactive year contributions graph (GitHub's green squares):
 * - Total contributions header + interactive inspection of any square or color level.
 * - Clicking a square highlights it and reveals its exact count and date.
 * - Clicking a palette tier in the legend highlights all matching days and displays its range.
 * - Preserves background animations (snake/plane) through non-blocking overlays.
 */
export function GitHubContribGraph({ login }: { login: string }) {
  const { theme } = useTheme();
  const cal = useGitHubResource<ContribCalendar>(() => fetchContributionCalendar(login), [login]);
  const data = cal.data;
  const scrollRef = useRef<ScrollView>(null);

  const [selectedDay, setSelectedDay] = useState<SelectedDay | null>(null);
  const [selectedColor, setSelectedColor] = useState<ColorTier | null>(null);

  const emptyTrack = theme.bgTertiary;

  const columns = useMemo(() => {
    if (!data) return [];
    return data.weeks.map((days, wi) => {
      const slots: (DaySlot | null)[] = new Array(ROWS).fill(null);
      days.forEach((d) => {
        let wd = 0;
        try {
          wd = new Date(`${d.date}T00:00:00Z`).getUTCDay();
        } catch (_) {
          wd = 0;
        }
        slots[wd >= 0 && wd < ROWS ? wd : 0] = {
          key: d.date || `${wi}-${wd}`,
          date: d.date || "",
          color: d.color,
          count: d.count,
        };
      });
      return slots;
    });
  }, [data]);

  const palette = useMemo(() => {
    if (!data) return [];
    const colorMap = new Map<string, ColorTier>();
    data.weeks.forEach((w) => {
      w.forEach((d) => {
        if (!d.color) return;
        const existing = colorMap.get(d.color);
        if (existing) {
          existing.min = Math.min(existing.min, d.count);
          existing.max = Math.max(existing.max, d.count);
          existing.count += 1;
        } else {
          colorMap.set(d.color, { color: d.color, min: d.count, max: d.count, count: 1 });
        }
      });
    });
    return Array.from(colorMap.values()).sort((a, b) => a.min - b.min);
  }, [data]);

  const alive = useMemo(() => {
    const squares: ContribCell[] = [];
    columns.forEach((slots, col) => {
      slots.forEach((slot, row) => {
        if (slot && slot.count > 0) squares.push({ key: slot.key, col, row, color: slot.color });
      });
    });
    return squares;
  }, [columns]);

  const anim = useContribAnimation(alive, columns.length);

  if (cal.error && !data) return null;
  if (!data) {
    return <View style={[styles.placeholder, { backgroundColor: theme.bgSecondary }]} />;
  }

  return (
    <View style={styles.wrap}>
      {/* Interactive header inspection banner */}
      <View style={styles.header}>
        {selectedDay ? (
          <View style={styles.activeRow}>
            <View
              style={[
                styles.swatch,
                {
                  backgroundColor: selectedDay.count > 0 ? selectedDay.color : emptyTrack,
                  borderColor: theme.border,
                },
              ]}
            />
            <View style={styles.activeTextWrap}>
              <Text style={[styles.activeTitle, { color: theme.textPrimary }]}>
                {formatContribCount(selectedDay.count)}
              </Text>
              <Text style={[styles.activeSubtitle, { color: theme.textSecondary }]}>
                {formatContribDate(selectedDay.date)}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.dismissBtn, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}
              onPress={() => setSelectedDay(null)}
              activeOpacity={0.7}
              accessibilityLabel="Clear selection"
            >
              <Octicons name="x" size={12} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        ) : selectedColor ? (
          <View style={styles.activeRow}>
            <View
              style={[
                styles.swatch,
                {
                  backgroundColor: selectedColor.min === 0 ? emptyTrack : selectedColor.color,
                  borderColor: theme.border,
                },
              ]}
            />
            <View style={styles.activeTextWrap}>
              <Text style={[styles.activeTitle, { color: theme.textPrimary }]}>
                {selectedColor.min === 0 && selectedColor.max === 0
                  ? "0 contributions"
                  : selectedColor.min === selectedColor.max
                  ? formatContribCount(selectedColor.min)
                  : `${selectedColor.min}–${selectedColor.max} contributions`}
              </Text>
              <Text style={[styles.activeSubtitle, { color: theme.textSecondary }]}>
                {selectedColor.count} day{selectedColor.count === 1 ? "" : "s"} at this level
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.dismissBtn, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}
              onPress={() => setSelectedColor(null)}
              activeOpacity={0.7}
              accessibilityLabel="Clear selection"
            >
              <Octicons name="x" size={12} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.defaultHeader}>
            <Text style={[styles.total, { color: theme.textPrimary }]}>
              {data.total.toLocaleString()} contributions in the last year
            </Text>
            <Text style={[styles.hint, { color: theme.textMuted }]}>Tap any square or color to inspect</Text>
          </View>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.stage, { width: gridWidth(columns.length) }]}>
          <View style={styles.grid}>
            {columns.map((slots, wi) => (
              <View key={`w${wi}`} style={styles.col}>
                {slots.map((slot, di) => {
                  const isSelected = selectedDay?.key === slot?.key;
                  const isDimmed = selectedColor
                    ? slot?.count === 0
                      ? selectedColor.min !== 0
                      : slot?.color !== selectedColor.color
                    : false;

                  if (!slot || slot.count === 0) {
                    return (
                      <TouchableOpacity
                        key={slot?.key ?? `e${wi}-${di}`}
                        activeOpacity={0.7}
                        disabled={!slot}
                        onPress={() => {
                          if (!slot) return;
                          setSelectedColor(null);
                          setSelectedDay((prev) =>
                            prev?.key === slot.key
                              ? null
                              : { key: slot.key, date: slot.date, count: 0, color: emptyTrack }
                          );
                        }}
                        style={[
                          styles.cell,
                          { backgroundColor: emptyTrack },
                          isDimmed && { opacity: 0.28 },
                          isSelected && styles.cellSelected,
                        ]}
                      >
                        {isSelected && (
                          <View
                            style={[styles.selectionRing, { borderColor: theme.accentCyan || theme.accent }]}
                            pointerEvents="none"
                          />
                        )}
                      </TouchableOpacity>
                    );
                  }

                  const square = anim.cells.get(slot.key);
                  return (
                    <TouchableOpacity
                      key={slot.key}
                      activeOpacity={0.7}
                      onPress={() => {
                        setSelectedColor(null);
                        setSelectedDay((prev) =>
                          prev?.key === slot.key
                            ? null
                            : { key: slot.key, date: slot.date, count: slot.count, color: slot.color }
                        );
                      }}
                      style={[
                        styles.cell,
                        { backgroundColor: emptyTrack },
                        isDimmed && { opacity: 0.28 },
                        isSelected && styles.cellSelected,
                      ]}
                    >
                      <Animated.View
                        style={[
                          styles.fill,
                          { backgroundColor: slot.color },
                          square && { opacity: square.value, transform: [{ scale: square.scale }] },
                        ]}
                      />
                      {isSelected && (
                        <View
                          style={[styles.selectionRing, { borderColor: theme.accentCyan || theme.accent }]}
                          pointerEvents="none"
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
          <ContribAnimOverlay anim={anim} />
        </View>
      </ScrollView>

      {/* Legend with interactive color tiers */}
      {palette.length > 0 && (
        <View style={styles.footerRow}>
          <Text style={[styles.footerHint, { color: theme.textMuted }]}>
            {selectedDay || selectedColor ? "Tap again or ✕ to clear" : "Activity levels"}
          </Text>
          <View style={styles.legend}>
            <Text style={[styles.legendText, { color: theme.textMuted }]}>Less</Text>
            <View style={styles.legendColors}>
              {palette.map((tier) => {
                const isTierSelected = selectedColor?.color === tier.color;
                return (
                  <TouchableOpacity
                    key={tier.color}
                    style={[
                      styles.legendCell,
                      { backgroundColor: tier.min === 0 ? emptyTrack : tier.color },
                      isTierSelected && [
                        styles.selectedLegendCell,
                        { borderColor: theme.accentCyan || theme.accent },
                      ],
                    ]}
                    activeOpacity={0.7}
                    onPress={() => {
                      setSelectedDay(null);
                      setSelectedColor((prev) => (prev?.color === tier.color ? null : tier));
                    }}
                    accessibilityLabel={`${tier.min} to ${tier.max} contributions`}
                  />
                );
              })}
            </View>
            <Text style={[styles.legendText, { color: theme.textMuted }]}>More</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingVertical: 10 },
  header: { minHeight: 36, marginBottom: 8, justifyContent: "center" },
  defaultHeader: { gap: 1 },
  total: { fontSize: 12, fontWeight: "700" },
  hint: { fontSize: 10.5 },
  activeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  swatch: { width: 14, height: 14, borderRadius: 3, borderWidth: StyleSheet.hairlineWidth },
  activeTextWrap: { flex: 1, gap: 1 },
  activeTitle: { fontSize: 12.5, fontWeight: "700" },
  activeSubtitle: { fontSize: 10.5 },
  dismissBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: { flexGrow: 1, justifyContent: "center" },
  stage: { position: "relative", paddingTop: SKY },
  grid: { flexDirection: "row", gap: GAP },
  col: { gap: GAP },
  cell: { width: CELL, height: CELL, borderRadius: 2, position: "relative" },
  cellSelected: { transform: [{ scale: 1.35 }], zIndex: 20 },
  selectionRing: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.8,
    borderRadius: 3,
    margin: -1.5,
  },
  fill: { ...StyleSheet.absoluteFillObject, borderRadius: 2, opacity: 1 },
  placeholder: { height: 118, marginHorizontal: 12, marginVertical: 10, borderRadius: 6, opacity: 0.5 },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingHorizontal: 2,
  },
  footerHint: { fontSize: 10.5 },
  legend: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendColors: { flexDirection: "row", gap: 3 },
  legendCell: { width: 10, height: 10, borderRadius: 2 },
  selectedLegendCell: { borderWidth: 1.5, transform: [{ scale: 1.25 }] },
  legendText: { fontSize: 10 },
});
