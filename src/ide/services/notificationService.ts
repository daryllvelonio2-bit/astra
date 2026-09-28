import { Platform } from "react-native";
import {
  DEFAULT_NOTIFICATION_ROUTING,
  NotificationChannel,
  NotificationRouting,
  loadConfig,
  normalizeNotificationRouting,
  subscribeConfigChanges,
} from "./configService";
import { showSystemNotification } from "../../../modules/linux-runner/src";
import { ideActionService } from "./ideActionService";

/**
 * Global notification hub. One entry point for every "something finished"
 * event (GitHub inbox, terminal runs, agent tasks, app toasts). Each source
 * is routed by the user preference saved in Settings → General to either the
 * in-app right-side banner (GlobalNotificationBanner, 8s TTL) or the Android
 * status bar via the LinuxRunner native module; system delivery falls back to
 * the banner when the OS denies the POST_NOTIFICATIONS permission.
 *
 * Callable from anywhere, no hooks needed (same pattern as showAppDialog).
 */

export type NotifySource = "github" | "terminal" | "agent" | "app";
export type NotifyTone = "info" | "success" | "error" | "warning";

export interface NotifyOptions {
  source: NotifySource;
  title: string;
  message?: string;
  tone?: NotifyTone;
  /** Override the saved routing for this one notification. */
  channel?: NotificationChannel;
}

export interface BannerItem {
  id: number;
  source: NotifySource;
  tone: NotifyTone;
  title: string;
  message: string;
}

export const BANNER_TTL_MS = 8000;
const MAX_BANNERS = 4;

let routing: NotificationRouting = { ...DEFAULT_NOTIFICATION_ROUTING };
void loadConfig()
  .then((c) => {
    routing = normalizeNotificationRouting(c.notifications);
  })
  .catch(() => {});
subscribeConfigChanges((c) => {
  routing = normalizeNotificationRouting(c.notifications);
});

let banners: BannerItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeBanners(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getBanners(): BannerItem[] {
  return banners;
}

export function dismissBanner(id: number): void {
  const next = banners.filter((b) => b.id !== id);
  if (next.length === banners.length) return;
  banners = next;
  emit();
}

function pushBanner(item: BannerItem): void {
  banners = [...banners, item].slice(-MAX_BANNERS);
  emit();
  setTimeout(() => dismissBanner(item.id), BANNER_TTL_MS);
}

/** Fire a notification through the routing saved in Settings → General. */
export function notify(options: NotifyOptions): void {
  const channel = options.channel ?? routing[options.source];
  if (channel === "off") return;
  const item: BannerItem = {
    id: nextId++,
    source: options.source,
    tone: options.tone ?? "info",
    title: options.title,
    message: options.message ?? "",
  };
  if (channel === "system" && Platform.OS === "android") {
    if (showSystemNotification(item.title, item.message || item.title)) return;
    // Permission denied or native missing: fall through to the banner.
  }
  pushBanner(item);
}

// Legacy SHOW_TOAST emitters (ideActionService) had no subscriber — route
// them through the banner so they are actually visible.
ideActionService.subscribe("SHOW_TOAST", ({ message, type }) => {
  notify({
    source: "app",
    title: message,
    tone: type === "success" ? "success" : type === "warning" ? "warning" : "info",
  });
});