import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/themeContext";
import { ProjectTemplate } from "../services/projectTemplates";
import { scaffoldProject, cancelScaffold } from "../services/projectScaffoldService";

/**
 * The "really create it" step: runs the selected template's non-interactive
 * scaffold commands in the project folder and shows live progress.
 *
 * One sheet, one flat body: the title row carries the state, the log is an
 * inset without its own border, and the buttons are the only loud elements.
 *
 * Safe by construction:
 *  - Create already made the folder, so a failure or a cancel leaves a usable
 *    (empty) project, never a half-scaffolded folder presented as success —
 *    the error/cancel states say so and offer only "Open folder".
 *  - Cancel kills the guest subtree via the shared `cancelScaffold()`.
 *  - Nothing here installs a runtime; that is the picker's explicit Get tap.
 */

export interface ScaffoldTarget {
  template: ProjectTemplate;
  workspaceId: string;
}

interface ProjectScaffoldModalProps {
  target: ScaffoldTarget | null;
  onOpenWorkspace: (workspaceId: string) => void;
  onDismiss: () => void;
}

type Phase = "running" | "done" | "error" | "cancelled";

export function ProjectScaffoldModal({ target, onOpenWorkspace, onDismiss }: ProjectScaffoldModalProps) {
  const { theme } = useTheme();
  const [lines, setLines] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("running");
  const [error, setError] = useState("");

  const cancelledRef = useRef(false);
  const runIdRef = useRef(0);
  const aliveRef = useRef(true);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    if (!target) return;
    const runId = ++runIdRef.current;
    cancelledRef.current = false;
    setPhase("running");
    setError("");
    setLines([]);

    const res = await scaffoldProject(target.template, target.workspaceId, (line) => {
      if (!aliveRef.current || runIdRef.current !== runId) return;
      setLines((prev) => {
        const next = prev.length >= 120 ? prev.slice(prev.length - 119) : prev.slice();
        next.push(line);
        return next;
      });
      scrollRef.current?.scrollToEnd({ animated: false });
    });

    if (!aliveRef.current || runIdRef.current !== runId) return;
    if (cancelledRef.current) {
      setPhase("cancelled");
      return;
    }
    if (res.ok) {
      setPhase("done");
    } else {
      setPhase("error");
      setError(res.error || "Could not create the project.");
    }
  }, [target]);

  useEffect(() => {
    if (!target) return;
    void run();
    return () => {
      // Leaving the modal (dismiss/unmount) must not leave a scaffold running.
      cancelledRef.current = true;
      cancelScaffold();
    };
  }, [target, run]);

  if (!target) return null;

  const handleCancel = () => {
    cancelledRef.current = true;
    cancelScaffold();
    setPhase("cancelled");
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={phase === "running" ? handleCancel : onDismiss}>
      <View style={styles.overlay}>
        <View style={[styles.backdrop, { backgroundColor: theme.overlay }]} />
        <View style={[styles.sheet, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
          <View style={styles.titleRow}>
            {phase === "running" && <ActivityIndicator size={16} color={theme.accent} />}
            {phase === "done" && <Ionicons name="checkmark-circle" size={18} color={theme.accentGreen} />}
            {phase === "error" && <Ionicons name="alert-circle" size={18} color={theme.accentRed} />}
            {phase === "cancelled" && <Ionicons name="close-circle" size={18} color={theme.accentGold} />}
            <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
              {phase === "running" ? `Creating ${target.template.name}…` : `${target.template.name}`}
            </Text>
          </View>

          {phase === "running" && (
            <>
              <ScrollView
                ref={scrollRef}
                style={[styles.log, { backgroundColor: theme.bgTertiary }]}
                contentContainerStyle={styles.logContent}
              >
                {lines.map((line, i) => (
                  <Text key={i} style={[styles.logLine, { color: theme.textSecondary }]} numberOfLines={1}>
                    {line}
                  </Text>
                ))}
              </ScrollView>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}
                  onPress={handleCancel}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.btnText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {phase === "done" && (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: theme.accent }]}
                onPress={() => onOpenWorkspace(target.workspaceId)}
                activeOpacity={0.8}
              >
                <Text style={[styles.btnText, { color: theme.sendButtonIcon }]}>Open project</Text>
              </TouchableOpacity>
            </View>
          )}

          {(phase === "error" || phase === "cancelled") && (
            <>
              <Text style={[styles.sub, { color: phase === "error" ? theme.accentRed : theme.textSecondary }]}>
                {phase === "error" ? error : "Cancelled — the folder is kept but empty."}
              </Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}
                  onPress={onDismiss}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.btnText, { color: theme.textSecondary }]}>Close</Text>
                </TouchableOpacity>
                {phase === "error" && (
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: `${theme.accent}18`, borderColor: `${theme.accent}40`, borderWidth: 1 }]}
                    onPress={() => void run()}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.btnText, { color: theme.accent }]}>Retry</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: theme.accent }]}
                  onPress={() => onOpenWorkspace(target.workspaceId)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.btnText, { color: theme.sendButtonIcon }]}>Open folder</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    borderWidth: 1,
    maxHeight: "85%",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 17, fontWeight: "700", flex: 1 },
  sub: { fontSize: 12.5, lineHeight: 16, marginTop: 8 },
  log: { marginTop: 10, borderRadius: 8, maxHeight: 180 },
  logContent: { padding: 10, gap: 2 },
  logLine: { fontSize: 11, fontFamily: "monospace" },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
  },
  btnText: { fontSize: 14, fontWeight: "700" },
});
