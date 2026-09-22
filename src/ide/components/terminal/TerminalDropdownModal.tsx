import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TerminalTab } from "./useTerminalSession";
import { ThemeColors } from "../../../theme/themeContext";

interface TerminalDropdownModalProps {
  visible: boolean;
  onClose: () => void;
  sessions: TerminalTab[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onAddSession: () => void;
  onCloseSession: (id: string) => void;
  theme: ThemeColors;
  title?: string;
}

export function TerminalDropdownModal({
  visible,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onAddSession,
  onCloseSession,
  theme,
  title,
}: TerminalDropdownModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={[styles.backdrop, { backgroundColor: theme.overlay }]}
        activeOpacity={1}
        onPress={onClose}
      >
        <View
          style={[
            styles.container,
            {
              backgroundColor: theme.bgElevated,
              borderColor: theme.border,
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="terminal-outline" size={16} color={theme.accent} />
              <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>
                {title || `Terminal Sessions (${sessions.length})`}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Session List */}
          <ScrollView style={styles.list} bounces={false}>
            {sessions.map((s) => {
              const isActive = s.id === activeSessionId;
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[
                    styles.sessionRow,
                    { borderBottomColor: theme.border },
                    isActive && { backgroundColor: `${theme.accent}14` },
                  ]}
                  onPress={() => {
                    onSelectSession(s.id);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: theme.textMuted },
                      s.isTask && { backgroundColor: theme.accentGreen },
                      isActive && !s.isTask && { backgroundColor: theme.accent },
                    ]}
                  />
                  <Text
                    style={[
                      styles.sessionName,
                      {
                        color: isActive
                          ? theme.accent
                          : s.isTask
                          ? theme.accentGreen
                          : theme.textPrimary,
                        fontWeight: isActive ? "700" : "500",
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {s.name}
                  </Text>

                  {isActive && (
                    <Ionicons
                      name="checkmark"
                      size={16}
                      color={theme.accent}
                      style={styles.activeCheck}
                    />
                  )}

                  {sessions.length > 1 && (
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        onCloseSession(s.id);
                      }}
                      style={[styles.closeBtn, { backgroundColor: `${theme.accentRed}15` }]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close" size={12} color={theme.accentRed} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Footer / Add New */}
          <TouchableOpacity
            style={[styles.addFooterBtn, { borderTopColor: theme.border, backgroundColor: theme.bgSecondary }]}
            onPress={() => {
              onAddSession();
              onClose();
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={16} color={theme.accent} />
            <Text style={[styles.addFooterText, { color: theme.accent }]}>
              New Terminal Session
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  container: {
    width: "100%",
    maxWidth: 360,
    maxHeight: 400,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  list: {
    maxHeight: 280,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sessionName: {
    flex: 1,
    fontSize: 13,
    fontFamily: "monospace",
  },
  activeCheck: {
    marginRight: 4,
  },
  closeBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  addFooterBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderTopWidth: 1,
  },
  addFooterText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
