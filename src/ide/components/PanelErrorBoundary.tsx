import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/themeContext";

interface PanelErrorBoundaryProps {
  /** Shown in the fallback ("Editor hit a problem") so users know what broke. */
  panelName: string;
  /** When this changes (file switch, workspace switch) a stuck error clears. */
  resetKey?: string | null;
  children: React.ReactNode;
}

interface PanelErrorBoundaryState {
  error: Error | null;
}

/**
 * One panel crashing must never white-screen the whole IDE. Wrap each tab
 * (explorer, editor, terminal, browser, git) so a render throw becomes a
 * small themed fallback with a retry, scoped to that panel.
 */
export class PanelErrorBoundary extends React.Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  state: PanelErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[${this.props.panelName} panel crashed]`, error, info.componentStack);
  }

  componentDidUpdate(prevProps: PanelErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private retry = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return <PanelFallback panelName={this.props.panelName} onRetry={this.retry} />;
    }
    return this.props.children;
  }
}

function PanelFallback({ panelName, onRetry }: { panelName: string; onRetry: () => void }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.fallback, { backgroundColor: theme.bgPrimary }]}>
      <Octicons name="alert" size={28} color={theme.accentRed} />
      <Text style={[styles.title, { color: theme.textPrimary }]}>{panelName} hit a problem</Text>
      <Text style={[styles.subtitle, { color: theme.textMuted }]}>
        The rest of the IDE is fine. Switch tabs and come back, or try again.
      </Text>
      <TouchableOpacity
        style={[styles.retryBtn, { borderColor: theme.border }]}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={`Retry ${panelName}`}
      >
        <Text style={[styles.retryText, { color: theme.accent }]}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
  },
  title: { fontSize: 15, fontWeight: "700" },
  subtitle: { fontSize: 12, textAlign: "center", lineHeight: 17 },
  retryBtn: {
    marginTop: 6,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderWidth: 1,
    borderRadius: 8,
  },
  retryText: { fontSize: 13, fontWeight: "700" },
});
