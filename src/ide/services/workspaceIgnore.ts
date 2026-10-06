/**
 * One source of truth for "directories not worth looking at".
 *
 * Two tiers on purpose: HIDING a folder from the user and SKIPPING it during
 * change detection are different decisions.
 *
 *  - IGNORED_FOLDERS   — hidden in the explorer and skipped everywhere. Only
 *    names that are practically never source belong here.
 *  - WATCHER_EXTRA_SKIP — skipped by the fingerprint walk but still SHOWN.
 *    These are build/dependency output for most stacks and real source for a
 *    few (a Node CLI keeps its entry points in `bin/`, a monorepo can keep
 *    packages/ as its actual code), so hiding them would take files away from
 *    the user. Skipping them only means an edit inside one does not
 *    auto-refresh the tree; pull-to-refresh still sees it.
 *
 * Note the tree and the walk both already skip EVERY dotted name (except
 * .env / .gitignore), so dotted build dirs like .gradle or .dart_tool need no
 * entry — the real wins are the non-dotted ones below.
 *
 * Pure module: no imports. The fingerprint walk is exercised headlessly, and
 * pulling expo/native modules in here would break that.
 */

export const IGNORED_FOLDERS = new Set<string>([
  // dependencies — nothing a user edits
  "node_modules",
  "vendor",
  "bower_components",
  "Pods",
  "DerivedData",
  // build output with an unambiguous name
  "dist",
  "build",
  "coverage",
  "cache",
  // python bytecode: huge, and never source
  "__pycache__",
]);

/**
 * Skipped by the fingerprint walk, still visible in the explorer. Naive
 * walking of these is what makes a large project feel like the app "cannot
 * handle it": a .NET bin/obj or a Maven/Rust target/ can be thousands of
 * directories of compiled output that nobody edits.
 */
export const WATCHER_EXTRA_SKIP = new Set<string>([
  "bin",
  "obj",
  "packages",
  "target",
  "out",
  "Debug",
  "Release",
  "env",
]);

/** Everything the fingerprint walk refuses to descend into. */
export const WATCHER_SKIP_NAMES = new Set<string>([
  ...IGNORED_FOLDERS,
  ...WATCHER_EXTRA_SKIP,
]);
