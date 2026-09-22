import type { RunningTask } from "./runningTasksService";

export interface TaskSeed {
  command: string;
  pid?: number;
  url?: string;
  port?: number;
  workspaceId?: string;
}

/**
 * Inspect text from the AI assistant or tool calls to automatically extract
 * background tasks. Pure parser — the caller registers via `addTask`.
 */
export function inspectAndRegisterFromText(
  text: string,
  workspaceId: string | undefined,
  addTask: (seed: TaskSeed) => RunningTask
): RunningTask | null {
  if (!text) return null;

  // Ignore scaffold, package installation, build, or file commands
  const isOneShot = /create-expo-app|create-react-app|create-vite|npm\s+(install|i|ci|build|test|audit)|yarn\s+(add|install)|apt-get\s+install|apt\s+install|pip\s+install|git\s+|mkdir|touch|cp|rm|ls\s/i.test(text);
  if (isOneShot && !/started.*server|listening on|ready in|waiting on exp:/i.test(text)) {
    return null;
  }

  // Detect Expo Go exp:// URL
  const expMatch = text.match(/(exp:\/\/[^\s\n"']+)/i);
  // Detect local server URLs (127.0.0.1, localhost, 0.0.0.0)
  const urlMatch = expMatch || text.match(/(https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0):\d+)/i);
  let url = urlMatch ? urlMatch[1] : undefined;

  let port: number | undefined;
  if (url) {
    const portMatch = url.match(/:(\d+)/);
    if (portMatch) port = parseInt(portMatch[1], 10);
  }

  // Extract port from arguments only if explicit server command
  if (!port && /(?:expo\s+start|npm\s+start|artisan\s+serve|npm\s+run\s+dev|vite|http\.server)/i.test(text)) {
    const cliPortMatch = text.match(/(?:--port|-p)\s+(\d{2,5})|:(\d{4,5})/i);
    if (cliPortMatch) {
      port = parseInt(cliPortMatch[1] || cliPortMatch[2], 10);
    }
  }

  // Detect PID only when explicit Process ID pattern is present
  const pidMatch = text.match(/(?:Process\s*ID\s*\(PID\)|\[PID:\s*(\d+)\]|\(\s*PID\s*[:=]?\s*`?(\d+)`?\s*\)|PID\s*[:=]\s*`?(\d+)`?)/i);
  const pid = pidMatch ? parseInt(pidMatch[1] || pidMatch[2] || pidMatch[3], 10) : undefined;

  let command = "Background Server";
  let isServer = false;
  if (/expo\s+start|npx\s+expo|exp:\/\//i.test(text)) {
    command = "Expo Dev Server";
    if (!port) port = 8081;
    if (!url) url = `exp://127.0.0.1:${port}`;
    isServer = true;
  } else if (/php\s+artisan\s+serve/i.test(text)) {
    command = "php artisan serve";
    if (!port) port = 8000;
    isServer = true;
  } else if (/npm\s+run\s+dev|yarn\s+dev|npx\s+vite|\bvite\s+dev\b/i.test(text)) {
    command = "npm run dev (Vite)";
    if (!port) port = 5173;
    isServer = true;
  } else if (/npm\s+start|yarn\s+start/i.test(text)) {
    command = "npm start";
    if (!port) port = 8081;
    isServer = true;
  } else if (/python[3]?\s+-m\s+http\.server(?:\s+\d+)?/i.test(text)) {
    command = "Python HTTP Server";
    if (!port) port = 8000;
    isServer = true;
  }

  if (!url && port) {
    url = `http://127.0.0.1:${port}`;
  }

  // Register if it is an actual server OR has a PID and local URL
  if ((isServer && port) || (pid && url) || expMatch) {
    return addTask({ command, pid, url, port, workspaceId });
  }

  return null;
}
