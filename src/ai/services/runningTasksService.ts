import { PRootService } from "../../ide/services/prootService";
import { terminateServer } from "./processTreeKill";
import { inspectAndRegisterFromText as inspectText } from "./runningTasksInspect";

export interface RunningTask {
  id: string;
  command: string;
  pid?: number;
  url?: string;
  port?: number;
  workspaceId?: string;
  startTime: number;
  status: "running" | "stopped";
  output?: string;
}

type TaskListener = (tasks: RunningTask[]) => void;
type TriggerListener = (taskId?: string) => void;

/** Banner meta line. PID omitted when unknown — never a placeholder word in the PID slot. */
function buildTaskBanner(command: string, pid: number | undefined, dateStr: string, port?: number, url?: string): string {
  const meta = [pid ? `PID: ${pid}` : null, `Started: ${dateStr}`, port ? `Port: ${port}` : null, url ? `URL: ${url}` : null].filter(Boolean).join(" | ");
  return `\u001b[1;34m⚡ Background Task: \u001b[1;37m${command}\u001b[0m\r\n\u001b[90m${meta}\u001b[0m\r\n\u001b[90m--------------------------------------------------\u001b[0m\r\n`;
}

class RunningTasksServiceImpl {
  private tasks: Map<string, RunningTask> = new Map();
  private listeners: Set<TaskListener> = new Set();
  private triggerListeners: Set<TriggerListener> = new Set();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private verifying = false;
  // Coalesces output-flood notifies into one per ~150ms (appendOutput can
  // fire per log chunk; subscribers re-render per notify).
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Periodically verify if processes are still running in PRoot.
    // 8s cadence: each poll spawns 2 PRoot commands + per-task HTTP probes.
    this.pollInterval = setInterval(() => {
      if (this.tasks.size > 0) {
        this.verifyProcesses();
      }
    }, 8000);
  }

  /**
   * Subscribe to terminal trigger events (when a background task starts).
   */
  subscribeTrigger(listener: TriggerListener): () => void {
    this.triggerListeners.add(listener);
    return () => {
      this.triggerListeners.delete(listener);
    };
  }

  /**
   * Trigger the IDE to open and display the terminal for a task.
   */
  triggerTerminal(taskId?: string) {
    this.triggerListeners.forEach((l) => {
      try {
        l(taskId);
      } catch (_) {}
    });
  }

  /**
   * Register or merge a running background task/server with full deduplication.
   */
  addTask(taskInfo: {
    command: string;
    pid?: number;
    url?: string;
    port?: number;
    workspaceId?: string;
  }): RunningTask {
    let port = taskInfo.port;
    let url = taskInfo.url;
    let command = (taskInfo.command || "Background Server").trim();

    // 1. Extract port and normalize URL
    if (!port && url) {
      const pMatch = url.match(/:(\d+)$/);
      if (pMatch) port = parseInt(pMatch[1], 10);
    }
    if (!port && command) {
      const pMatch = command.match(/(?:--port|-p)\s+(\d{2,5})|:(\d{4,5})/i);
      if (pMatch) port = parseInt(pMatch[1] || pMatch[2], 10);
    }
    if (!url && port) {
      url = `http://127.0.0.1:${port}`;
    }
    if (url) {
      url = url.replace(/localhost/gi, "127.0.0.1").replace(/0\.0\.0\.0/g, "127.0.0.1");
    }

    // 2. Search for existing matching task to merge
    let existingTask: RunningTask | undefined;

    for (const task of this.tasks.values()) {
      // Match by PID
      if (taskInfo.pid && task.pid && task.pid === taskInfo.pid) {
        existingTask = task;
        break;
      }
      // Match by Port
      if (port && task.port && task.port === port) {
        existingTask = task;
        break;
      }
      // Match by URL
      if (url && task.url && (task.url === url || task.url.replace(/localhost/gi, "127.0.0.1") === url)) {
        existingTask = task;
        break;
      }
      // Match by Command similarity
      const isExpo = /expo\s+start/i.test(command) && /expo\s+start/i.test(task.command);
      const isPhp = /artisan\s+serve/i.test(command) && /artisan\s+serve/i.test(task.command);
      const isVite = /vite/i.test(command) && /vite/i.test(task.command);
      if (isExpo || isPhp || isVite || (task.command === command && command !== "Background Server")) {
        existingTask = task;
        break;
      }
    }

    if (existingTask) {
      // Merge updates into existing task
      let changed = false;
      if (taskInfo.pid && !existingTask.pid) {
        existingTask.pid = taskInfo.pid;
        changed = true;
        // The banner is baked into output at creation (before the PID was
        // known) — patch it so it doesn't keep showing a PID-less line.
        if (existingTask.output && existingTask.output.includes("PID: Active")) {
          existingTask.output = existingTask.output.replace("PID: Active", `PID: ${taskInfo.pid}`);
        }
      }
      if (url && !existingTask.url) {
        existingTask.url = url;
        changed = true;
      }
      if (port && !existingTask.port) {
        existingTask.port = port;
        changed = true;
      }
      if (taskInfo.workspaceId && !existingTask.workspaceId) {
        existingTask.workspaceId = taskInfo.workspaceId;
        changed = true;
      }
      if (
        (existingTask.command === "Background Server" || existingTask.command.length < 5) &&
        command !== "Background Server"
      ) {
        existingTask.command = command;
        changed = true;
      }

      if (changed) {
        this.notify();
      }
      // No auto-navigation: background registration must never steal focus.
      // The task surfaces via RunningTasksBar; explicit user taps navigate.
      return existingTask;
    }

    // 3. Register brand new task
    const id = taskInfo.pid
      ? `task-pid-${taskInfo.pid}`
      : port
      ? `task-port-${port}`
      : `task-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    const dateStr = new Date().toLocaleTimeString();
    const initBanner = buildTaskBanner(command, taskInfo.pid, dateStr, port, url);

    const task: RunningTask = {
      id,
      command,
      pid: taskInfo.pid,
      url,
      port,
      workspaceId: taskInfo.workspaceId,
      startTime: Date.now(),
      status: "running",
      output: initBanner,
    };

    this.tasks.set(id, task);
    this.notify();
    // No auto-navigation: background registration must never steal focus.
    return task;
  }

  /**
   * Append live log or command output to a specific running task.
   */
  appendOutput(idOrPid: string | number, text: string) {
    if (!text) return;
    let targetTask: RunningTask | undefined;

    if (typeof idOrPid === "number" || /^\d+$/.test(String(idOrPid))) {
      const numPid = typeof idOrPid === "number" ? idOrPid : parseInt(idOrPid, 10);
      for (const t of this.tasks.values()) {
        if (t.pid === numPid) {
          targetTask = t;
          break;
        }
      }
    } else {
      targetTask = this.tasks.get(idOrPid);
    }

    if (!targetTask && this.tasks.size > 0) {
      // Fallback to most recently started running task
      const all = Array.from(this.tasks.values());
      targetTask = all[all.length - 1];
    }

    if (targetTask) {
      const cleanText = text.endsWith("\n") || text.endsWith("\r") ? text : `${text}\r\n`;
      targetTask.output = (targetTask.output || "") + cleanText;
      // Hysteresis trim: copy only when well past the cap, not per chunk.
      if (targetTask.output.length > 60000) {
        targetTask.output = targetTask.output.slice(-40000);
      }
      this.scheduleNotify();
    }
  }

  /** Trailing-edge notify for high-frequency output appends. */
  private scheduleNotify() {
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      this.notify();
    }, 150);
  }

  /**
   * Find a task flexibly by full ID, stripped ID, port, or PID.
   */
  findTask(id: string): RunningTask | undefined {
    let task = this.tasks.get(id);
    if (!task && !id.startsWith("task-")) {
      task = this.tasks.get(`task-${id}`);
    }
    if (!task) {
      task = Array.from(this.tasks.values()).find(
        (t) =>
          t.id === id ||
          t.id === `task-${id}` ||
          t.id.endsWith(`-${id}`) ||
          (t.port && String(t.port) === id) ||
          (t.pid && String(t.pid) === id)
      );
    }
    return task;
  }

  /**
   * Remove a task from tracking.
   */
  removeTask(id: string) {
    const task = this.findTask(id);
    const targetId = task ? task.id : id;
    if (this.tasks.delete(targetId)) {
      this.notify();
    }
  }

  /**
   * Force remove a task from tracking immediately and execute an asynchronous
   * emergency best-effort termination so the UI is never stuck.
   */
  forceRemoveTask(id: string) {
    const task = this.findTask(id);
    const targetId = task ? task.id : id;
    if (task) {
      // Async best-effort emergency termination in background
      terminateServer(task, task.workspaceId, true).catch(() => {});
    }
    this.tasks.delete(targetId);
    this.notify();
  }

  /**
   * Kill / terminate an active running process in the Linux PRoot environment.
   */
  async killTask(id: string, force = false): Promise<boolean> {
    const task = this.findTask(id);
    if (!task) {
      if (force) {
        this.tasks.delete(id);
        this.notify();
        return true;
      }
      return false;
    }

    try {
      const stopped = await terminateServer(task, task.workspaceId, force);
      if (stopped || force) {
        this.tasks.delete(task.id);
        this.notify();
        return true;
      }
      return false;
    } catch (e) {
      console.log(`[killTask] error: ${e}`);
      if (force) {
        this.tasks.delete(task.id);
        this.notify();
        return true;
      }
      return false;
    }
  }

  /**
   * Kill all active background processes.
   */
  async killAllTasks(force = false): Promise<void> {
    const tasks = Array.from(this.tasks.values());
    for (const task of tasks) {
      await this.killTask(task.id, force);
    }
  }

  /**
   * Get all currently tracked running tasks.
   */
  getRunningTasks(): RunningTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Subscribe to running task changes.
   */
  subscribe(listener: TaskListener): () => void {
    this.listeners.add(listener);
    listener(this.getRunningTasks());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const taskList = this.getRunningTasks();
    this.listeners.forEach((l) => {
      try {
        l(taskList);
      } catch (_) {}
    });
  }

  /**
   * Check running processes via active port probes, ps, and netstat to maintain accurate task state.
   */
  async verifyProcesses() {
    // Overlap guard: one poll spawns 2+ proot commands; a new poll every 5s
    // while the last is still running piles up spawns and wedges kills.
    if (this.verifying) return;
    this.verifying = true;
    try {
      const psRes = await PRootService.runCommand("ps -ef 2>/dev/null || ps aux 2>/dev/null");
      const psOutput = psRes?.stdout || "";
      const lowerPs = psOutput.toLowerCase();
      let netOutput = "";
      try {
        const netRes = await PRootService.runCommand("netstat -tlpn 2>/dev/null || ss -tlpn 2>/dev/null");
        netOutput = netRes?.stdout || "";
      } catch (_) {}

      let changed = false;
      const now = Date.now();

      for (const [id, task] of this.tasks.entries()) {
        let isAlive = false;

        // 1. Direct active HTTP port probe (guarantees accuracy if server is responding)
        if (task.port) {
          try {
            const probeUrl = `http://127.0.0.1:${task.port}/`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1200);
            const res = await fetch(probeUrl, {
              method: "GET",
              signal: controller.signal,
            }).catch(() => null);
            clearTimeout(timeoutId);

            if (res) {
              isAlive = true;
            }
          } catch (_) {}
        }

        // 2. PID verification
        if (!isAlive && task.pid) {
          const pidPattern = new RegExp(`\\b${task.pid}\\b`);
          if (pidPattern.test(psOutput)) {
            isAlive = true;
          }
        }

        // 3. Port in netstat (if supported by kernel)
        if (!isAlive && task.port && netOutput) {
          const portPattern = new RegExp(`[:.]${task.port}\\b`);
          if (portPattern.test(netOutput)) {
            isAlive = true;
          }
        }

        // 4. Command name & runtime daemon inspection in ps
        if (!isAlive) {
          const lowerCmd = (task.command || "").toLowerCase();

          if (/artisan|php/i.test(lowerCmd) && (/artisan/i.test(lowerPs) || /php/i.test(lowerPs) || /php83/i.test(lowerPs))) {
            isAlive = true;
          } else if (/expo|metro/i.test(lowerCmd) && (/expo/i.test(lowerPs) || /metro/i.test(lowerPs) || /node/i.test(lowerPs))) {
            isAlive = true;
          } else if (/vite/i.test(lowerCmd) && (/vite/i.test(lowerPs) || /node/i.test(lowerPs))) {
            isAlive = true;
          } else if (/http\.server|python/i.test(lowerCmd) && (/python/i.test(lowerPs) || /http\.server/i.test(lowerPs))) {
            isAlive = true;
          } else if (/node|npm/i.test(lowerCmd) && /node/i.test(lowerPs)) {
            isAlive = true;
          } else {
            const cleanCmd = task.command.replace(/^[a-z0-9_\-./]+\//i, "").trim().toLowerCase();
            if (cleanCmd && cleanCmd.length > 3 && !["node", "npm", "sh", "bash"].includes(cleanCmd)) {
              if (lowerPs.includes(cleanCmd)) {
                isAlive = true;
              }
            }
          }
        }

        // 5. 60-second startup grace period for newly started background servers
        if (!isAlive && now - task.startTime < 60000) {
          isAlive = true;
        }

        if (!isAlive) {
          this.tasks.delete(id);
          changed = true;
        }
      }

      if (changed) {
        this.notify();
      }
    } catch (_) {} finally {
      this.verifying = false;
    }
  }

  /**
   * Inspect text from the AI assistant or tool calls to automatically extract background tasks.
   */
  inspectAndRegisterFromText(text: string, workspaceId?: string): RunningTask | null {
    return inspectText(text, workspaceId, (seed) => this.addTask(seed));
  }
}

export const runningTasksService = new RunningTasksServiceImpl();
