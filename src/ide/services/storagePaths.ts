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
/** The app's private storage root, with whatever package id it happens to use. */
const APP_STORAGE = /^\/data\/(?:user\/\d+\/|data\/)[^/]+\/files\//;

/** Middle-truncate one path segment: long project folders were eating the row. */
function shortenSegment(seg: string): string {
  if (seg.length <= 28) return seg;
  return `${seg.slice(0, 15)}\u2026${seg.slice(-10)}`;
}

/**
 * Display-only shortening. The paths under /data/user/0/<package>/files/ are the
 * app's own plumbing -- the user never typed the package name and reading it
 * tells them nothing, while it costs half the row. The real path on disk is
 * untouched; every caller of this only renders text.
 */
export function formatDisplayPath(absolutePath: string, fallbackId = ""): string {
  const clean = stripFileScheme(absolutePath || "").trim();
  if (!clean) {
    if (fallbackId) return "workspaces/" + fallbackId + "/";
    return "workspaces/";
  }
  const shortened = clean.replace(APP_STORAGE, "~/");
  const parts = shortened.split("/");
  const last = parts.length - 1;
  if (parts[last]) parts[last] = shortenSegment(parts[last]);
  return parts.join("/");
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

/**
 * Where the IMPORT browser opens. Importing means pulling files OFF the
 * phone, so Android starts at shared storage instead of the app sandbox;
 * elsewhere there is nothing but the app documents dir.
 */
export function getImportBrowserBase(): string {
  if (Platform.OS === "android") return "/sdcard/";
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
