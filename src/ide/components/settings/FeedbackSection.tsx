import React, { useState, useEffect } from "react";
import { View, Platform } from "react-native";
import Constants from "expo-constants";
import { ThemeColors } from "../../../theme/themeContext";
import { loadWorkspaceRegistry } from "../../services/workspaceService";
import { SettingsSectionHeader } from "./SettingsSectionHeader";
import { FeedbackComposeForm } from "./FeedbackComposeForm";

/**
 * Send feedback to the developers (Settings -> Feedback).
 *
 * This container owns only what the compose form cannot know by itself: the
 * platform line and the app version read from the runtime. Two deliberate
 * properties are preserved from the transport's design:
 *  - The sender is the APP, not the user's mail client. No mail-app handoff
 *    URL, so a user with no mail app configured can still report something.
 *  - The developer addresses appear NOWHERE in the app (feedbackTransport holds
 *    the relay endpoint). Do not add them back into any string in this file.
 */

/** "Android 14 (API 35)" on device; a plain label elsewhere (dev/harness). */
function osVersionLabel(): string {
  if (Platform.OS === "android") {
    const c = (Platform.constants ?? {}) as { Release?: string };
    return c.Release
      ? `Android ${c.Release} (API ${String(Platform.Version)})`
      : `Android API ${String(Platform.Version)}`;
  }
  return `${Platform.OS} ${String(Platform.Version)}`;
}

/** Hardware model, e.g. "Pixel 6" — straight from the runtime, no new deps. */
function deviceModelLabel(): string {
  const c = (Platform.constants ?? {}) as { Model?: string; Brand?: string };
  const model = (c.Model || "").trim();
  const brand = (c.Brand || "").trim();
  if (!model) return brand || "unknown device";
  if (brand && !model.toLowerCase().startsWith(brand.toLowerCase())) return `${brand} ${model}`;
  return model;
}

/** The platform line attached to every report: OS · device · project. */
function buildPlatformLine(workspaceName: string): string {
  const parts = [osVersionLabel(), deviceModelLabel()];
  if (workspaceName) parts.push(`workspace ${workspaceName}`);
  return parts.join(" · ");
}

export function FeedbackSection({ theme, workspaceId }: { theme: ThemeColors; workspaceId?: string }) {
  const [workspaceName, setWorkspaceName] = useState("");

  // Resolve the id to the human name once, so the report says which project.
  useEffect(() => {
    let alive = true;
    if (!workspaceId) {
      setWorkspaceName("");
      return;
    }
    loadWorkspaceRegistry()
      .then((reg) => {
        if (alive) setWorkspaceName(reg[workspaceId]?.name || workspaceId);
      })
      .catch(() => {
        if (alive) setWorkspaceName(workspaceId);
      });
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  const appVersion = (Constants.expoConfig as { version?: string } | null)?.version || "?";
  const platform = buildPlatformLine(workspaceName);

  return (
    <View>
      <SettingsSectionHeader
        theme={theme}
        icon="chatbubble-ellipses-outline"
        title="Send Feedback"
        subtitle="Report bugs or suggest improvements."
      />
      <FeedbackComposeForm theme={theme} platform={platform} appVersion={appVersion} />
    </View>
  );
}
