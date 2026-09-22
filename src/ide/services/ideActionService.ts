export type IDEActionType =
  | "OPEN_FILE"
  | "OPEN_BROWSER"
  | "OPEN_TERMINAL"
  | "RUN_IN_TERMINAL"
  | "SWITCH_TAB"
  | "SWITCH_WORKSPACE"
  | "SHOW_TOAST";

export interface OpenFilePayload {
  filePath: string;
  line?: number;
  workspaceId?: string;
  userInitiated?: boolean;
}

export interface OpenBrowserPayload {
  url: string;
  port?: number;
  userInitiated?: boolean;
}

export interface OpenTerminalPayload {
  sessionId?: string;
  workspaceId?: string;
  userInitiated?: boolean;
}

export interface RunInTerminalPayload {
  /** Shell command to execute in the guest. */
  command: string;
  /** One-line label echoed above the output, e.g. "⚡ Run: node main.js". */
  header?: string;
  workspaceId?: string;
  userInitiated?: boolean;
}

export interface SwitchTabPayload {
  tab: "editor" | "terminal" | "browser" | "git";
  userInitiated?: boolean;
}

export interface SwitchWorkspacePayload {
  workspaceId: string;
}

export interface ShowToastPayload {
  message: string;
  type?: "info" | "success" | "warning";
}

export type IDEActionPayloadMap = {
  OPEN_FILE: OpenFilePayload;
  OPEN_BROWSER: OpenBrowserPayload;
  OPEN_TERMINAL: OpenTerminalPayload;
  RUN_IN_TERMINAL: RunInTerminalPayload;
  SWITCH_TAB: SwitchTabPayload;
  SWITCH_WORKSPACE: SwitchWorkspacePayload;
  SHOW_TOAST: ShowToastPayload;
};

export interface IDEActionEvent<T extends IDEActionType = IDEActionType> {
  type: T;
  payload: IDEActionPayloadMap[T];
  timestamp: number;
}

type ActionListener<T extends IDEActionType = IDEActionType> = (
  payload: IDEActionPayloadMap[T]
) => void;
type GlobalActionListener = (event: IDEActionEvent) => void;

class IDEActionServiceImpl {
  private listeners: Map<IDEActionType, Set<ActionListener<any>>> = new Map();
  private globalListeners: Set<GlobalActionListener> = new Set();
  private pending: Map<IDEActionType, IDEActionEvent<any>> = new Map();

  /**
   * Subscribe to a specific IDE action event.
   */
  subscribe<T extends IDEActionType>(
    actionType: T,
    listener: ActionListener<T>
  ): () => void {
    if (!this.listeners.has(actionType)) {
      this.listeners.set(actionType, new Set());
    }
    const set = this.listeners.get(actionType)!;
    set.add(listener);

    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(actionType);
      }
    };
  }

  /**
   * Subscribe to all IDE action events.
   */
  subscribeAll(listener: GlobalActionListener): () => void {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  /**
   * Emit an IDE action event to all subscribers.
   * Navigation-bearing events are also stored as sticky pending actions so a
   * screen mounted after the emit (e.g. editor after fullscreen chat) can consume them.
   */
  emit<T extends IDEActionType>(type: T, payload: IDEActionPayloadMap[T]) {
    const event: IDEActionEvent<T> = {
      type,
      payload,
      timestamp: Date.now(),
    };

    if (
      type === "OPEN_FILE" ||
      type === "OPEN_BROWSER" ||
      type === "OPEN_TERMINAL" ||
      type === "RUN_IN_TERMINAL" ||
      type === "SWITCH_TAB"
    ) {
      this.pending.set(type, event as IDEActionEvent<any>);
    }

    const specificSet = this.listeners.get(type);
    if (specificSet) {
      specificSet.forEach((listener) => {
        try {
          listener(payload);
        } catch (e) {
          console.error(`Error in IDE action listener for ${type}:`, e);
        }
      });
    }

    this.globalListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (e) {
        console.error("Error in global IDE action listener:", e);
      }
    });
  }

  /**
   * Consume (read + clear) the last sticky event for a type.
   * Returns null when absent or older than maxAgeMs (default 5 min).
   */
  consumePendingAction<T extends IDEActionType>(type: T, maxAgeMs = 5 * 60 * 1000): IDEActionEvent<T> | null {
    const event = this.pending.get(type) as IDEActionEvent<T> | undefined;
    if (!event) return null;
    this.pending.delete(type);
    if (Date.now() - event.timestamp > maxAgeMs) return null;
    return event;
  }

  /**
   * Helper: Instruct the IDE to open and display a file in the editor.
   * Pass userInitiated=true for explicit user taps so fullscreen chat can navigate.
   */
  openFile(filePath: string, line?: number, workspaceId?: string, userInitiated = false) {
    this.emit("OPEN_FILE", { filePath, line, workspaceId, userInitiated });
  }

  /**
   * Helper: Instruct the IDE to navigate the Web Browser preview.
   */
  openBrowser(url: string, port?: number, userInitiated = false) {
    this.emit("OPEN_BROWSER", { url, port, userInitiated });
  }

  /**
   * Helper: Instruct the IDE to switch to the terminal.
   */
  openTerminal(sessionId?: string, workspaceId?: string, userInitiated = false) {
    this.emit("OPEN_TERMINAL", { sessionId, workspaceId, userInitiated });
  }

  /**
   * Helper: Execute a shell command in the terminal's dedicated Run session.
   */
  runInTerminal(command: string, header?: string, workspaceId?: string, userInitiated = false) {
    this.emit("RUN_IN_TERMINAL", { command, header, workspaceId, userInitiated });
  }

  /**
   * Helper: Instruct the IDE to switch bottom tabs.
   */
  switchTab(tab: "editor" | "terminal" | "browser" | "git", userInitiated = false) {
    this.emit("SWITCH_TAB", { tab, userInitiated });
  }

  /**
   * Helper: Instruct the app to switch active workspace.
   */
  switchWorkspace(workspaceId: string) {
    this.emit("SWITCH_WORKSPACE", { workspaceId });
  }

  /**
   * Helper: Show a toast notification in the UI.
   */
  showToast(message: string, type: "info" | "success" | "warning" = "info") {
    this.emit("SHOW_TOAST", { message, type });
  }
}

export const ideActionService = new IDEActionServiceImpl();
