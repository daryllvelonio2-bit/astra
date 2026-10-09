/**
 * The guest-side readiness probe for a starting server.
 *
 * WHY ITS OWN MODULE: this command used to be inline and used `curl` alone,
 * which the base Debian guest does not ship — so a server that was genuinely
 * serving looked dead ("the server started but never answered"). Keeping the
 * exact command in one pure function means a headless test can run the same
 * string the app ships.
 *
 * WHY THE SERVER'S OWN LOG IS THE PRIMARY SIGNAL: a probe built only on
 * clients is blind whenever the guest cannot run one. On the real phone
 * (measured) the server WAS up — `php8.4` LISTENing on 0.0.0.0:8000, a real
 * 200 from outside — while the client-only probe never fired. Every plan's
 * server announces itself the moment it is up, into its own log file:
 *   artisan serve ->  INFO  Server running on [http://0.0.0.0:8000].
 *   php -S        ->  PHP x.y Development Server (http://0.0.0.0:8000) started
 *   vite/next/cra ->  Local: http://localhost:<port>/
 *   python http   ->  Serving HTTP on 0.0.0.0 port 8080 (http://0.0.0.0:8080/)
 * Reading that line needs no curl, no php and no perl — only grep, which the
 * base guest always has (the process reap already relies on it). It is
 * CONFIRMED against the kernel: /proc/net/tcp{,6} must show a LISTEN socket on
 * the port, so a server that announced and then died can never be called ready.
 * The log is truncated immediately before the server starts, so a stale banner
 * from a previous run cannot be present either.
 *
 * THE SECONDARY IS A BARE TCP CONNECT NEEDING NO HTTP CLIENT: php first — run
 * exactly as the plan runs it (bare `php`, PATH-resolved), with
 * PHP_INI_SCAN_DIR unset, the guest's own rule for every php call (see
 * expo-rn-app-development/references/driving-the-guest-shell.md) — then perl
 * for a guest that carries it. Every tier is tried each tick, so a
 * present-but-broken earlier tier cannot mask a port that is genuinely
 * listening.
 */

/** The per-tick check: exit 0 the moment the server is verifiably up. */
export function portAnswerCheck(port: number, logFile: string): string {
  // Primary — no client at all: the server announced a listener on THIS port
  // (grep is always present) AND the kernel has a live LISTEN socket on it.
  // `\b` stops :8000 from matching a longer number such as :80000.
  const announced = `grep -qE "https?://[^ ]*:${port}\\b" ${logFile} 2>/dev/null`;
  // The port as the kernel prints it in /proc/net/tcp{,6}: four uppercase hex
  // digits at the end of field 2 (local "IP:PORT"), field 4 (state) 0A
  // (TCP_LISTEN). Each file is read only if it exists — awk returns 2 (and
  // would mask a real match) if handed a missing file, so it is never handed
  // one. awk splits field 2, so an IPv6 address is handled the same way.
  const listening =
    `listen=0; for f in /proc/net/tcp /proc/net/tcp6; do [ -r "$f" ] || continue; ` +
    `awk -v p=$(printf '%04X' ${port}) ` +
    `'split($2,a,\":\") && toupper(a[length(a)])==p && $4==\"0A\"{x=1} END{exit x?0:1}' "$f" 2>/dev/null ` +
    `&& listen=1; done; [ "$listen" = 1 ]`;
  // Secondary — a bare TCP connect. php is guaranteed (the plan installs it
  // before serving) and is invoked the plan's way, with PHP_INI_SCAN_DIR
  // dropped so the CLI cannot be made to load zero extensions; perl is in the
  // base image as a last resort.
  const php = `command -v php >/dev/null 2>&1 && env -u PHP_INI_SCAN_DIR php -r 'exit(@fsockopen("127.0.0.1",${port},$e,$m,2)?0:1);'`;
  const perl = `command -v perl >/dev/null 2>&1 && perl -MIO::Socket::INET -e 'exit(IO::Socket::INET->new(PeerAddr=>"127.0.0.1",PeerPort=>${port},Timeout=>2)?0:1);'`;
  return `{ { ${announced}; } && { ${listening}; }; } || { ${php}; } || { ${perl}; }`;
}

/**
 * ONE guest command that polls for up to `ticks` seconds and echoes READY the
 * moment the port answers, else CHECKED when the budget runs out. The loop
 * lives INSIDE the guest, so a poll is a single PRoot start — never a fresh
 * guest process per second, which is what starved the guest for minutes.
 */
export function portReadinessCommand(port: number, logFile: string, ticks = 20): string {
  const list = Array.from({ length: ticks }, (_, i) => i + 1).join(" ");
  return `for i in ${list}; do { ${portAnswerCheck(port, logFile)}; } && { echo READY; break; }; sleep 1; done; echo CHECKED`;
}
