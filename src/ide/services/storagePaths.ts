import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

export interface QuickPath {
  label: string;
  path: string;
}

function stripFileScheme(p: string): string {
  return (p || "").replace(/^file:\/\//, "");
}

/** App-private workspaces dir — single source of truth for default storage. */
export function getWorkspacesDir(): string {
  const base = FileSystem.documentDirectory || "";
  if (base) return `${base}workspaces/`;
  // Web / unknown: no documentDirectory — fall back to a displayable default.
  return "";
}

/** Display-friendly version of an absolute path (strips file://). */
export function formatDisplayPath(absolutePath: string, fallbackId = ""): string {
  const clean = stripFileScheme(absolutePath || "").trim();
  if (clean) return clean;
  if (fallbackId) return `workspaces/${fallbackId}/`;
  return "workspaces/";
}

/** Short preview used when no custom dir is chosen yet. */
export function getDefaultWorkspacePreviewPath(projectName: string): string {
  const id = (projectName || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const dir = getWorkspacesDir();
  if (dir) return `${stripFileScheme(dir)}${id}/`;
  return `workspaces/${id}/`;
}

export function getDeviceLabel(): string {
  if (Platform.OS === "android") return "Phone";
  if (Platform.OS === "ios") return "Device";
  if (Platform.OS === "web") return "Browser";
  return "Device";
}

export function getPickerTitle(): string {
  if (Platform.OS === "android") return "Choose Phone Directory";
  return "Choose Directory";
}

export function getParentDirLabel(): string {
  if (Platform.OS === "android") return "Parent Directory on Phone";
  if (Platform.OS === "ios") return "Parent Directory on Device";
  return "Parent Directory";
}

export function getCustomDirPlaceholder(): string {
  if (Platform.OS === "android") return "/sdcard/Documents/...";
  const dir = getWorkspacesDir();
  if (dir) return stripFileScheme(dir);
  return "Enter or browse to a directory...";
}

/**
 * Dynamic default base for the picker. Phone builds start in app-private
 * storage; callers may override via initialPath.
 */
export function getDefaultPickerBase(): string {
  return FileSystem.documentDirectory || "";
}

/** Platform-aware quick jumps — no more phone-only /sdcard on desktop/web. */
export function getQuickPaths(): QuickPath[] {
  const workspaces = getWorkspacesDir();
  const docDir = FileSystem.documentDirectory || "";

  if (Platform.OS === "android") {
    return [
      { label: "📦 Workspaces", path: workspaces || "/sdcard/" },
      { label: "🎮 Godot", path: "/sdcard/Godot/" },
      { label: "📁 Documents", path: "/sdcard/Documents/" },
      { label: "⬇️ Download", path: "/sdcard/Download/" },
      { label: "📱 SDCard", path: "/sdcard/" },
    ].filter((q) => !!q.path);
  }

  if (Platform.OS === "ios") {
    return [
      ...(workspaces ? [{ label: "📦 Workspaces", path: workspaces }] : []),
      ...(docDir ? [{ label: "📁 Documents", path: docDir }] : []),
    ];
  }

  // web / windows / macos / linux preview: only paths that actually exist.
  const quick: QuickPath[] = [];
  if (workspaces) quick.push({ label: "📦 Workspaces", path: workspaces });
  if (docDir && stripFileScheme(docDir) !== stripFileScheme(workspaces)) {
    quick.push({ label: "📁 Documents", path: docDir });
  }
  return quick;
}
