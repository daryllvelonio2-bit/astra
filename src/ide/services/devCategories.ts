/**
 * What each KIND OF DEVELOPMENT needs, and how the app installs it.
 *
 * Pure on purpose — no react-native, no native module, no I/O — so a headless
 * test (plain node) can drive the exact table the Dependencies screen ships.
 *
 * The install mechanisms named here are the ones the app ALREADY has, never a
 * new one:
 *   - "apt"     -> installPackages(apt) from modules/linux-runner, the same
 *                  guest/toolchain installer Settings -> Linux -> Optional
 *                  Extras uses. One tap per tool; nothing runs on its own.
 *   - "manual"  -> the app cannot install this today; the UI must say so
 *                  instead of pretending.
 *   - "bundled" -> ships with the app; there is nothing to download.
 *
 * Sizes are the figures this repo already measured in the guest (see
 * hostingPlans.ts / optionalPackages.ts). Where no measurement exists the size
 * is the string "unknown" rather than an invented number.
 *
 * Policy (mirrors runService.ts): the app NEVER auto-installs. Every entry is
 * an explicit user tap.
 */

export type DevRequirement = "required" | "optional";

/** Approximate download size in MB, or "unknown" when not measured. */
export type DevSize = number | "unknown";

/** How the app installs a tool — a discriminated union, not a free string. */
export type DevInstall =
  | { kind: "apt"; apt: string[] }
  | { kind: "manual"; hint: string }
  | { kind: "bundled" };

export interface DevTool {
  /** Stable id, unique across the whole table (also the install-state key). */
  id: string;
  name: string;
  /** required = the kind cannot run without it; optional = extras only. */
  requirement: DevRequirement;
  /** Approx download size in MB, or "unknown" when not measured. */
  size: DevSize;
  /** True only when the tool ships inside the app (install.kind === "bundled"). */
  bundled: boolean;
  /** True when the download is large — the UI shows a storage warning. */
  heavy: boolean;
  /** How the app installs it (apt / manual / bundled). */
  install: DevInstall;
  /** Binary probed with `command -v` to detect "installed". */
  bin?: string;
  /** Header-only package probed with `dpkg-query -W` instead of a binary. */
  probeApt?: string;
  /** One plain sentence shown under the name. */
  note?: string;
}

export interface DevCategory {
  id: string;
  /** Display name, e.g. "Laravel / PHP". */
  name: string;
  /** One line: what this kind of development is for. */
  purpose: string;
  /** Ionicons glyph for the compact header. */
  icon: string;
  tools: DevTool[];
}

export const DEV_CATEGORIES: DevCategory[] = [
  {
    id: "laravel",
    name: "Laravel / PHP",
    purpose: "Build and serve Laravel PHP applications.",
    icon: "logo-laravel",
    tools: [
      {
        id: "php-cli",
        name: "PHP CLI",
        requirement: "required",
        size: 35,
        bundled: false,
        heavy: false,
        bin: "php",
        install: {
          kind: "apt",
          apt: [
            "php-cli",
            "php-sqlite3",
            "php-mbstring",
            "php-xml",
            "php-curl",
            "php-zip",
            "php-gd",
            "php-bcmath",
          ],
        },
        note: "PHP and the extensions Laravel boots with. Measured ≈35 MB in the guest.",
      },
      {
        id: "composer",
        name: "Composer",
        requirement: "required",
        size: 20,
        bundled: false,
        heavy: false,
        bin: "composer",
        install: { kind: "apt", apt: ["composer"] },
        note: "Installs a project's vendor/ packages with `composer install`.",
      },
    ],
  },
  {
    id: "node",
    name: "React / Node",
    purpose: "Run React, Vite, Next and other Node dev servers.",
    icon: "logo-react",
    tools: [
      {
        id: "node-npm",
        name: "Node.js + npm",
        requirement: "required",
        size: 40,
        bundled: false,
        heavy: false,
        bin: "node",
        install: { kind: "apt", apt: ["nodejs", "npm"] },
        note: "Node runtime plus npm for project dependencies. Measured ≈40 MB.",
      },
    ],
  },
  {
    id: "static",
    name: "Static site",
    purpose: "Preview plain HTML/CSS/JS with no build step.",
    icon: "document-outline",
    tools: [
      {
        id: "static-preview",
        name: "On-device preview",
        requirement: "required",
        size: "unknown",
        bundled: true,
        heavy: false,
        install: { kind: "bundled" },
        note: "The app renders index.html in its Browser tab — nothing to install.",
      },
      {
        id: "static-python",
        name: "Python 3 (http.server)",
        requirement: "required",
        size: 30,
        bundled: false,
        heavy: false,
        bin: "python3",
        install: { kind: "apt", apt: ["python3"] },
        note: "Serves the folder over HTTP for linked assets and client-side routing.",
      },
      {
        id: "static-node",
        name: "Node.js + npm (build steps)",
        requirement: "optional",
        size: 40,
        bundled: false,
        heavy: false,
        bin: "node",
        install: { kind: "apt", apt: ["nodejs", "npm"] },
        note: "Only for generators/build tools (Vite, Tailwind); plain sites need nothing.",
      },
    ],
  },
  {
    id: "python",
    name: "Python",
    purpose: "Run Python scripts and Django/Flask servers.",
    icon: "code-slash-outline",
    tools: [
      {
        id: "python3",
        name: "Python 3",
        requirement: "required",
        size: 30,
        bundled: false,
        heavy: false,
        bin: "python3",
        install: { kind: "apt", apt: ["python3"] },
        note: "Runs .py files, serves HTML previews and boots framework servers.",
      },
      {
        id: "pip",
        name: "pip",
        requirement: "required",
        size: "unknown",
        bundled: false,
        heavy: false,
        bin: "pip3",
        install: { kind: "apt", apt: ["python3-pip"] },
        note: "Installs the project's Python packages.",
      },
      {
        id: "django",
        name: "Django",
        requirement: "optional",
        size: "unknown",
        bundled: false,
        heavy: false,
        install: {
          kind: "manual",
          hint: "Run `pip install django` in the Terminal — the app installs pip, not the project's packages.",
        },
        note: "Framework code for manage.py projects; installed per project with pip.",
      },
    ],
  },
  {
    id: "flutter",
    name: "Flutter / Dart",
    purpose: "Build Flutter apps and run Dart code.",
    icon: "phone-portrait-outline",
    tools: [
      {
        id: "flutter-sdk",
        name: "Flutter SDK",
        requirement: "required",
        size: "unknown",
        bundled: false,
        heavy: true,
        install: {
          kind: "manual",
          hint: "Not in the Debian packages and far too large for the guest — install Flutter on a computer.",
        },
        note: "The app cannot install Flutter today.",
      },
      {
        id: "dart-sdk",
        name: "Dart SDK",
        requirement: "required",
        size: "unknown",
        bundled: false,
        heavy: true,
        install: {
          kind: "manual",
          hint: "Ships inside the Flutter SDK; not installable by the app.",
        },
        note: "Comes with the Flutter SDK.",
      },
    ],
  },
  {
    id: "native",
    name: "Native (Java / Kotlin / C / C++)",
    purpose: "Compile Java, Kotlin and C/C++ native code.",
    icon: "construct-outline",
    tools: [
      {
        id: "java17",
        name: "Java 17 (OpenJDK)",
        requirement: "required",
        size: "unknown",
        bundled: false,
        heavy: true,
        bin: "java",
        install: { kind: "apt", apt: ["openjdk-17-jdk"] },
        note: "Large download — hundreds of MB installed. Powers javac/java and Android tooling.",
      },
      {
        id: "c-build",
        name: "C / C++ build tools",
        requirement: "required",
        size: "unknown",
        bundled: false,
        heavy: true,
        bin: "gcc",
        install: { kind: "apt", apt: ["build-essential", "gcc", "g++", "make"] },
        note: "GCC, G++, make and libc headers for native compilation.",
      },
      {
        id: "kotlin",
        name: "Kotlin compiler",
        requirement: "optional",
        size: "unknown",
        bundled: false,
        heavy: false,
        install: {
          kind: "manual",
          hint: "Not in the Debian packages — install kotlinc from JetBrains on a computer.",
        },
        note: "The app cannot install Kotlin today.",
      },
    ],
  },
  {
    id: "go",
    name: "Go",
    purpose: "Build Go modules and command-line tools.",
    icon: "cube-outline",
    tools: [
      {
        id: "golang",
        name: "Go toolchain",
        requirement: "required",
        size: "unknown",
        bundled: false,
        heavy: true,
        bin: "go",
        install: { kind: "apt", apt: ["golang-go"] },
        note: "Large download. Runs `go run .` from the Run button.",
      },
    ],
  },
  {
    id: "rust",
    name: "Rust",
    purpose: "Build Rust crates with Cargo.",
    icon: "hardware-chip-outline",
    tools: [
      {
        id: "rust-cargo",
        name: "Rust & Cargo",
        requirement: "required",
        size: "unknown",
        bundled: false,
        heavy: true,
        bin: "rustc",
        install: { kind: "apt", apt: ["rustc", "cargo"] },
        note: "Rust compiler plus Cargo. Large download.",
      },
    ],
  },
  {
    id: "ruby",
    name: "Ruby",
    purpose: "Run Ruby scripts and Jekyll-style generators.",
    icon: "diamond-outline",
    tools: [
      {
        id: "ruby",
        name: "Ruby",
        requirement: "required",
        size: "unknown",
        bundled: false,
        heavy: false,
        bin: "ruby",
        install: { kind: "apt", apt: ["ruby"] },
        note: "Ruby interpreter; gems install with `gem install` in the Terminal.",
      },
    ],
  },
  {
    id: "lua",
    name: "Lua",
    purpose: "Run Lua 5.4 scripts and automation glue.",
    icon: "moon-outline",
    tools: [
      {
        id: "lua54",
        name: "Lua 5.4",
        requirement: "required",
        size: "unknown",
        bundled: false,
        heavy: false,
        bin: "lua5.4",
        install: { kind: "apt", apt: ["lua5.4"] },
        note: "Small interpreter the Run button executes.",
      },
    ],
  },
];

/** apt packages the app installs for a tool, or [] when it cannot. */
export function aptPackagesFor(tool: DevTool): string[] {
  return tool.install.kind === "apt" ? tool.install.apt : [];
}

/** Every tool the app can actually install today with installPackages(). */
export function installableTools(): DevTool[] {
  return allTools().filter((t) => t.install.kind === "apt");
}

/** Every tool marked manual — the app cannot install it today. */
export function manualTools(): DevTool[] {
  return allTools().filter((t) => t.install.kind === "manual");
}

export function allTools(): DevTool[] {
  return DEV_CATEGORIES.flatMap((c) => c.tools);
}

export function categoryById(id: string): DevCategory | undefined {
  return DEV_CATEGORIES.find((c) => c.id === id);
}

export function toolById(id: string): DevTool | undefined {
  return allTools().find((t) => t.id === id);
}

/** How many of a category's tools ship ready (bundled) or are installed. */
export function readyCount(category: DevCategory, installed: Record<string, boolean>): number {
  return category.tools.filter((t) => t.bundled || installed[t.id]).length;
}

/** Human size label for a tool row. */
export function sizeLabel(size: DevSize): string {
  return size === "unknown" ? "size unknown" : `≈${size} MB`;
}

/** Binaries/apt headers to probe once for the whole table. */
export function probeTargets(): { bins: string[]; apts: string[] } {
  const tools = allTools();
  const bins = [...new Set(tools.map((t) => t.bin).filter((b): b is string => !!b))];
  const apts = [...new Set(tools.map((t) => t.probeApt).filter((a): a is string => !!a))];
  return { bins, apts };
}
