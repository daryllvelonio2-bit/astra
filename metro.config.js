const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Stub Node core modules referenced (but never executed on-device) by bundled
// libraries. `typescript` (23M source) is also stubbed: editor diagnostics
// load it only via a guarded lazy require with a bracket-scan fallback
// (see codeDiagnosticsService.getTs), so on-device TS transpile degrades
// gracefully instead of paying megabytes of bundle + eval at startup.
const emptyShim = path.resolve(__dirname, "metro-shims/empty.js");
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  fs: emptyShim,
  os: emptyShim,
  path: emptyShim,
  crypto: emptyShim,
  inspector: emptyShim,
  perf_hooks: emptyShim,
  typescript: emptyShim,
};

// Guard rails: monaco-editor + xterm ship ONLY via offline esbuild blobs
// (scripts/build-*-html.js → WebView pages). A direct import would silently
// explode bundle size (101M / 2.6M); fail loudly instead.
const vendorGuard = /node_modules\/(monaco-editor(-core)?|xterm|@xterm)\//;
const upstreamBlock = config.resolver.blockList;
if (upstreamBlock instanceof RegExp) {
  config.resolver.blockList = new RegExp(`(?:${upstreamBlock.source})|(?:${vendorGuard.source})`);
} else if (Array.isArray(upstreamBlock)) {
  config.resolver.blockList = [...upstreamBlock, vendorGuard];
} else {
  config.resolver.blockList = vendorGuard;
}

module.exports = config;
