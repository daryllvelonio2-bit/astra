import React from "react";
import { Animated, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../../theme/themeContext";
import { fetchContributionCalendar } from "../../services/gitHubAccountService";
import { ContribCalendar } from "../../services/gitHubTypes";
import { useGitHubResource } from "./useGitHubResource";
import { ContribCell, CELL, GAP, ROWS, SKY, gridWidth } from "./contribPlan";
import { useContribAnimation } from "./useContribAnimation";
import { ContribAnimOverlay } from "./ContribAnimOverlay";

/**
 * Year contributions graph (GitHub's green squares): total on top, weeks as
 * columns in a horizontal scroller pinned to the recent end, and a random
 * animation over it — a snake that eats the greens, or an aircraft strafing
 * them away. Never breaks the profile: loading shows a fixed placeholder,
 * errors render nothing.
 *
 * Each green square sits on an empty track of its own, so when it is eaten the
 * square underneath shows through and the grid keeps its shape.
 */
export function GitHubContribGraph({ login }: { login: string }) {
  const { theme } = useTheme();
  const cal = useGitHubResource<ContribCalendar>(() => fetchContributionCalendar(login), [login]);
  const data = cal.data;
  const scrollRef = React.useRef<ScrollView>(null);

  const emptyTrack = theme.bgTertiary;

  const columns = React.useMemo(() => {
    if (!data) return [];
    return data.weeks.map((days, wi) => {
      const slots: ({ key: string; color: string; count: number } | null)[] = new Array(ROWS).fill(null);
      days.forEach((d) => {
        let wd = 0;
        try {
          wd = new Date(`${d.date}T00:00:00Z`).getUTCDay();
        } catch (_) {
          wd = 0;
        }
        // Weeks arrive Sunday-first; the first/last weeks are partial, so
        // index within the column by weekday and leave the rest empty.
        slots[wd >= 0 && wd < ROWS ? wd : 0] = { key: d.date || `${wi}-${wd}`, color: d.color, count: d.count };
      });
      return slots;
    });
  }, [data]);

  // Only days with real contributions are prey — empty squares are never
  // eaten, never animated, and the snake never walks them.
  const alive = React.useMemo(() => {
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
      <Text style={[styles.total, { color: theme.textSecondary }]}>
        {data.total.toLocaleString()} contributions in the last year
      </Text>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        // The stage is exactly grid-wide (no reserved lane), so both margins
        // match. flexGrow + centering keeps it balanced on screens wider than
        // the year grid, where there is nothing to scroll.
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.stage, { width: gridWidth(columns.length) }]}>
          <View style={styles.grid}>
            {columns.map((slots, wi) => (
              <View key={`w${wi}`} style={styles.col}>
                {slots.map((slot, di) => {
                  // Structural gaps and zero-contribution days share the theme
                  // gray — never the API's light palette, never animated.
                  if (!slot || slot.count === 0) {
                    return (
                      <View key={slot?.key ?? `e${wi}-${di}`} style={[styles.cell, { backgroundColor: emptyTrack }]} />
                    );
                  }
                  const square = anim.cells.get(slot.key);
                  return (
                    <View key={slot.key} style={[styles.cell, { backgroundColor: emptyTrack }]}>
                      <Animated.View
                        style={[
                          styles.fill,
                          { backgroundColor: slot.color },
                          square && { opacity: square.value, transform: [{ scale: square.scale }] },
                        ]}
                      />
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
          <ContribAnimOverlay anim={anim} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingVertical: 10 },
  total: { fontSize: 11.5, fontWeight: "600", marginBottom: 8 },
  scrollContent: { flexGrow: 1, justifyContent: "center" },
  /** Holds the aircraft's flight lane above the squares. */
  stage: { position: "relative", paddingTop: SKY },
  grid: { flexDirection: "row", gap: GAP },
  col: { gap: GAP },
  cell: { width: CELL, height: CELL, borderRadius: 2 },
  fill: { ...StyleSheet.absoluteFillObject, borderRadius: 2, opacity: 1 },
  placeholder: { height: 118, marginHorizontal: 12, marginVertical: 10, borderRadius: 6, opacity: 0.5 },
});

