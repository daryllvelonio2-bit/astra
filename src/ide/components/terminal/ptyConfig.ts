/**
 * Phase 2 feature flag. true = PTY-backed sessions rendered with xterm.js;
 * false = legacy pipe sessions with the RN scrollback renderer.
 * Task tabs always use the legacy renderer (read-only logs).
 */
export const PTY_XTERM_ENABLED = true;
