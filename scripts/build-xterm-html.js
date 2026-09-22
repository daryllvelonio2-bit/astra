/**
 * Builds src/ide/components/terminal/xtermHtml.generated.ts by inlining the
 * xterm.js distribution (lib + fit addon + web-links addon + css) into a
 * single offline HTML page. The generated blob is JSON-escaped so xterm
 * source can contain any characters safely; runtime colors are token-replaced
 * by buildXtermHtml().
 *
 * Run: node scripts/build-xterm-html.js
 * Re-run after any `npm install xterm` / `@xterm/addon-*` upgrade.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const xtermJs = read("node_modules/xterm/lib/xterm.js");
const fitJs = read("node_modules/@xterm/addon-fit/lib/addon-fit.js");
const linksJs = read("node_modules/@xterm/addon-web-links/lib/addon-web-links.js");
const xtermCss = read("node_modules/xterm/css/xterm.css");

const html = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>__XTERM_CSS__</style>
<style>
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  background: __BG__;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
#terminal {
  height: 100%;
  width: 100%;
  padding: 6px 8px;
  box-sizing: border-box;
}
.xterm-helper-textarea { opacity: 0 !important; }
.xterm .xterm-viewport { background-color: transparent !important; }
</style>
</head>
<body>
<div id="terminal"></div>
<script>__XTERM_JS__</script>
<script>__FIT_JS__</script>
<script>__WEBLINKS_JS__</script>
<script>
(function () {
  var term = new Terminal({
    cursorBlink: true,
    cursorStyle: 'block',
    cursorWidth: 2,
    fontSize: __FONT__,
    fontFamily: 'ui-monospace, "SF Mono", "Roboto Mono", "JetBrains Mono", Menlo, Consolas, monospace',
    fontWeight: '500',
    fontWeightBold: '700',
    letterSpacing: 0.3,
    lineHeight: 1.25,
    scrollback: 5000,
    theme: __THEME_JSON__,
    minimumContrastRatio: 7,
    convertEol: false
  });
  var fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  // Tappable URLs (CLI login links, etc.): underline on hover/click, tap
  // posts the URL to React Native which opens the system browser. Touch
  // needs no modifier; desktop keeps the addon's default Ctrl+click.
  try {
    var links = new WebLinksAddon.WebLinksAddon(function (ev, uri) {
      post({ type: 'link', url: uri });
    });
    term.loadAddon(links);
  } catch (e) {}
  term.open(document.getElementById('terminal'));
  // Soft-keyboard input is owned by the React Native hidden catcher (it
  // ingests Gboard composition bursts reliably; xterm 5.3's textarea races
  // and drops fast input). Disabling the helper textarea keeps it from
  // stealing IME focus; hardware keydowns still reach a focused terminal.
  try {
    var ta = term.textarea;
    if (ta) { ta.setAttribute('disabled', 'disabled'); ta.setAttribute('inputmode', 'none'); }
  } catch (e) {}
  var termEl = document.getElementById('terminal');
  var post = function (m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); };

  // Smooth touch scrolling, momentum deceleration, and pinch zoom
  var touchStartY = 0;
  var touchStartX = 0;
  var lastTouchY = 0;
  var lastTouchX = 0;
  var lastTouchTime = 0;
  var touchVelocityY = 0;
  var isTouchScrolling = false;
  var scrollRemainder = 0;
  var momentumRaf = null;
  var pinchStartDist = 0;
  var pinchBaseFontSize = 14;
  // Timestamp of the last scroll/pinch gesture end. WebView fires a
  // synthetic click after touch gestures — without this guard every scroll
  // raised the keyboard via the click->tap bridge below.
  var lastGestureEnd = 0;

  var stopMomentum = function () {
    if (momentumRaf) {
      cancelAnimationFrame(momentumRaf);
      momentumRaf = null;
    }
  };

  // Fullscreen TUIs (opencode, vim, htop) run on the alternate screen, which
  // has no scrollback: term.scrollLines() is a no-op there. Those apps opt
  // into mouse reporting instead (bubbletea enables SGR mouse mode), so
  // finger drags must reach them as wheel events. term.modes and
  // term.buffer.active are public xterm.js APIs (no proposed-API gate).
  var appMouseMode = function () {
    try {
      return (term.modes && term.modes.mouseTrackingMode) || 'none';
    } catch (e) {
      return 'none';
    }
  };
  var isAltScreen = function () {
    try {
      return !!(term.buffer && term.buffer.active && term.buffer.active.type === 'alternate');
    } catch (e) {
      return false;
    }
  };
  var cellAt = function (px, py) {
    var r = { left: 0, top: 0 };
    try {
      var br = termEl.getBoundingClientRect();
      r = { left: br.left, top: br.top };
    } catch (e) {}
    var w = 9, h = 18;
    try {
      var d = term._core && term._core._renderService && term._core._renderService.dimensions;
      if (d && d.css && d.css.cell) {
        w = d.css.cell.width || w;
        h = d.css.cell.height || h;
      }
    } catch (e2) {}
    var maxC = 80, maxR = 24;
    try {
      maxC = term.cols || maxC;
      maxR = term.rows || maxR;
    } catch (e3) {}
    // #terminal padding is 6px top / 8px left (see CSS above).
    var col = Math.floor((px - r.left - 8) / w) + 1;
    var row = Math.floor((py - r.top - 6) / h) + 1;
    return {
      col: Math.max(1, Math.min(maxC, col || 1)),
      row: Math.max(1, Math.min(maxR, row || 1))
    };
  };
  // Negative lines = finger dragged down = show older = wheel-up (64);
  // positive = wheel-down (65). SGR format: bubbletea-class apps enable it.
  var scrollByLines = function (lineDelta, px, py) {
    if (lineDelta === 0) return;
    if (appMouseMode() !== 'none') {
      var cell = cellAt(px, py);
      var btn = lineDelta < 0 ? 64 : 65;
      var count = Math.min(Math.abs(lineDelta), 12);
      for (var i = 0; i < count; i++) {
        post({ type: 'data', data: '\x1b[<' + btn + ';' + cell.col + ';' + cell.row + 'M' });
      }
      return;
    }
    if (!isAltScreen()) {
      term.scrollLines(lineDelta);
    }
    // Alt screen without mouse mode: nothing is scrollable (authentic
    // terminal behavior — the app owns all input there).
  };

  var getRowHeight = function () {
    try {
      if (term._core && term._core._renderService &&
          term._core._renderService.dimensions &&
          term._core._renderService.dimensions.actualCellHeight) {
        return term._core._renderService.dimensions.actualCellHeight;
      }
    } catch (e) {}
    return (term.options && term.options.fontSize ? term.options.fontSize * 1.25 : 18);
  };

  termEl.addEventListener('touchstart', function (e) {
    stopMomentum();
    // NOTE: no tap post here — touch-down also begins scroll/pinch
    // gestures, and raising the keyboard on every touch-down broke
    // scrolling (e.g. opencode TUI history). A tap is reported on
    // touchend only when no scroll/pinch happened (see below).
    if (e.touches.length === 1) {
      touchStartY = e.touches[0].pageY;
      touchStartX = e.touches[0].pageX;
      lastTouchY = touchStartY;
      lastTouchX = touchStartX;
      lastTouchTime = Date.now();
      touchVelocityY = 0;
      isTouchScrolling = false;
      scrollRemainder = 0;
    } else if (e.touches.length === 2) {
      isTouchScrolling = false;
      pinchStartDist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      pinchBaseFontSize = term.options.fontSize || 14;
    }
  }, { passive: true });

  termEl.addEventListener('touchmove', function (e) {
    if (e.touches.length === 1) {
      var touchY = e.touches[0].pageY;
      var touchX = e.touches[0].pageX;
      var deltaY = touchY - lastTouchY;
      var totalDeltaY = Math.abs(touchY - touchStartY);
      var totalDeltaX = Math.abs(touchX - touchStartX);

      if (!isTouchScrolling && totalDeltaY > 8 && totalDeltaY > totalDeltaX) {
        isTouchScrolling = true;
      }

      if (isTouchScrolling) {
        if (e.cancelable) e.preventDefault();
        var now = Date.now();
        var dt = Math.max(1, now - lastTouchTime);
        touchVelocityY = deltaY / dt;
        lastTouchTime = now;
        lastTouchY = touchY;
        lastTouchX = touchX;

        var rowH = getRowHeight();
        var rawLines = (-deltaY + scrollRemainder) / rowH;
        var wholeLines = Math.trunc(rawLines);
        scrollRemainder = (rawLines - wholeLines) * rowH;
        if (wholeLines !== 0) {
          scrollByLines(wholeLines, touchX, touchY);
        }
      }
    } else if (e.touches.length === 2 && pinchStartDist > 0) {
      if (e.cancelable) e.preventDefault();
      var dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      var scale = dist / pinchStartDist;
      var newSize = Math.max(10, Math.min(24, Math.round(pinchBaseFontSize * scale)));
      if (newSize !== term.options.fontSize) {
        term.options.fontSize = newSize;
        reportSize();
        post({ type: 'fontSize', size: newSize });
      }
    }
  }, { passive: false });

  termEl.addEventListener('touchend', function (e) {
    if (e.touches.length === 0) {
      var wasGesture = isTouchScrolling || pinchStartDist !== 0;
      if (wasGesture) {
        lastGestureEnd = Date.now();
      }
      if (!isTouchScrolling && pinchStartDist === 0) {
        post({ type: 'tap' });
      } else if (isTouchScrolling && Math.abs(touchVelocityY) > 0.15) {
        var velocity = touchVelocityY;
        var rowH = getRowHeight();
        var momentumStep = function () {
          if (Math.abs(velocity) < 0.04) {
            stopMomentum();
            return;
          }
          var deltaLines = (-velocity * 16) / rowH;
          var whole = Math.trunc(deltaLines);
          if (whole !== 0) {
            scrollByLines(whole, lastTouchX, lastTouchY);
          }
          velocity *= 0.92;
          momentumRaf = requestAnimationFrame(momentumStep);
        };
        momentumRaf = requestAnimationFrame(momentumStep);
      }
      isTouchScrolling = false;
      pinchStartDist = 0;
    }
  }, { passive: true });

  termEl.addEventListener('touchcancel', function () {
    stopMomentum();
    isTouchScrolling = false;
    pinchStartDist = 0;
  }, { passive: true });
  var resizeTimer = null;
  var fitAttempts = 0;
  var lastC = 0, lastR = 0;
  var reportSize = function () {
    try {
      // Never fit or report before layout exists: fitting a zero-size parent
      // slams xterm to a 2-col grid whose soft wraps never rejoin on grow —
      // that stale wrap is exactly the "frozen UI" look. Retry quietly; the
      // kernel keeps its ptyOpen size until the first real measurement, and
      // the JS side replays history once the true grid lands.
      var parent = term.element && term.element.parentElement;
      var pw = parent ? parent.clientWidth : 0;
      var ph = parent ? parent.clientHeight : 0;
      if (pw < 40 || ph < 30) {
        if (fitAttempts < 200) {
          fitAttempts++;
          setTimeout(reportSize, 100);
        }
        return;
      }
      fitAttempts = 0;
      fit.fit();
      // Clamp: never wedge the shell below a usable grid; dedupe so only
      // real changes signal (each post is a SIGWINCH + shell redraw).
      var c = Math.max(term.cols, 10), r = Math.max(term.rows, 2);
      if (c === lastC && r === lastR) return;
      lastC = c; lastR = r;
      post({ type: 'resize', cols: c, rows: r,
             vw: window.innerWidth, vh: window.innerHeight });
    } catch (e) {}
  };
  var scrollCursorIntoView = function () {
    try {
      term.scrollToBottom();
      if (term.buffer && term.buffer.active) {
        var buf = term.buffer.active;
        var targetLine = Math.max(buf.baseY, buf.baseY + buf.cursorY - term.rows + 1);
        if (targetLine > buf.viewportY) {
          term.scrollToLine(targetLine);
        }
      }
    } catch (e) {}
  };

  term.onData(function (d) {
    post({ type: 'data', data: d });
    if (kbVisible) {
      scrollCursorIntoView();
    }
  });
  window.addEventListener('click', function () {
    // Drop the synthetic click that follows a scroll/pinch gesture —
    // only genuine taps (already reported by touchend) may raise the IME.
    if (Date.now() - lastGestureEnd < 750) return;
    post({ type: 'tap' });
  });
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      reportSize();
      scrollCursorIntoView();
    }, 80);
  });
  window.__astraWrite = function (b64) {
    try {
      var bin = atob(b64), n = bin.length, bytes = new Uint8Array(n);
      for (var i = 0; i < n; i++) bytes[i] = bin.charCodeAt(i);
      term.write(bytes, function () {
        if (kbVisible) {
          scrollCursorIntoView();
        }
      });
    } catch (e) {}
  };
  window.__astraReset = function () { try { term.reset(); } catch (e) {} };
  window.__astraFit = function () { fitAttempts = 0; reportSize(); };
  window.__astraFocus = function () {
    try {
      term.focus();
      scrollCursorIntoView();
    } catch (e) {}
  };
  window.__astraSetFontSize = function (px) { try { term.options.fontSize = px; reportSize(); } catch (e) {} };
  window.__astraSetTheme = function (thm) {
    try {
      term.options.theme = thm;
      if (thm && thm.background) {
        document.body.style.backgroundColor = thm.background;
      }
      reportSize();
    } catch (e) {}
  };
  window.__astraGetSelection = function () {
    try { post({ type: 'selection', text: term.getSelection() }); }
    catch (e) { post({ type: 'selection', text: '' }); }
  };
  window.__astraSelectAll = function () { try { term.selectAll(); } catch (e) {} };

  // Keyboard-aware layout handling: re-fit grid to match adjusted viewport
  // and scroll terminal to bottom so active prompt and highlighted input remain in view.
  var kbVisible = false;

  window.__astraSetKeyboardVisible = function (visible, visibleRows) {
    kbVisible = visible;
    fitAttempts = 0;
    var doFit = function () {
      reportSize();
      scrollCursorIntoView();
    };
    doFit();
    setTimeout(doFit, 80);
    setTimeout(doFit, 200);
    setTimeout(doFit, 350);
  };

  reportSize();
  post({ type: 'ready' });
  // Layout often settles after first paint (keyboard, flex): re-fit once so
  // the kernel grid matches the true viewport, not a transient one.
  setTimeout(function () {
    reportSize();
    scrollCursorIntoView();
  }, 800);
})();
</script>
</body>
</html>`;

const withLibs = html
  .replaceAll("__XTERM_CSS__", () => xtermCss)
  .replaceAll("__XTERM_JS__", () => xtermJs)
  .replaceAll("__FIT_JS__", () => fitJs)
  .replaceAll("__WEBLINKS_JS__", () => linksJs);

const out = `// GENERATED — do not hand-edit. Regenerate with: node scripts/build-xterm-html.js
// Inlines xterm.js + fit addon + css into one offline page; colors/fonts are
// token-replaced at runtime by buildXtermHtml().
// Speed: the ~300KB page literal evaluates on first terminal use, not app
// start (this module loads with the IDE shell). Cached after first build.
export interface XtermHtmlOptions {
  background: string;
  foreground: string;
  cursor: string;
  fontSize: number;
  theme?: Record<string, string>;
}

let blobCache: string | null = null;
function getBlob(): string {
  if (blobCache !== null) return blobCache;
  blobCache = ${JSON.stringify(withLibs)};
  return blobCache;
}

export function buildXtermHtml(o: XtermHtmlOptions): string {
  const themeObj = o.theme || {
    background: o.background,
    foreground: o.foreground,
    cursor: o.cursor,
  };
  return getBlob().replaceAll("__BG__", () => o.background)
    .replaceAll("__FG__", () => o.foreground)
    .replaceAll("__CURSOR__", () => o.cursor)
    .replaceAll("__FONT__", () => String(o.fontSize))
    .replaceAll("__THEME_JSON__", () => JSON.stringify(themeObj));
}
`;

const outPath = path.join(ROOT, "src/ide/components/terminal/xtermHtml.generated.ts");
fs.writeFileSync(outPath, out);
console.log("wrote", outPath, Buffer.byteLength(out), "bytes");
