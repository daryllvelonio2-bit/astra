/**
 * What can be hosted, how it is detected, and the exact command that serves it.
 *
 * Pure on purpose — no react-native, no native module, no I/O — so a headless
 * test can drive the same strings the app ships. The commands here were measured
 * inside the app's own Debian rootfs; see
 * expo-rn-app-development/references/php-hosting-and-tunnels-in-guest.md
 */

export type HostProjectKind = "laravel" | "node" | "static";

export interface RuntimeInfo {
  installed: boolean;
  /** What the user needs to install, in plain words. */
  label: string;
  binary: string;
  /** apt packages, in the order the guest wants them. */
  apt: string[];
  /** Rough download size, so the user can decide on mobile data. */
  approxSize: string;
}

export const HOST_PLANS: Record<
  HostProjectKind,
  {
    label: string;
    binary: string;
    apt: string[];
    approxSize: string;
    defaultPort: number;
    serve: (guestDir: string, port: number, flavor?: NodeFlavor) => string;
    /**
     * One-time project preparation, run detached before the server. Optional:
     * only Laravel needs it.
     */
    prepare?: (guestDir: string) => string;
    /** A file whose presence in the project root identifies this kind. */
    detect: (rootNames: string[], pkg: any) => boolean;
  }
> = {
  laravel: {
    label: "Laravel (PHP)",
    binary: "php",
    // Deliberately the -cli packages only: no web server, no composer. The
    // guest serves with PHP's built-in server, and vendor/ is expected in the
    // repository (or installed by the user), which keeps this a ~60 MB download
    // instead of several hundred.
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
    // Measured in the guest: 86 packages, 34.7 MB to download, 137 MB installed.
    // The user sees the download figure, because that is what their data pays for.
    approxSize: "≈35 MB",
    defaultPort: 8000,
    serve: (dir, port) =>
      `cd ${dir} && php artisan serve --host=0.0.0.0 --port=${port}`,
    // A Laravel app CANNOT boot without its PHP dependencies: public/index.php
    // requires ../vendor/autoload.php, and vendor/ is gitignored, so a fresh
    // clone never has it. artisan serve and php -S fail identically, which is
    // exactly what "it is not hosting" looked like on the phone. Same for .env:
    // without an APP_KEY every page is a 500. composer is pulled from apt on
    // first use (~5 MB), then composer install fetches the app's packages.
    prepare: (dir) =>
      `cd ${dir}; ` +
      `if [ ! -d vendor ]; then ` +
      // composer comes from its own installer rather than apt: apt costs a full
      // package-list refresh (~35 MB of indices) and keeps hitting dpkg/apt locks
      // on this device, which is the stall that made "it keeps loading". The
      // installer is ~3 MB and needs only curl, which the toolchain already has.
      `command -v composer >/dev/null 2>&1 || ` +
      `{ curl -sSL https://getcomposer.org/installer -o /tmp/cs.phar && php /tmp/cs.phar --install-dir=/usr/local/bin --filename=composer >/dev/null 2>&1; } || true; ` +
      // --no-dev: phpunit, faker, debugbar and friends are dead weight when the
      // point is to SERVE the app, and they are roughly half the tree.
      // --prefer-dist: tarballs, not git clones. --no-scripts: skip the app's
      // own post-install hooks, which is faster still and cannot hang.
      `composer install --no-interaction --no-progress --prefer-dist --no-dev --no-scripts; ` +
      `fi; ` +
      `if [ ! -f .env ] && [ -f .env.example ]; then cp .env.example .env; fi; ` +
      `php artisan key:generate --force 2>/dev/null; ` +
      `echo PREPARE_DONE`, 
    detect: (rootNames) => has(rootNames, "artisan"),
  },
  node: {
    label: "React / Node dev server",
    binary: "npm",
    apt: ["nodejs", "npm"],
    approxSize: "≈40 MB",
    defaultPort: 5173,
    serve: (dir, port, flavor) => {
      // Each framework wants its host/port flags spelled its own way; a bare
      // `npm run dev` would bind to 127.0.0.1 inside the guest and be reachable
      // only from the guest itself, which is the classic "the tunnel is up but
      // the site is blank" failure.
      switch (flavor) {
        case "vite":
          return `cd ${dir} && npm run dev -- --host 0.0.0.0 --port ${port}`;
        case "next":
          return `cd ${dir} && npm run dev -- -H 0.0.0.0 -p ${port}`;
        case "cra":
          return `cd ${dir} && HOST=0.0.0.0 PORT=${port} BROWSER=none npm start`;
        default:
          return `cd ${dir} && HOST=0.0.0.0 PORT=${port} npm run dev`;
      }
    },
    detect: (rootNames, pkg) => has(rootNames, "package.json") && !!pkg,
  },
  static: {
    label: "Static site",
    binary: "python3",
    apt: ["python3"],
    approxSize: "≈30 MB",
    defaultPort: 8080,
    serve: (dir, port) => `cd ${dir} && python3 -m http.server ${port} --bind 0.0.0.0`,
    detect: (rootNames, pkg) => !pkg && has(rootNames, "index.html"),
  },
};

function has(rootNames: string[], name: string): boolean {
  const lower = rootNames.map((n) => n.toLowerCase());
  return lower.includes(name.toLowerCase());
}

export type NodeFlavor = "vite" | "next" | "cra" | "other";

/** Which dev-server dialect this package.json speaks. */
export function nodeFlavor(pkg: any): NodeFlavor {
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  if (deps.vite) return "vite";
  if (deps.next) return "next";
  if (deps["react-scripts"]) return "cra";
  return "other";
}

export function detectHostKind(rootNames: string[], pkg: any): HostProjectKind | null {
  const order: HostProjectKind[] = ["laravel", "node", "static"];
  return order.find((k) => HOST_PLANS[k].detect(rootNames, pkg)) ?? null;
}
