import React from "react";
import { View } from "react-native";
import { useTheme } from "../../../theme/themeContext";
import { TerminalView } from "../TerminalView";
import { HostingHeading } from "./HostingSections";

/**
 * The Host tab's terminal pane.
 *
 * It does NOT re-implement a terminal: it renders the SAME component the
 * Terminal tab renders (`TerminalView`) and therefore the same session
 * machinery (`useTerminalSession` -> native `startPtySession`, XtermView's
 * stream subscription). Given this panel's `workspaceId`, that machinery
 * starts the shell in the hosted project's own directory, so the user can watch
 * the server and run commands while hosting.
 *
 * Why a distinct session id: the Terminal tab's instance owns the well-known
 * id "session-1". The embedded instance owns "host-session" so the two never
 * alias the same native PTY — distinct ids are already the app's design
 * (`run-session` does exactly this). That is what makes the lifecycle safe: on
 * unmount this pane stops ONLY its own shell and drops ONLY its own listeners,
 * so leaving the Host tab can never kill the Terminal tab's session.
 *
 * Lifecycle: mounted only while the Host tab is the visible bottom tab
 * (`visible`). Unmounting runs `useTerminalSession`'s cleanup (stop the shell)
 * and `XtermView`'s cleanup (remove the data + exit listeners) — no leaked
 * session, no leaked listeners. When hidden it is not mounted at all, so it
 * cannot steal focus; and because the hosting service runs its server detached
 * (nohup into /tmp/astra-*.log), starting/stopping this shell never disturbs the
 * service's own logging.
 */
export function HostingTerminal({
  workspaceId,
  visible,
}: {
  workspaceId?: string;
  visible?: boolean;
}) {
  const { theme } = useTheme();
  if (!visible) return null;

  return (
    <View
      style={{
        flex: 1,
        minHeight: 0,
        borderTopWidth: 1,
        borderTopColor: theme.border,
        paddingHorizontal: 12,
        paddingTop: 8,
        backgroundColor: theme.bgPrimary,
      }}
    >
      <HostingHeading title="Terminal" icon="terminal-outline" />
      <View style={{ flex: 1, minHeight: 0, marginTop: 4 }}>
        {/* Same component + machinery as the Terminal tab; its own session id. */}
        <TerminalView workspaceId={workspaceId} initialSessionId="host-session" visible />
      </View>
    </View>
  );
}
