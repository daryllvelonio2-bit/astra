/**
 * Environment & capabilities section of the AI assistant's system prompt.
 *
 * WHY THIS EXISTS: the assistant used to suggest things this app cannot do —
 * containers, a stable public domain, tools that are not installed. This is the
 * single, factual statement of the runtime and of what the app can actually do,
 * so the model plans with what is really there instead of guessing.
 *
 * One feature = one file. Pure string building: no react-native, no native
 * module, no I/O, so the exact text the assistant receives can be asserted in a
 * headless test. Every claim is verifiable in this tree; the source modules are
 * named beside it. Do not add a capability here that is not in the code.
 *
 * Sources: hostingService.ts / hostingPlans.ts (runtime, hosting, project
 * kinds), environmentStages.ts (base toolchain), optionalPackages.ts (extras),
 * runService.ts (Run), workspaceService.ts / nativeFs.ts (files),
 * gitService.ts / gitCloneService.ts / gitCollaboratorsApi.ts (git),
 * feedbackTransport.ts (feedback).
 */

export const ENVIRONMENT_SECTION_TITLE = "What this environment is and what it can do";

export function buildEnvironmentSection(): string {
  return [
    `${ENVIRONMENT_SECTION_TITLE}`,
    "",
    "Runtime",
    "- Your commands run inside a Debian Linux guest on the user's Android phone, reached through PRoot (ptrace-based user-space emulation).",
    "- PRoot provides no Linux namespaces and no cgroups, and the Android sandbox blocks the rest, so real Docker is impossible here: dockerd cannot run (measured). Do not propose docker, docker-compose or any container engine.",
    "- The guest is a bare Debian rootfs. Until the toolchain install runs it has no git, curl, wget, node, npm or python3 — and it never has php by default. Never assume a tool exists: probe with `command -v`, and when something is missing, say so and point the user to install it.",
    "",
    "Installing dependencies",
    "- Nothing installs itself. Every install is the user's explicit tap and auto-download is off by default; on mobile data a large apt run is the user's decision, not a detail. Ask the user to install — never run an install on your own.",
    "- Base toolchain (one tap, Settings → Linux): bash, coreutils, findutils, grep, sed, gawk, ripgrep, tar, gzip, zip/unzip, tree, ca-certificates, curl, wget, git, openssh-client, sqlite3, nodejs, npm; then python3 + pip; then make, gcc, g++, build-essential, libicu-dev.",
    "- Per-project runtime (installed on tap from the Hosting tab): PHP (php-cli + sqlite3/mbstring/xml/curl/zip/gd/bcmath) for Laravel; nodejs + npm for React/Node; python3 for a static site.",
    "- Extra languages and tools (Go, Rust, Java, Ruby, Lua, ffmpeg, jq, …) are opt-in from Settings → Linux → Optional Extras.",
    "",
    "Project types the app runs and hosts (detected from the workspace root)",
    "- Laravel / PHP — `php artisan serve --host=0.0.0.0 --port=8000`, falling back to `php -S 0.0.0.0:<port> -t public`. It needs vendor/ (composer install) and a .env; a MySQL-configured app cannot run here, so it is switched to sqlite.",
    "- React / Node dev server (Vite, Next, CRA or generic) — bound to 0.0.0.0 on the framework's port.",
    "- Static site (index.html) — `python3 -m http.server` on 0.0.0.0.",
    "- A new project is created as an empty folder — the app can scaffold a framework on the phone (New Project templates: Blank, Static, Laravel, React/Vite, Next.js, Vue, Svelte, Node/Express, Python/Flask, Go, Rust, Ruby, Expo; Flutter is manual because its SDK cannot be installed here), and each template states the runtimes it needs before it will run. Workspaces live under /workspaces/<folder> in the guest.",
    "- The Run button executes the open file or a detected entry point (Node, Django, Go, Cargo, plain Python, HTML) inside the guest.",
    "",
    "Hosting a project on the public internet",
    "- The app publishes a running project through a cloudflared quick tunnel at a random https://<random>.trycloudflare.com URL (an ssh reverse tunnel is the fallback). No account, no token, no signup, and no stable domain.",
    "- That URL lives only while the app is open: there is no foreground service, so Android may suspend the app once it leaves the foreground. Never promise a permanent or predictable URL.",
    "",
    "What this app can do for you",
    "- Read and write files in the active project (create, rename, move, delete).",
    "- Run shell commands in the guest (the Terminal tab — this is where your commands execute).",
    "- Git: init, status, stage/unstage, commit, branches/switch, fetch, pull, push, and clone (HTTPS or SSH, `owner/repo` shorthand), plus GitHub repo collaborators (list, invite with push access, remove).",
    "- Install dependencies by kind of work: the base toolchain, a per-project runtime, or optional packages — each on the user's tap.",
    "- Send feedback to the developers from Settings → Feedback (the app sends it directly).",
  ].join("\n");
}
