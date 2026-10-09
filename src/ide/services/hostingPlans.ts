/**
 * What can be hosted, how it is detected, and the exact command that serves it.
 *
 * Pure on purpose — no react-native, no native module, no I/O — so a headless
 * test can drive the same strings the app ships. The commands here were measured
 * inside the app's own Debian rootfs; see
 * expo-rn-app-development/references/php-hosting-and-tunnels-in-guest.md
 */

export type HostProjectKind = "laravel" | "node" | "static";

/**
 * The detached composer install, and the numbers around it.
 *
 * WHY A DEADLINE AT ALL: `composer install` with no composer.json (or with a
 * package that prompts) used to sit on a prompt forever — a 5.5-hour zombie
 * process was found alive on the phone, and the prepare polled it the whole
 * time. A wall-clock `timeout` makes that impossible: the process is killed,
 * the run fails loudly, the guest is free again.
 *
 * WHY 600s: composer's own per-operation default is 300s, and a real Laravel
 * tree (~20-40 MB of packages) over a phone connection under PRoot is slow but
 * finite. 600s (10 min) is 2x that default and still 30x shorter than the
 * zombie / 3x under the old 30-minute poll, so a genuine slow install finishes
 * while a stalled one is cut off fast.
 */
export const COMPOSER_INSTALL_DEADLINE_S = 600;
/** Where the detached step drains its output, read on failure for the tail. */
export const PREP_LOG = "/tmp/astra-prep.log";
/** Where the detached step writes its own exit code so the poll can stop. */
export const PREP_RC = "/tmp/astra-prep.rc";

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

/**
 * One preparation step.
 *
 * WHY AN ARRAY OF ONE-LINERS: the first version inlined the whole recipe --
 * nested quotes, sed expressions, a JSON-escaped string -- into a single
 * `bash -lc` command sent to the guest. That command never even launched: the
 * script's log file was never created, and because the launch's exit code was
 * ignored, "never ran" looked identical to "still working". Each command here
 * is deliberately trivial, and the service checks every exit code.
 */
export interface PrepareStep {
  /** One simple shell command. No bash -c, no nesting, no JSON. */
  cmd: string;
  /** Long-running (composer): started detached, then polled for `waitFor`. */
  detached?: boolean;
  /** Guest path whose existence means the detached step finished. */
  waitFor?: string;
  /**
   * Guest file the detached step writes its OWN exit code into when it ends.
   * The poll watches this alongside `waitFor`, so a step that FAILS (or is
   * killed by its deadline) ends the run instead of being polled forever.
   */
  exitFile?: string;
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
    /** One-time project preparation, before the server. Optional: Laravel only. */
    prepare?: (guestDir: string) => PrepareStep[];
    /**
     * The guest-side file this plan REQUIRES in its project folder, or undefined
     * when it needs none. Only a plan that names a marker may have the project
     * folder discovered elsewhere in the guest — a static site must never be
     * redirected to some unrelated composer.json.
     */
    projectMarker?: string;
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
    detect: (rootNames) => has(rootNames, "artisan"),
    projectMarker: "composer.json",
    // Each entry is one plain command. apt's composer is used because the spike
    // MEASURED it working (Composer 2.5.5, 20 MB, ~8 s) -- my earlier theory that
    // apt was the stall was wrong.
    prepare: (dir) => {
      const apt = "export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; export HOME=/root; export DEBIAN_FRONTEND=noninteractive; command -v composer >/dev/null 2>&1 || apt-get install -y --no-install-recommends composer";
      return [
        { cmd: apt },
        {
          // Detached: a Laravel tree is ~34 MiB and outlives any one-shot command.
          //
          // The `timeout -k` is the whole fix for the 5.5-hour zombie: with no
          // composer.json composer sat on a prompt forever, and the poll never
          // noticed. `--no-interaction` can never be prompted, `timeout` kills a
          // stalled run at its deadline (SIGTERM, then SIGKILL 10s later), the
          // leading `rm` clears any stale marker, and the group writes its OWN
          // exit code to PREP_RC so the poll stops on failure instead of forever.
          cmd: `rm -f ${PREP_RC}; cd ${dir} && nohup bash -c 'COMPOSER_ALLOW_SUPERUSER=1 timeout -k 10 ${COMPOSER_INSTALL_DEADLINE_S} composer install --no-interaction --no-progress --prefer-dist --no-dev > ${PREP_LOG} 2>&1; echo $? > ${PREP_RC}' >/dev/null 2>&1 &`,
          detached: true,
          waitFor: `${dir}/vendor/autoload.php`,
          exitFile: PREP_RC,
        },
        { cmd: `[ -f ${dir}/.env ] || cp ${dir}/.env.example ${dir}/.env` },
        { cmd: `cd ${dir} && unset PHP_INI_SCAN_DIR && php artisan key:generate --force` },
        // The app's .env picks the database. A MySQL-configured app cannot run
        // here (no server, no pdo_mysql) and 500s on every request; the spike
        // measured sqlite serving it correctly.
        { cmd: `sed -i 's/^DB_CONNECTION=mysql/DB_CONNECTION=sqlite/' ${dir}/.env` },
        { cmd: `sed -i 's#^DB_DATABASE=.*#DB_DATABASE=${dir}/database/database.sqlite#' ${dir}/.env` },
        { cmd: `grep -q '^DB_DATABASE=' ${dir}/.env || echo DB_DATABASE=${dir}/database/database.sqlite >> ${dir}/.env` },
        { cmd: `sed -i 's/^SESSION_DRIVER=.*/SESSION_DRIVER=file/' ${dir}/.env` },
        { cmd: `sed -i 's/^CACHE_STORE=.*/CACHE_STORE=file/' ${dir}/.env` },
        { cmd: `sed -i 's/^CACHE_DRIVER=.*/CACHE_DRIVER=file/' ${dir}/.env` },
        { cmd: `sed -i 's/^QUEUE_CONNECTION=.*/QUEUE_CONNECTION=sync/' ${dir}/.env` },
        { cmd: `mkdir -p ${dir}/database; : > ${dir}/database/database.sqlite` },
        { cmd: `cd ${dir} && unset PHP_INI_SCAN_DIR && php artisan migrate --force` },
      ];
    },
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
