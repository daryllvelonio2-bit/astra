import React, { useSyncExternalStore } from "react";
import { View, Text, TouchableOpacity, Modal, StyleSheet } from "react-native";
import { useTheme } from "../../theme/themeContext";

/**
 * Global themed dialog — replacement for the native Alert.alert, which
 * renders with the OS style and ignores the active marketplace theme.
 *
 * Usage (no hooks needed, callable from services and event handlers):
 *   showAppDialog({ title, message })
 *   showAppDialog({ title, message, buttons: [{ text: "Stay" }, { text: "Quit", style: "destructive", onPress }] })
 *
 * Mount <AppDialogHost /> once, high in the tree (inside ThemeProvider).
 */

export interface AppDialogButton {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
}

export interface AppDialogOptions {
  title?: string;
  message?: string;
  /** Optional rich content rendered under the message (custom React nodes). */
  content?: React.ReactNode;
  buttons?: AppDialogButton[];
  /** Dismiss via backdrop / back. Default true (alert-style). */
  dismissable?: boolean;
  /** Custom icon node shown above the title (e.g. an Octicons mark). */
  icon?: React.ReactNode;
}

interface ResolvedDialog {
  id: number;
  options: AppDialogOptions;
}

type Listener = () => void;

let current: ResolvedDialog | null = null;
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

/** Show a themed dialog. Replaces any dialog already open (one at a time). */
export function showAppDialog(options: AppDialogOptions): void {
  current = { id: nextId++, options };
  emit();
}

export function dismissAppDialog(): void {
  if (!current) return;
  current = null;
  emit();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ResolvedDialog | null {
  return current;
}

export function AppDialogHost() {
  const { theme } = useTheme();
  const dialog = useSyncExternalStore(subscribe, getSnapshot);

  const close = () => dismissAppDialog();

  const handleButton = (btn: AppDialogButton) => {
    dismissAppDialog();
    btn.onPress?.();
  };

  const dismissable = dialog?.options.dismissable !== false;
  const buttons = dialog?.options.buttons ?? [{ text: "OK", style: "cancel" as const }];
  const hasDestructive = buttons.some((b) => b.style === "destructive");

  return (
    <Modal
      visible={!!dialog}
      transparent
      animationType="fade"
      onRequestClose={() => dismissable && close()}
    >
      {dialog && (
        <TouchableOpacity
          style={[styles.backdrop, { backgroundColor: theme.overlay ?? "rgba(0,0,0,0.55)" }]}
          activeOpacity={1}
          onPress={() => dismissable && close()}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={[
              styles.card,
              { backgroundColor: theme.bgElevated, borderColor: theme.border },
            ]}
          >
            {dialog.options.icon && (
              <View style={styles.iconWrap}>{dialog.options.icon}</View>
            )}
            {!!dialog.options.title && (
              <Text style={[styles.title, { color: theme.textPrimary }]}>
                {dialog.options.title}
              </Text>
            )}
            {!!dialog.options.message && (
              <Text style={[styles.message, { color: theme.textSecondary }]}>
                {dialog.options.message}
              </Text>
            )}
            {dialog.options.content}
            <View style={styles.btnRow}>
              {buttons.map((btn, i) => {
                const isCancel = btn.style === "cancel";
                const isDestructive = btn.style === "destructive";
                const isPrimary =
                  !isCancel && !isDestructive && buttons.length > 1 && i === buttons.length - 1;
                return (
                  <TouchableOpacity
                    key={`${btn.text}-${i}`}
                    onPress={() => handleButton(btn)}
                    activeOpacity={0.8}
                    style={[
                      styles.btn,
                      isPrimary && { backgroundColor: theme.accent, borderColor: theme.accent },
                      isDestructive && {
                        backgroundColor: `${theme.accentRed}22`,
                        borderColor: `${theme.accentRed}66`,
                      },
                      (isCancel || (!isPrimary && !isDestructive)) && {
                        backgroundColor: theme.bgTertiary,
                        borderColor: theme.border,
                      },
                      // Single alert-style button: quiet and full width.
                      buttons.length === 1 && { backgroundColor: theme.bgTertiary, borderColor: theme.border },
                    ]}
                  >
                    <Text
                      style={[
                        styles.btnText,
                        {
                          color: isPrimary
                            ? "#fff"
                            : isDestructive
                            ? theme.accentRed
                            : theme.textSecondary,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {hasDestructive && <View style={{ height: 0 }} />}
          </TouchableOpacity>
        </TouchableOpacity>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 14,
    borderWidth: 1,
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 18,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  iconWrap: { alignItems: "center", marginBottom: 10 },
  title: { fontSize: 15.5, fontWeight: "700", textAlign: "center" },
  message: { fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 7 },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 18 },
  btn: {
    flex: 1,
    height: 42,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  btnText: { fontSize: 13.5, fontWeight: "700" },
});