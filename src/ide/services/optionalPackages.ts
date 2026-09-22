/**
 * Curated catalog of OPTIONAL Debian Linux packages users can one-tap install
 * from Settings → Linux → Optional Extras.
 *
 * These are intentionally NOT part of the base provisioning stages in
 * ToolchainProvisioner.kt — they install on demand, after provisioning.
 * Package names are pinned to Debian bookworm (see setup-linux-assets.sh):
 *  - bookworm still ships `redis` (`redis-server` + `redis-tools` for redis-cli)
 *  - `mysql-client` does not exist; MariaDB provides `mariadb-client`
 *  - Postgres client meta package is `postgresql-client` (PG15 on bookworm)
 *  - no MongoDB shell ships in bookworm (SSPL); that entry was dropped
 */

export interface OptionalPackage {
  /** Stable id for install-state tracking */
  id: string;
  /** apt package name(s) to install */
  apt: string[];
  /** Binary probed with `command -v` to detect "installed" */
  bin: string;
  /** When set, `dpkg-query -W` on this package is probed instead (header-only packages with no binary) */
  probeApt?: string;
  /** Display name */
  name: string;
  /** Plain-language "what it does for you" */
  desc: string;
  /** True when the download is large — UI shows a storage warning */
  heavy?: boolean;
}

export interface OptionalGroup {
  id: string;
  title: string;
  icon: string;
  blurb: string;
  packages: OptionalPackage[];
}

export const OPTIONAL_GROUPS: OptionalGroup[] = [
  {
    id: "cli",
    title: "CLI Power Tools",
    icon: "terminal-outline",
    blurb: "Everyday terminal upgrades for faster shell work",
    packages: [
      { id: "neovim", apt: ["neovim"], bin: "nvim", name: "Neovim", desc: "Modal code editor for fast terminal edits when the full editor is overkill." },
      { id: "tmux", apt: ["tmux"], bin: "tmux", name: "tmux", desc: "Persistent multi-pane shell sessions — detach and reattach without losing work." },
      { id: "fzf", apt: ["fzf"], bin: "fzf", name: "fzf", desc: "Fuzzy finder — jump to files and recall shell history in a few keystrokes." },
      { id: "bat", apt: ["bat"], bin: "batcat", name: "bat", desc: "cat with syntax highlighting, line numbers and git markers." },
      { id: "fdfind", apt: ["fd-find"], bin: "fdfind", name: "fd", desc: "Fast file finder — jump to files in a few keystrokes." },
      { id: "htop", apt: ["htop"], bin: "htop", name: "htop", desc: "Interactive process viewer — spot runaway builds eating phone CPU and RAM." },
      { id: "jq", apt: ["jq"], bin: "jq", name: "jq", desc: "Slice and filter JSON API responses right in the terminal." },
      { id: "yq", apt: ["yq"], bin: "yq", name: "yq", desc: "jq for YAML — inspect and edit app configs and CI files from the shell." },
      { id: "ncdu", apt: ["ncdu"], bin: "ncdu", name: "ncdu", desc: "Visual disk-usage explorer to reclaim tight phone storage." },
      { id: "rsync", apt: ["rsync"], bin: "rsync", name: "rsync", desc: "Fast incremental sync and deploy of project folders." },
    ],
  },
  {
    id: "languages",
    title: "Extra Languages",
    icon: "code-slash-outline",
    blurb: "Toolchains beyond the built-in Node and Python",
    packages: [
      { id: "go", apt: ["golang-go"], bin: "go", name: "Go", desc: "Go toolchain — build fast CLIs and backend services.", heavy: true },
      { id: "rust", apt: ["rustc", "cargo"], bin: "rustc", name: "Rust", desc: "Rust compiler plus Cargo for systems programming.", heavy: true },
      { id: "openjdk17", apt: ["openjdk-17-jdk"], bin: "java", name: "Java 17", desc: "Java runtime and compiler for Android tooling and JVM backends.", heavy: true },
      { id: "ruby", apt: ["ruby"], bin: "ruby", name: "Ruby", desc: "Ruby scripting and static site generators like Jekyll." },
      { id: "lua", apt: ["lua5.4"], bin: "lua5.4", name: "Lua 5.4", desc: "Tiny embeddable scripting language, great for automation glue." },
    ],
  },
  {
    id: "databases",
    title: "Database Clients",
    icon: "server-outline",
    blurb: "Shells for the databases your apps talk to",
    packages: [
      { id: "pg", apt: ["postgresql-client"], bin: "psql", name: "PostgreSQL", desc: "psql interactive shell for remote PostgreSQL databases." },
      { id: "mariadb", apt: ["mariadb-client"], bin: "mariadb", name: "MySQL / MariaDB", desc: "Connect to MySQL and MariaDB servers; dump and restore databases." },
      { id: "redis", apt: ["redis-server", "redis-tools"], bin: "redis-cli", name: "Redis", desc: "redis-cli shell for caches, queues and sessions." },
          ],
  },
  {
    id: "media",
    title: "Media & Docs",
    icon: "image-outline",
    blurb: "Asset pipelines and document conversion",
    packages: [
      { id: "ffmpeg", apt: ["ffmpeg"], bin: "ffmpeg", name: "FFmpeg", desc: "Convert, trim and compress audio and video assets for your apps.", heavy: true },
      { id: "imagemagick", apt: ["imagemagick"], bin: "convert", name: "ImageMagick", desc: "Resize, convert and optimize images from the shell." },
      { id: "pandoc", apt: ["pandoc"], bin: "pandoc", name: "Pandoc", desc: "Convert Markdown docs to PDF, HTML and Word." },
      { id: "graphviz", apt: ["graphviz"], bin: "dot", name: "Graphviz", desc: "Render architecture diagrams from plain text descriptions." },
      { id: "poppler", apt: ["poppler-utils"], bin: "pdftotext", name: "PDF Utils", desc: "Read PDFs in the terminal and extract their text." },
    ],
  },
];

/**
 * Packages Astra itself needs to work. Mirrors the base provisioning stages
 * in ToolchainProvisioner.kt (which auto-downloads these on first launch
 * unless the user turns auto-download off). Listed here so users can verify
 * or reinstall each piece by hand — every install stays a user choice.
 * `desc` explains why the app needs it.
 */
export const REQUIRED_GROUPS: OptionalGroup[] = [
  {
    id: "req-core",
    title: "Core Shell & Tools",
    icon: "terminal-outline",
    blurb: "Terminal, file commands, search and downloads",
    packages: [
      { id: "r-bash", apt: ["bash"], bin: "bash", name: "Bash", desc: "Shell behind the terminal and Run commands — scripts and sessions need it." },
      { id: "r-coreutils", apt: ["coreutils"], bin: "ls", name: "Coreutils", desc: "Basic file commands (ls, cp, mv, mkdir) the IDE and terminal rely on." },
      { id: "r-findutils", apt: ["findutils"], bin: "find", name: "Findutils", desc: "File search used by workspace scanning and the AI agent." },
      { id: "r-grep", apt: ["grep"], bin: "grep", name: "grep", desc: "Text search inside files, logs and command output." },
      { id: "r-sed", apt: ["sed"], bin: "sed", name: "sed", desc: "Stream editing used by setup scripts and the agent." },
      { id: "r-gawk", apt: ["gawk"], bin: "awk", name: "gawk", desc: "Text processing for scripts and tool-output parsing." },
      { id: "r-ripgrep", apt: ["ripgrep"], bin: "rg", name: "ripgrep", desc: "Fast code search behind the editor and agent." },
      { id: "r-tar", apt: ["tar"], bin: "tar", name: "tar", desc: "Extracts the Debian rootfs itself plus project archives." },
      { id: "r-gzip", apt: ["gzip"], bin: "gzip", name: "gzip", desc: "Decompression for downloads and the rootfs." },
      { id: "r-zip", apt: ["zip", "unzip"], bin: "unzip", name: "zip / unzip", desc: "Archives for project export, import and sharing." },
      { id: "r-tree", apt: ["tree"], bin: "tree", name: "tree", desc: "Directory listings shown around the IDE." },
      { id: "r-cacerts", apt: ["ca-certificates"], bin: "", probeApt: "ca-certificates", name: "CA Certificates", desc: "TLS trust roots — HTTPS downloads, git, npm all fail without these." },
      { id: "r-curl", apt: ["curl"], bin: "curl", name: "curl", desc: "File downloads and API calls from scripts." },
      { id: "r-wget", apt: ["wget"], bin: "wget", name: "wget", desc: "Backup downloader for provisioning and scripts." },
      { id: "r-git", apt: ["git"], bin: "git", name: "Git", desc: "Powers the Git tab — clone, stage, commit, push." },
      { id: "r-ssh", apt: ["openssh-client"], bin: "ssh", name: "SSH Client", desc: "SSH remotes, deploy keys and git-over-SSH URLs." },
      { id: "r-sqlite", apt: ["sqlite3"], bin: "sqlite3", name: "SQLite", desc: "Bundled databases and running .sql files." },
    ],
  },
  {
    id: "req-lang",
    title: "Built-in Runtimes",
    icon: "code-slash-outline",
    blurb: "Languages the Run button and agent execute",
    packages: [
      { id: "r-node", apt: ["nodejs"], bin: "node", name: "Node.js", desc: "Runs JavaScript files and terminal tooling.", heavy: true },
      { id: "r-npm", apt: ["npm"], bin: "npm", name: "npm", desc: "Installs JavaScript project dependencies." },
      { id: "r-python", apt: ["python3"], bin: "python3", name: "Python 3", desc: "Runs Python files and serves HTML previews." },
      { id: "r-pip", apt: ["python3-pip"], bin: "pip3", name: "pip", desc: "Installs Python packages." },
    ],
  },
  {
    id: "req-build",
    title: "Build Tools",
    icon: "construct-outline",
    blurb: "Compilers for native modules and C/C++ runs",
    packages: [
      { id: "r-make", apt: ["make"], bin: "make", name: "make", desc: "Drives C/C++ and native-module builds." },
      { id: "r-gcc", apt: ["gcc", "g++"], bin: "gcc", name: "GCC / G++", desc: "Compiles C/C++ runs and node-pty for the terminal.", heavy: true },
      { id: "r-headers", apt: ["libc6-dev"], bin: "", probeApt: "libc6-dev", name: "C Library Headers", desc: "Headers native code compiles against (pulled in by build tools)." },
      { id: "r-icu", apt: ["libicu72"], bin: "", probeApt: "libicu72", name: "ICU Libraries", desc: "Unicode data Node.js needs to start at all.", heavy: true },
    ],
  },
];
