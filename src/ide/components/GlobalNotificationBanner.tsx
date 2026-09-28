import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors, useTheme } from "../../theme/themeContext";
import {
  BannerItem,
  NotifySource,
  NotifyTone,
  dismissBanner,
  getBanners,
  subscribeBanners,
} from "../services/notificationService";

/**
 * App-level banner host: renders every in-app notification at the right edge
 * of the screen, above whichever surface is open (picker, editor, terminal,
 * browser, git, GitHub suite). Items auto-dismiss after the service TTL
 * (8 seconds); tapping one dismisses it early. Slide in/out runs on the
 * native driver so it never competes with the JS thread.
 */

const SOURCE_ICON: Record<NotifySource, keyof typeof Ionicons.glyphMap> = {
  github: "logo-github",
  terminal: "terminal-outline",
  agent: "sparkles-outline",
  app: "notifications-outline",
};

function toneColor(theme: ThemeColors, tone: NotifyTone): string {
  switch (tone) {
    case "success":
      return theme.accentGreen;
    case "error":
      return theme.accentRed;
    case "warning":
      return theme.accentGold;
    default:
      return theme.accent;
  }
}

interface Row {
  item: BannerItem;
  exiting: boolean;
}

export function GlobalNotificationBanner() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Row[]>(() =>
    getBanners().map((item) => ({ item, exiting: false }))
  );

  useEffect(
    () =>
      subscribeBanners(() => {
        const live = getBanners();
        const liveIds = new Set(live.map((b) => b.id));
        setRows((prev) => {
          const seen = new Set(prev.map((r) => r.item.id));
          let next = prev.map((r) =>
            liveIds.has(r.item.id) ? r : { ...r, exiting: true }
          );
          for (const item of live) {
            if (!seen.has(item.id)) next = [...next, { item, exiting: false }];
          }
          return next;
        });
      }),
    []
  );

  // Drop rows once their exit animation has had time to play.
  useEffect(() => {
    if (!rows.some((r) => r.exiting)) return;
    const t = setTimeout(
      () => setRows((prev) => prev.filter((r) => !r.exiting)),
      200
    );
    return () => clearTimeout(t);
  }, [rows]);

  if (rows.length === 0) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8 }]}>
      {rows.map((r) => (
        <BannerCard key={r.item.id} row={r} />
      ))}
    </View>
  );
}

function BannerCard({ row }: { row: Row }) {
  const { theme } = useTheme();
  // 1 = hidden off the right edge, 0 = fully shown.
  const hidden = useRef(new Animated.Value(1)).current;
  const enteredRef = useRef(false);

  useEffect(() => {
    if (!enteredRef.current) {
      enteredRef.current = true;
      Animated.timing(hidden, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
      return;
    }
    if (row.exiting) {
      Animated.timing(hidden, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }).start();
    }
  }, [row.exiting]);

  const translateX = hidden.interpolate({ inputRange: [0, 1], outputRange: [0, 340] });
  const opacity = hidden.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const accent = toneColor(theme, row.item.tone);

  return (
    <Animated.View style={{ transform: [{ translateX }], opacity }}>
      <Pressable
        onPress={() => dismissBanner(row.item.id)}
        style={[
          styles.card,
          {
            backgroundColor: theme.bgElevated,
            borderColor: theme.border,
            borderLeftColor: accent,
          },
        ]}
      >
        <Ionicons
          name={SOURCE_ICON[row.item.source]}
          size={16}
          color={accent}
          style={styles.icon}
        />
        <View style={styles.body}>
          <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={2}>
            {row.item.title}
          </Text>
          {!!row.item.message && (
            <Text
              style={[styles.message, { color: theme.textSecondary }]}
              numberOfLines={3}
            >
              {row.item.message}
            </Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 10,
    width: "78%",
    maxWidth: 330,
    gap: 8,
    zIndex: 1200,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 3,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  icon: { marginTop: 1 },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 12.5, fontWeight: "700", lineHeight: 17 },
  message: { fontSize: 11, lineHeight: 15 },
});