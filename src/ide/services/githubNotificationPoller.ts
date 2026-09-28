import { AppConfig, loadConfig, normalizeNotificationRouting, subscribeConfigChanges, NotificationChannel } from "./configService";
import { isGitHubSignedIn } from "./gitHubApi";
import { fetchNotifications } from "./gitHubAccountService";
import { notify } from "./notificationService";

/**
 * Polls the GitHub notifications inbox while the app lives and raises a
 * global notification for threads that appeared since the last tick. The
 * first successful poll only seeds the seen-set (no burst on launch).
 * GitHub's own poll interval is ~60s; we match it and skip ticks while a
 * request is in flight or the source is routed off.
 */

const POLL_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let unsubConfig: (() => void) | null = null;
let seen: Set<string> | null = null;
let channel: NotificationChannel = "banner";
let inFlight = false;

async function tick(): Promise<void> {
  if (inFlight) return;
  if (channel === "off") {
    seen = null;
    return;
  }
  if (!(await isGitHubSignedIn())) {
    seen = null;
    return;
  }
  inFlight = true;
  try {
    const res = await fetchNotifications({ limit: 50 });
    if (!res.ok) return;
    const unread = res.data.filter((n) => n.unread);
    if (!seen) {
      seen = new Set(unread.map((n) => n.id));
      return;
    }
    const fresh = unread.filter((n) => !seen!.has(n.id));
    for (const n of unread) seen!.add(n.id);
    if (fresh.length === 0) return;
    if (fresh.length === 1) {
      const n = fresh[0];
      notify({
        source: "github",
        tone: "info",
        title: n.subjectTitle || "GitHub notification",
        message: n.repoFullName,
      });
    } else {
      notify({
        source: "github",
        tone: "info",
        title: `${fresh.length} new GitHub notifications`,
        message: fresh.slice(0, 3).map((n) => n.subjectTitle).join(" · "),
      });
    }
  } finally {
    inFlight = false;
  }
}

export function startGithubNotificationPoller(): void {
  if (timer) return;
  const sync = (cfg: AppConfig) => {
    channel = normalizeNotificationRouting(cfg.notifications).github;
  };
  void loadConfig()
    .then(sync)
    .catch(() => {});
  unsubConfig = subscribeConfigChanges(sync);
  timer = setInterval(() => {
    void tick();
  }, POLL_MS);
  void tick();
}

export function stopGithubNotificationPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  unsubConfig?.();
  unsubConfig = null;
  seen = null;
}