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

/** Bracket each name's first char so a command line containing it cannot self-match. */
const CMDLINE_PATTERNS = [
  "[c]omposer",
  "[a]rtisan serve",
  "php -[S]",
  // The process actually holding the dev-server port is a BARE php: `php artisan serve`
  // spawns an inner php whose command line is just "php" (or php8.4), which no other
  // pattern here matches. Seen on the device as a leftover php holding 0.0.0.0:8000 and
  // making the next run fail with "Address already in use". This reap runs before anything
  // of ours starts, so a bare php can only be a leftover server.
  "[p]hp",
  "http[.]server",
  "npm [r]un dev",
  "cloudflared [t]unnel",
  "localhost[.]run",
];
const DEFUNCT_NAME_PATTERN = "[c]omposer|[a]rtisan|[p]hp|[n]ode|[n]pm|[c]loudflared|[s]sh|[p]ython";

/**
 * Kill any server, tunnel or composer left over from a previous run — before a
 * new run starts, and when one is cancelled or stopped — so an orphan cannot
 * hold the guest hostage. ONE in-guest command (killing is cheap; spawning a
 * guest process under PRoot is not) that also clears the pid files and reports
 * what it did in plain words.
 *
 * WHY IT NO LONGER USES pgrep/pkill/ps: the guest has NONE of them — they are
 * not in the base image and not in the toolchain's apt list (measured in the
 * guest: `pgrep: NOT FOUND`), so the old `pgrep -f` loop printed "not found"
 * into a discarded stderr and killed nothing. The composer left alive for hours
 * on the phone was exactly that. This walks /proc itself instead (always
 * present) and matches each pattern with grep -E.
 *
 * WHY IT REPORTS DEFUNCT SEPARATELY: a zombie leftover — comm truncated to the
 * kernel's 15-char limit, EMPTY cmdline — is invisible to any cmdline match and
 * cannot be signalled at all (`kill -9` returns 0 and it survives). Rather than
 * claim success it is named plainly, so a stuck composer is never a silent lie.
 */
export async function killStaleGuestProcesses(run: GuestRunner): Promise<string> {
  const P = JSON.stringify(CMDLINE_PATTERNS.join("|"));
  const C = JSON.stringify(DEFUNCT_NAME_PATTERN);
  const cmd = [
    `P=${P}; C=${C};`,
    // 1. collect every live process whose command line matches a pattern
    `hits="";`,
    `for d in /proc/[0-9]*; do`,
    `  c=$(tr '\\0' ' ' < "$d/cmdline" 2>/dev/null) || continue;`,
    `  [ -n "$c" ] || continue;`,
    `  printf '%s' "$c" | grep -qE "$P" || continue;`,
    `  hits="$hits $(basename "$d")";`,
    `done;`,
    // 2. TERM, then KILL whatever survives
    `for p in $hits; do kill "$p" 2>/dev/null; done; sleep 2;`,
    `for p in $hits; do [ -e /proc/$p ] || continue; kill -9 "$p" 2>/dev/null; done; sleep 1;`,
    // 3. count reaped, name survivors (with their state)
    `k=0; left="";`,
    `for p in $hits; do`,
    `  if [ -e /proc/$p ]; then`,
    `    st=$(sed -n 's/^.*) //p' /proc/$p/stat 2>/dev/null | cut -d' ' -f1);`,
    `    [ -n "$st" ] || st=?;`,
    `    left="$left $p:$st";`,
    `  else k=$((k+1)); fi;`,
    `done;`,
    // 4. defunct leftovers a cmdline scan cannot even see (state Z)
    `def="";`,
    `for d in /proc/[0-9]*; do`,
    `  st=$(sed -n 's/^.*) //p' "$d/stat" 2>/dev/null | cut -d' ' -f1);`,
    `  [ "$st" = Z ] || continue;`,
    `  cm=$(cat "$d/comm" 2>/dev/null);`,
    `  printf '%s' "$cm" | grep -qE "$C" || continue;`,
    `  def="$def $(basename "$d"):$cm";`,
    `done;`,
    `echo "KILLED:$k"; echo "LEFT:$left"; echo "DEFUNCT:$def";`,
    `rm -f /tmp/astra-host.pid /tmp/astra-tunnel.pid /tmp/astra-prep.pid 2>/dev/null; true`,
  ].join("\n");

  const res = await run(cmd);
  const field = (re: RegExp) => ((res.out.match(re) || [])[1] || "").trim();
  const killed = Number(field(/^KILLED:(\d+)/m) || 0);
  const left = field(/^LEFT:(.*)$/m);
  const defunct = field(/^DEFUNCT:(.*)$/m);

  const parts: string[] = [];
  if (killed) parts.push(`${killed} leftover process(es) cleared`);
  if (left) parts.push(`still running: ${left}`);
  if (defunct) parts.push(`defunct and cannot be signalled (cleared only when the guest restarts): ${defunct}`);
  return parts.join("; ");
}
