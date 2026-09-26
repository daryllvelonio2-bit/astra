/**
 * Single source of truth for the Shortcuts help tab. Every entry was verified
 * against the implementation (useKeyboardShortcuts for tabs, the installed
 * @codemirror/* keymaps actually bundled in codemirror-entry.js for editing).
 * Do not add entries from memory — check the keymap first.
 */

export interface ShortcutItem {
  /** Display form, e.g. "Ctrl F". */
  keys: string;
  action: string;
  /** Touch equivalent, when one exists. Omit when keyboard-only. */
  touch?: string;
}

export interface ShortcutGroup {
  title: string;
  items: ShortcutItem[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Tabs",
    items: [
      { keys: "Ctrl E", action: "Editor tab", touch: "Bottom bar" },
      { keys: "Ctrl T", action: "Terminal tab", touch: "Bottom bar" },
      { keys: "Ctrl B", action: "Browser tab", touch: "Bottom bar" },
      { keys: "Ctrl G", action: "Git tab", touch: "Bottom bar" },
    ],
  },
  {
    title: "Find & replace",
    items: [
      { keys: "Ctrl F", action: "Open find panel", touch: "Editor ⋯ → Find & Replace" },
      { keys: "F3", action: "Next match" },
      { keys: "Ctrl D", action: "Select next occurrence" },
      { keys: "Esc", action: "Close find panel" },
    ],
  },
  {
    title: "Edit",
    items: [
      { keys: "Ctrl Z", action: "Undo" },
      { keys: "Ctrl Shift Z", action: "Redo" },
      { keys: "Ctrl /", action: "Toggle comment" },
      { keys: "Ctrl A", action: "Select all" },
      { keys: "Tab", action: "Indent selection" },
    ],
  },
  {
    title: "Lines & cursors",
    items: [
      { keys: "Alt ↑ / ↓", action: "Move line up / down" },
      { keys: "Alt Shift ↑ / ↓", action: "Copy line up / down" },
      { keys: "Ctrl Shift K", action: "Delete line" },
      { keys: "Ctrl Alt ↑ / ↓", action: "Add cursor above / below" },
    ],
  },
  {
    title: "Go",
    items: [
      { keys: "Ctrl Alt G", action: "Go to line…" },
      { keys: "Ctrl Home", action: "Top of file" },
      { keys: "Ctrl End", action: "Bottom of file" },
    ],
  },
];

/** Shown once at the top of the Shortcuts tab. */
export const SHORTCUT_PRECEDENCE_NOTE =
  "Tab shortcuts are captured globally, so Ctrl E / T / B / G always switch tabs — they never reach the editor.";
