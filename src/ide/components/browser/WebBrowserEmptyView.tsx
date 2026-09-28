import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";

interface WebBrowserEmptyViewProps {
  onNavigate: (targetUrl: string) => void;
}

export function WebBrowserEmptyView({
  onNavigate,
}: WebBrowserEmptyViewProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
      <Ionicons name="globe-outline" size={48} color={theme.textMuted} />
      <Text style={[styles.title, { color: theme.textPrimary }]}>Browser is empty</Text>
      <Text style={[styles.subtext, { color: theme.textSecondary }]}>
        Type a URL or port above to preview.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    marginTop: 14,
  },
  subtext: {
    fontSize: 12.5,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 16,
    maxWidth: 320,
  },
});
