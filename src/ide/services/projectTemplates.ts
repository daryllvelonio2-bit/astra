/**
 * The New Project TEMPLATE catalogue.
 *
 * Pure on purpose — no react-native, no native module, no I/O and NO imports —
 * so a plain node test (/tmp/templates/test-templates.mjs) can transpile the
 * exact table the New Project picker ships and assert its shape.
 *
 * Every template describes:
 *   - a stable `id` (the value stored in `WorkspaceMeta.template`),
 *   - a one-line `description`,
 *   - the runtimes/tools it needs, each saying whether it ships with the app
 *     ("bundled"), must be installed by the app ("apt" + a DevTool id that the
 *     existing `installDependency` path knows), or cannot be installed
 *     ("manual" + a hint) — plus its download size (a number in MB, or the
 *     string "unknown" when the repo has no measurement),
 *   - the NON-INTERACTIVE shell commands that scaffold it, run in order inside
 *     the guest in the project's own folder by the app's existing
 *     `executeCommandStream` path, or
 *   - `manual: true` + `manualReason` when the app genuinely cannot scaffold it
 *     on the phone today (shown, disabled, with the reason — never hidden).
 *
 * Policy (mirrors runService.ts / devCategories.ts): the app NEVER
 * auto-installs a runtime. The scaffold commands only build the project
 * itself; any missing runtime is surfaced with the app's existing one-tap
 * installer before Create is allowed.
 *
 * Sizes are the figures this repo already measured in the guest
 * (devCategories.ts); an unmeasured tool is "unknown" rather than a guess.
 */

export type TemplateSize = number | "unknown";

/** How one required tool is provided. */
export type TemplateToolInstall =
  /** Ships with the app / the guest — there is nothing to download. */
  | { kind: "bundled" }
  /** Installed by the app's existing apt installer (Settings → Linux). */
  | { kind: "apt"; devToolId: string }
  /** The app cannot install this today; `hint` says why. */
  | { kind: "manual"; hint: string };

export interface TemplateTool {
  id: string;
  name: string;
  size: TemplateSize;
  install: TemplateToolInstall;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  /** One plain sentence: what this creates. */
  description: string;
  /** Short chip/group label for the compact picker. */
  group: string;
  /** Runtimes/tools this template needs (empty = nothing at all). */
  tools: TemplateTool[];
  /**
   * Non-interactive shell commands, run in order in the project folder inside
   * the guest. Empty for a blank project (the app only makes the folder) and
   * for manual templates (nothing runs).
   */
  commands: string[];
  /** True when the app cannot scaffold this today (see manualReason). */
  manual?: boolean;
  manualReason?: string;
}

/** The one-tap default: an empty folder with nothing installed or scaffolded. */
export const BLANK_TEMPLATE_ID = "blank";

/**
 * Quote-safe file writer: a single-quoted heredoc delimiter means the shell
 * never expands anything inside the body, so template output cannot break out
 * of the command. Non-interactive by construction.
 */
function writeFile(path: string, content: string): string {
  return `cat > ${path} <<'ASTRA_EOF'\n${content}\nASTRA_EOF`;
}

const NODE_TOOL: TemplateTool = {
  id: "node",
  name: "Node.js + npm",
  size: 40,
  install: { kind: "apt", devToolId: "node-npm" },
};

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: BLANK_TEMPLATE_ID,
    name: "Blank project",
    description: "",
    group: "None",
    tools: [],
    commands: [],
  },
  {
    id: "static",
    name: "Static site",
    description: "Plain HTML, CSS and JS — opens in the Browser tab, no build.",
    group: "Web",
    tools: [],
    commands: [
      "mkdir -p css js",
      writeFile(
        "index.html",
        [
          "<!DOCTYPE html>",
          '<html lang="en">',
          "<head>",
          '  <meta charset="utf-8" />',
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          "  <title>Static site</title>",
          '  <link rel="stylesheet" href="css/style.css" />',
          "</head>",
          "<body>",
          "  <h1>It works</h1>",
          "  <p>Edit index.html, css/style.css and js/app.js to build your site.</p>",
          '  <script src="js/app.js"></script>',
          "</body>",
          "</html>",
        ].join("\n")
      ),
      writeFile(
        "css/style.css",
        [":root { color-scheme: light dark; }", "body { font-family: system-ui, sans-serif; margin: 2rem; }"].join("\n")
      ),
      writeFile("js/app.js", 'console.log("Static site ready");'),
    ],
  },
  {
    id: "laravel",
    name: "Laravel",
    description: "PHP web framework — a full app skeleton with artisan.",
    group: "PHP",
    tools: [
      { id: "php", name: "PHP CLI", size: 35, install: { kind: "apt", devToolId: "php-cli" } },
      { id: "composer", name: "Composer", size: 20, install: { kind: "apt", devToolId: "composer" } },
    ],
    commands: ["composer create-project laravel/laravel . --no-interaction --prefer-dist --no-progress"],
  },
  {
    id: "react",
    name: "React (Vite)",
    description: "React single-page app scaffolded with Vite.",
    group: "Node",
    tools: [NODE_TOOL],
    commands: ["npx --yes create-vite@latest . --template react", "npm install --no-audit --no-fund"],
  },
  {
    id: "next",
    name: "Next.js",
    description: "React framework with file-based routing and server rendering.",
    group: "Node",
    tools: [NODE_TOOL],
    commands: [
      'npx --yes create-next-app@latest . --ts --eslint --app --no-tailwind --no-src-dir --import-alias "@/*" --use-npm --yes',
    ],
  },
  {
    id: "vue",
    name: "Vue",
    description: "Vue 3 single-page app scaffolded with Vite.",
    group: "Node",
    tools: [NODE_TOOL],
    commands: ["npx --yes create-vite@latest . --template vue", "npm install --no-audit --no-fund"],
  },
  {
    id: "svelte",
    name: "Svelte",
    description: "Svelte app scaffolded with Vite.",
    group: "Node",
    tools: [NODE_TOOL],
    commands: ["npx --yes create-vite@latest . --template svelte", "npm install --no-audit --no-fund"],
  },
  {
    id: "express",
    name: "Node/Express",
    description: "Minimal Node HTTP server with Express.",
    group: "Node",
    tools: [NODE_TOOL],
    commands: [
      "npm init -y",
      "npm install --no-audit --no-fund express",
      writeFile(
        "server.js",
        [
          'const express = require("express");',
          "const app = express();",
          'app.get("/", (_req, res) => res.send("Hello from Express"));',
          "app.listen(3000, () => console.log(\"Listening on http://127.0.0.1:3000\"));",
        ].join("\n")
      ),
    ],
  },
  {
    id: "flask",
    name: "Python/Flask",
    description: "Small Python web app with Flask installed as a package.",
    group: "Python",
    tools: [
      { id: "python3", name: "Python 3", size: 30, install: { kind: "apt", devToolId: "python3" } },
      { id: "pip", name: "pip", size: "unknown", install: { kind: "apt", devToolId: "pip" } },
    ],
    commands: [
      "pip3 install --user --no-input --quiet --disable-pip-version-check --break-system-packages flask",
      writeFile(
        "app.py",
        [
          "from flask import Flask",
          "app = Flask(__name__)",
          "",
          '@app.get("/")',
          'def index():',
          '    return "Hello from Flask"',
          "",
          'if __name__ == "__main__":',
          '    app.run(host="127.0.0.1", port=5000)',
        ].join("\n")
      ),
    ],
  },
  {
    id: "go",
    name: "Go",
    description: "Go module with a runnable main package.",
    group: "Systems",
    tools: [{ id: "go", name: "Go toolchain", size: "unknown", install: { kind: "apt", devToolId: "golang" } }],
    commands: [
      "go mod init astra.local/app",
      writeFile(
        "main.go",
        [
          "package main",
          "",
          'import "fmt"',
          "",
          "func main() {",
          '    fmt.Println("Hello from Go")',
          "}",
        ].join("\n")
      ),
    ],
  },
  {
    id: "rust",
    name: "Rust",
    description: "Rust binary crate managed by Cargo.",
    group: "Systems",
    tools: [{ id: "rust", name: "Rust + Cargo", size: "unknown", install: { kind: "apt", devToolId: "rust-cargo" } }],
    commands: ["cargo init --vcs none --name app"],
  },
  {
    id: "ruby",
    name: "Ruby",
    description: "Ruby app with the Sinatra gem installed.",
    group: "Scripting",
    tools: [{ id: "ruby", name: "Ruby", size: "unknown", install: { kind: "apt", devToolId: "ruby" } }],
    commands: [
      "gem install --no-document sinatra",
      writeFile(
        "app.rb",
        [
          'require "sinatra"',
          'get "/" do',
          '  "Hello from Ruby"',
          "end",
        ].join("\n")
      ),
    ],
  },
  {
    id: "expo",
    name: "Expo / React Native",
    description: "Cross-platform mobile app scaffolded with Expo.",
    group: "Mobile",
    tools: [NODE_TOOL],
    commands: ["npx --yes create-expo-app@latest . --template blank --no-install", "npm install --no-audit --no-fund"],
  },
  {
    id: "flutter",
    name: "Flutter",
    description: "Flutter/Dart app — install the SDK on a computer.",
    group: "Mobile",
    manual: true,
    manualReason:
      "The Flutter and Dart SDKs are not in the guest Debian packages and are far too large for the phone. Install Flutter on a computer — the app cannot scaffold it here.",
    tools: [
      {
        id: "flutter",
        name: "Flutter SDK",
        size: "unknown",
        install: {
          kind: "manual",
          hint: "Not in the Debian packages and far too large for the guest — install Flutter on a computer.",
        },
      },
      {
        id: "dart",
        name: "Dart SDK",
        size: "unknown",
        install: { kind: "manual", hint: "Ships inside the Flutter SDK; not installable by the app." },
      },
    ],
    commands: [],
  },
];

export function templateById(id: string | undefined): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find((t) => t.id === id);
}

/** Display name for a stored template id (falls back to the raw id). */
export function templateName(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return templateById(id)?.name || id;
}

/** Tools the app can install for a template (the apt ones, with a DevTool id). */
export function installableTemplateTools(t: ProjectTemplate): TemplateTool[] {
  return t.tools.filter((tool) => tool.install.kind === "apt");
}

/** Tools still missing, given a map of DevTool id -> installed. */
export function missingTemplateTools(
  t: ProjectTemplate,
  installed: Record<string, boolean>
): TemplateTool[] {
  return installableTemplateTools(t).filter((tool) => {
    const id = tool.install.kind === "apt" ? tool.install.devToolId : "";
    return !installed[id];
  });
}

/** Sum of the known tool sizes, plus whether any tool is unmeasured. */
export function templateTotalSize(t: ProjectTemplate): { mb: number; hasUnknown: boolean } {
  let mb = 0;
  let hasUnknown = false;
  for (const tool of t.tools) {
    if (tool.size === "unknown") hasUnknown = true;
    else mb += tool.size;
  }
  return { mb, hasUnknown };
}

/** Human size label for a template, or "" when it needs nothing. */
export function templateSizeLabel(t: ProjectTemplate): string {
  if (t.tools.length === 0) return "";
  const { mb, hasUnknown } = templateTotalSize(t);
  if (mb > 0 && !hasUnknown) return `about ${mb} MB`;
  if (mb > 0) return `about ${mb} MB + unknown`;
  return "size unknown";
}

/** "Needs PHP CLI + Composer" / "Nothing to install". */
export function templateNeedsLabel(t: ProjectTemplate): string {
  if (t.tools.length === 0) return "Nothing to install";
  return `Needs ${t.tools.map((tool) => tool.name).join(" + ")}`;
}
