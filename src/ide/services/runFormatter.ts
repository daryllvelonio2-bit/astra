import { executeCommand } from "../../../modules/linux-runner/src";

export interface RunFormatOptions {
  fileName: string;
  displayName: string;
  runtime?: string;
  command: string;
  isServer?: boolean;
  url?: string;
  port?: number;
}

const RUNTIME_BADGES: Record<string, string> = {
  java: "Java OpenJDK 17",
  python3: "Python 3",
  python: "Python 3",
  node: "Node.js",
  gcc: "C (GCC)",
  "g++": "C++ (G++)",
  go: "Go",
  rustc: "Rust",
  rust: "Rust",
  php: "PHP",
  ruby: "Ruby",
  lua: "Lua",
  "lua5.4": "Lua",
  sqlite3: "SQLite",
  sh: "Shell",
  bash: "Bash",
};

export function getRuntimeBadge(runtime?: string): string {
  if (!runtime) return "Runner";
  return RUNTIME_BADGES[runtime.toLowerCase()] || runtime;
}

/**
 * Builds a clean, ANSI-colorized runner shell script that executes the project command,
 * prints an IDE-grade header banner, tracks elapsed execution time, and displays a
 * color-coded process completion footer.
 */
export function buildRunnerScript(opts: RunFormatOptions): string {
  const badge = getRuntimeBadge(opts.runtime);
  const title = opts.fileName || opts.displayName;
  const safeTitle = title.replace(/"/g, '\\"');
  const safeBadge = badge.replace(/"/g, '\\"');
  const serverBanner =
    opts.isServer && opts.url
      ? `printf "\\033[1;33m⚡ Local Server:\\033[0m \\033[1;36m%s\\033[0m\\n\\n" "${opts.url}"\n`
      : "";

  return `#!/bin/sh
_t0=$(date +%s%3N 2>/dev/null || date +%s)
printf "\\033[1;36m━━━ \\033[1;32m▶ Run:\\033[0m \\033[1;37m%s\\033[0m \\033[1;35m[%s]\\033[0m \\033[2m$(date +%%H:%%M:%%S)\\033[0m \\033[1;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m\\n\\n" "${safeTitle}" "${safeBadge}"
${serverBanner}${opts.command}
_code=$?
_t1=$(date +%s%3N 2>/dev/null || date +%s)
_diff=$((_t1 - _t0))
if [ $_diff -gt 1000 ]; then
  _dur="$((_diff / 1000)).$(( (_diff % 1000) / 100 ))s"
elif [ $_diff -gt 0 ]; then
  _dur="0.$((_diff / 100))s"
else
  _dur="0.0s"
fi
printf "\\n\\033[2m────────────────────────────────────────────────────────────\\033[0m\\n"
if [ $_code -eq 0 ]; then
  printf "\\033[1;32m✔ Process finished\\033[0m \\033[2m(exit code 0)\\033[0m \\033[36m[%s]\\033[0m\\n" "$_dur"
else
  printf "\\033[1;31m✖ Process exited\\033[0m \\033[1;31m(exit code %s)\\033[0m \\033[36m[%s]\\033[0m\\n" "$_code" "$_dur"
fi
exit $_code
`;
}

/**
 * Deploys the colorized runner script into the guest Linux /tmp directory silently
 * so the terminal only needs to execute `sh /tmp/.astrun.sh`, eliminating double-echo
 * and raw command clutter. Falls back to inline command on failure.
 */
export async function prepareRunScript(opts: RunFormatOptions): Promise<string> {
  const script = buildRunnerScript(opts);
  try {
    const res = await executeCommand(
      `cat << 'EOF' > /tmp/.astrun.sh\n${script}\nEOF\nchmod +x /tmp/.astrun.sh`
    );
    if (res.exitCode === 0) {
      return "sh /tmp/.astrun.sh";
    }
  } catch (_) {}

  // Inline fallback if filesystem write is blocked
  const badge = getRuntimeBadge(opts.runtime);
  const title = (opts.fileName || opts.displayName).replace(/"/g, '\\"');
  return `(printf "\\033[1;36m━━━ \\033[1;32m▶ Run:\\033[0m \\033[1;37m${title}\\033[0m \\033[1;35m[${badge}]\\033[0m \\033[2m$(date +%%H:%%M:%%S)\\033[0m \\033[1;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m\\n\\n"; ${opts.command})`;
}
