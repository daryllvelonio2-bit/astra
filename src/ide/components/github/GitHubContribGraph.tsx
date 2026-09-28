import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../../../theme/themeContext";
import { fetchContributionCalendar } from "../../services/gitHubAccountService";
import { ContribCalendar } from "../../services/gitHubTypes";
import { useGitHubResource } from "./useGitHubResource";
import { ContribCell, CELL, GAP, ROWS, SKY, gridWidth } from "./contribPlan";
import { CellAnim, useContribAnimation } from "./useContribAnimation";
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
  col: number;
  row: number;
}

function formatShortDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(`${dateStr}T00:00:00Z`);
    return d.toLocaleDateString("en-US", {
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

interface ContribSquareProps {
  slot: DaySlot | null;
  col: number;
  row: number;
  isSelected: boolean;
  squareAnim?: CellAnim;
  emptyTrack: string;
  accentColor: string;
  onPress: (slot: DaySlot, col: number, row: number) => void;
}

/**
 * Individual memoized square:
 * - delayPressIn={0} eliminates Android's 130ms press delay.
 * - React.memo skips re-rendering 369 out of 371 cells on tap.
 */
const ContribSquare = React.memo(function ContribSquare({
  slot,
  col,
  row,
  isSelected,
  squareAnim,
  emptyTrack,
  accentColor,
  onPress,
}: ContribSquareProps) {
  if (!slot || slot.count === 0) {
    return (
      <TouchableOpacity
        key={slot?.key ?? `e${col}-${row}`}
        activeOpacity={0.7}
        delayPressIn={0}
        disabled={!slot}
        onPress={() => slot && onPress(slot, col, row)}
        style={[
          styles.cell,
          { backgroundColor: emptyTrack },
          isSelected && styles.cellSelected,
        ]}
        accessibilityLabel={slot ? `No contributions on ${slot.date}` : "Empty"}
      >
        {isSelected && (
          <View
            style={[styles.selectionRing, { borderColor: accentColor }]}
            pointerEvents="none"
          />
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      key={slot.key}
      activeOpacity={0.7}
      delayPressIn={0}
      onPress={() => onPress(slot, col, row)}
      style={[
        styles.cell,
        { backgroundColor: emptyTrack },
        isSelected && styles.cellSelected,
      ]}
      accessibilityLabel={`${slot.count} contributions on ${slot.date}`}
    >
      <Animated.View
        style={[
          styles.fill,
          { backgroundColor: slot.color },
          squareAnim && { opacity: squareAnim.value, transform: [{ scale: squareAnim.scale }] },
        ]}
      />
      {isSelected && (
        <View
          style={[styles.selectionRing, { borderColor: accentColor }]}
          pointerEvents="none"
        />
      )}
    </TouchableOpacity>
  );
});

/**
 * High-performance interactive contributions graph:
 * - 30-minute in-memory GraphQL cache with in-flight deduplication.
 * - Instant touch feedback with delayPressIn={0} and memoized cells.
 * - Compact tooltip above the tapped box without extra modals.
 */
export function GitHubContribGraph({ login }: { login: string }) {
  const { theme } = useTheme();
  const cal = useGitHubResource<ContribCalendar>(() => fetchContributionCalendar(login), [login]);
  const data = cal.data;
  const scrollRef = useRef<ScrollView>(null);

  const [selectedDay, setSelectedDay] = useState<SelectedDay | null>(null);

  const emptyTrack = theme.bgTertiary;
  const accentColor = theme.accentCyan || theme.accent;

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

  const alive = useMemo(() => {
    const squares: ContribCell[] = [];
    columns.forEach((slots, col) => {
      slots.forEach((slot, row) => {
        if (slot && slot.count > 0) squares.push({ key: slot.key, col, row, color: slot.color });
      });
    });
    return squares;
  }, [columns]);

  const slotByKey = useMemo(() => {
    const map = new Map<string, { slot: DaySlot; col: number; row: number }>();
    columns.forEach((slots, wi) => {
      slots.forEach((s, di) => {
        if (s) map.set(s.key, { slot: s, col: wi, row: di });
      });
    });
    return map;
  }, [columns]);

  // Contribution popup follows the animation target (eaten or bombed)
  const onTargetHit = useCallback((key: string) => {
    const item = slotByKey.get(key);
    if (!item) return;
    const { slot, col, row } = item;
    setSelectedDay({
      key: slot.key,
      date: slot.date,
      count: slot.count,
      color: slot.color,
      col,
      row,
    });
  }, [slotByKey]);

  const anim = useContribAnimation(alive, columns.length, onTargetHit);

  const handlePress = useCallback((slot: DaySlot, col: number, row: number) => {
    setSelectedDay((prev) =>
      prev?.key === slot.key
        ? null
        : { key: slot.key, date: slot.date, count: slot.count, color: slot.color, col, row }
    );
  }, []);

  if (cal.error && !data) return null;
  if (!data) {
    return <View style={[styles.placeholder, { backgroundColor: theme.bgSecondary }]} />;
  }

  const totalGridW = gridWidth(columns.length);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.total, { color: theme.textSecondary }]}>
        {data.total.toLocaleString()} contributions in the last year
      </Text>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.stage, { width: totalGridW }]}>
          <View style={styles.grid}>
            {columns.map((slots, wi) => (
              <View key={`w${wi}`} style={styles.col}>
                {slots.map((slot, di) => {
                  const isSelected = Boolean(selectedDay && slot && selectedDay.key === slot.key);
                  const squareAnim = slot ? anim.cells.get(slot.key) : undefined;

                  return (
                    <ContribSquare
                      key={slot?.key ?? `e${wi}-${di}`}
                      slot={slot}
                      col={wi}
                      row={di}
                      isSelected={isSelected}
                      squareAnim={squareAnim}
                      emptyTrack={emptyTrack}
                      accentColor={accentColor}
                      onPress={handlePress}
                    />
                  );
                })}
              </View>
            ))}
          </View>

          <ContribAnimOverlay anim={anim} />

          {/* Floating tooltip directly above the tapped box */}
          {selectedDay && (
            <View
              style={[
                styles.tooltip,
                {
                  top: Math.max(0, SKY + selectedDay.row * (CELL + GAP) - 27),
                  left: Math.max(
                    2,
                    Math.min(
                      totalGridW - 170,
                      selectedDay.col * (CELL + GAP) + CELL / 2 - 85
                    )
                  ),
                  backgroundColor: theme.bgSecondary,
                  borderColor: theme.border,
                },
              ]}
              pointerEvents="none"
            >
              <View
                style={[
                  styles.tooltipSwatch,
                  { backgroundColor: selectedDay.count > 0 ? selectedDay.color : emptyTrack },
                ]}
              />
              <Text style={[styles.tooltipText, { color: theme.textPrimary }]} numberOfLines={1}>
                <Text style={styles.tooltipBold}>{formatContribCount(selectedDay.count)}</Text>
                {" · "}
                <Text style={{ color: theme.textSecondary }}>{formatShortDate(selectedDay.date)}</Text>
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingVertical: 10 },
  total: { fontSize: 11.5, fontWeight: "600", marginBottom: 8 },
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
  tooltip: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 50,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  tooltipSwatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  tooltipText: {
    fontSize: 10.5,
  },
  tooltipBold: {
    fontWeight: "700",
  },
});
