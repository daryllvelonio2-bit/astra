import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useTheme } from "../../../theme/themeContext";
import { fetchContributionCalendar } from "../../services/gitHubAccountService";
import { ContribCalendar } from "../../services/gitHubTypes";
import { useGitHubResource } from "./useGitHubResource";

const CELL = 11;
const GAP = 2.5;
const ROWS = 7;

/**
 * Year contributions graph (GitHub's green squares): total on top, weeks as
 * columns in a horizontal scroller pinned to the recent end. Never breaks
 * the profile — loading shows a fixed placeholder, errors render nothing.
 */
export function GitHubContribGraph({ login }: { login: string }) {
  const { theme } = useTheme();
  const cal = useGitHubResource<ContribCalendar>(() => fetchContributionCalendar(login), [login]);
  const data = cal.data;
  const scrollRef = React.useRef<ScrollView>(null);

  const emptyTrack = theme.isDark ? "#21262d" : "#ebedf0";

  const columns = React.useMemo(() => {
    if (!data) return [];
    return data.weeks.map((days, wi) => {
      const slots: ({ key: string; color: string } | null)[] = new Array(ROWS).fill(null);
      days.forEach((d) => {
        let wd = 0;
        try {
          wd = new Date(`${d.date}T00:00:00Z`).getUTCDay();
        } catch (_) {
          wd = 0;
        }
        // Weeks arrive Sunday-first; the first/last weeks are partial, so
        // index within the column by weekday and leave the rest empty.
        slots[wd >= 0 && wd < ROWS ? wd : 0] = { key: d.date || `${wi}-${wd}`, color: d.color };
      });
      return slots;
    });
  }, [data]);

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
      >
        <View style={styles.grid}>
          {columns.map((slots, wi) => (
            <View key={`w${wi}`} style={styles.col}>
              {slots.map((s, di) =>
                s ? (
                  <View key={s.key} style={[styles.cell, { backgroundColor: s.color }]} />
                ) : (
                  <View key={`e${wi}-${di}`} style={[styles.cell, { backgroundColor: emptyTrack }]} />
                )
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingVertical: 10 },
  total: { fontSize: 11.5, fontWeight: "600", marginBottom: 8 },
  grid: { flexDirection: "row", gap: GAP },
  col: { gap: GAP },
  cell: { width: CELL, height: CELL, borderRadius: 2 },
  placeholder: { height: 118, marginHorizontal: 12, marginVertical: 10, borderRadius: 6, opacity: 0.5 },
});
