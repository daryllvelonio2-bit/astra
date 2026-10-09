/**
 * Guest hygiene at a run boundary, and the rule that a dead run cannot strand
 * the panel.
 *
 * A detached composer / cloudflared / php -S outlives the JS object that
 * started it — the five-and-a-half-hour composer zombie found alive on the
 * phone was exactly that — and an in-memory status can survive a Fast Refresh
 * while its async function is gone. Both are cleared explicitly: ONE guest
 * invocation that kills and reports, and one pure predicate the panel uses to
 * fall back to idle when no run is actually in flight.
 */

/** Statuses that mean "a run is in progress" — the panel offers Cancel for these. */
export const TRANSIENT_HOST_STATUSES = ["checking", "installing", "starting", "tunneling"] as const;

export function isTransientHostStatus(status: string): boolean {
  return (TRANSIENT_HOST_STATUSES as readonly string[]).includes(status);
}

/** Guest runner shape shared with hostingService. */
export type GuestRunner = (command: string) => Promise<{ code: number; out: string }>;

/**
 * Kill any server, tunnel or composer left over from a previous run — before a
 * new run starts, and when one is cancelled or stopped — so an orphan cannot
 * hold the guest hostage. ONE in-guest command (killing is cheap; spawning a
 * guest process under PRoot is not) that also clears the pid files and reports
 * what it killed in plain words.
 *
 * WHY THE PATTERNS ARE BRACKETED (`[c]omposer`): `pgrep -f` matches against a
 * full command line, and this very command line contains the pattern text — so
 * a plain "composer" pattern matches the shell running the kill and the loop
 * terminates ITSELF. The bracket makes the regex match a real "composer"
 * process while the literal text in our own command line ("[c]omposer") does
 * not match it.
 */
export async function killStaleGuestProcesses(run: GuestRunner): Promise<string> {
  const patterns = [
    "[c]omposer",
    "[a]rtisan serve",
    "php -[S]",
    "http[.]server",
    "npm [r]un dev",
    "cloudflared [t]unnel",
    "localhost[.]run",
  ];
  // The echoed token is a fixed word: echoing a plain name ("composer") would
  // put the pattern's own text back into this command line and self-match.
  const killLoop = patterns
    .map(
      (re) =>
        `for pid in $(pgrep -f ${JSON.stringify(re)} 2>/dev/null); do ` +
        `kill $pid 2>/dev/null && echo killed; done; `
    )
    .join("");
  const cmd =
    killLoop +
    "rm -f /tmp/astra-host.pid /tmp/astra-tunnel.pid /tmp/astra-prep.pid 2>/dev/null; " +
    "true";
  const res = await run(cmd);
  const killed = res.out.split("\n").map((l) => l.trim()).filter(Boolean);
  return killed.length ? `${killed.length} leftover process(es) cleared` : "";
}
