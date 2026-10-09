/**
 * The guest-side readiness probe for a starting server.
 *
 * WHY ITS OWN MODULE: this command used to be inline and used `curl` alone.
 * The base Debian guest ships NO curl, wget or nc, and executeCommand runs the
 * command under /bin/sh (dash) — whose /dev/tcp is unavailable — so the probe
 * never emitted READY and every run ended on "the server started but never
 * answered" while the server was in fact serving. Measured in the guest:
 * `curl: command not found` ×20, then CHECKED, against a Laravel server whose
 * own log said "Server running on [http://0.0.0.0:8000]". Keeping the exact
 * command in one pure function means a headless test can run the same string
 * the app ships.
 *
 * Order of preference on every tick:
 *   1. curl, then wget  — a real HTTP status is the strong signal (any status
 *      counts, including a 500: it proves the port is listening).
 *   2. php, then perl    — a bare TCP connect that needs no HTTP client at all.
 *      php is guaranteed because the plan installs it before serving; perl is
 *      in the base image. Every tier is tried each tick, so a present-but-broken
 *      client (e.g. curl exiting 77 on a missing CA bundle) cannot mask a port
 *      that is genuinely listening.
 */

/** The per-tick check: exit 0 the moment the server answers. */
export function portAnswerCheck(port: number): string {
  return (
    `{ { command -v curl >/dev/null 2>&1 && curl -s -o /dev/null --max-time 2 http://127.0.0.1:${port}/; } ` +
    `|| { command -v wget >/dev/null 2>&1 && wget -q -O /dev/null --timeout=2 http://127.0.0.1:${port}/; } ` +
    `|| { command -v php >/dev/null 2>&1 && php -r 'exit(@fsockopen("127.0.0.1",${port},$e,$m,2)?0:1);'; } ` +
    `|| { command -v perl >/dev/null 2>&1 && perl -MIO::Socket::INET -e 'exit(IO::Socket::INET->new(PeerAddr=>"127.0.0.1",PeerPort=>${port},Timeout=>2)?0:1);'; }; }`
  );
}

/**
 * ONE guest command that polls for up to `ticks` seconds and echoes READY the
 * moment the port answers, else CHECKED when the budget runs out. The loop
 * lives INSIDE the guest, so a poll is a single PRoot start — never a fresh
 * guest process per second, which is what starved the guest for minutes.
 */
export function portReadinessCommand(port: number, ticks = 20): string {
  const list = Array.from({ length: ticks }, (_, i) => i + 1).join(" ");
  return `for i in ${list}; do { ${portAnswerCheck(port)}; } && { echo READY; break; }; sleep 1; done; echo CHECKED`;
}
