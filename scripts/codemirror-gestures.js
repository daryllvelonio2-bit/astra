// Multi-touch gestures for the Astra editor WebView: pinch-to-zoom relay,
// and single-touch left-edge swipe to pull the file explorer sidebar open.
// Imported by codemirror-entry.js via initEditorGestures(view).
// All messages go through the entry's shared `post` (set via setGesturePost).

let postFn = null;
let resetDoubleTapFn = null;

export function setGesturePost(fn) {
  postFn = fn;
}

// Injected by the entry: resets its double-tap detector (two-finger touches
// must never count as the second tap of a double-tap).
export function setDoubleTapReset(fn) {
  resetDoubleTapFn = fn;
}

function post(msg) {
  if (postFn) postFn(msg);
}

// Multi-touch gestures & pinch-to-zoom
let touchStartDist = 0;
let touchStartAbsDx = 0;
let isPinching = false;

// Single-touch scroll against left boundary -> pull explorer
let singleTouchStartScreenX = 0;
let singleTouchStartScreenY = 0;
let singleTouchStartTime = 0;
let isPullingSidebar = false;
let pullInitialScrollLeft = 0;
let isSidebarPullEnabled = false;

export function setSidebarPullEnabled(enabled) {
  isSidebarPullEnabled = !!enabled;
}

export function initEditorGestures(view) {
  window.addEventListener(
    "touchstart",
    function (e) {
      if (e.touches && e.touches.length === 2) {
        if (resetDoubleTapFn) resetDoubleTapFn();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        touchStartDist = Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY);
        touchStartAbsDx = Math.abs(t2.pageX - t1.pageX);
        isPinching = true;
        post({
          type: "gestureTouchStart",
          dist: touchStartDist,
          absDx: touchStartAbsDx,
        });
      } else if (isPinching) {
        isPinching = false;
        touchStartDist = 0;
        post({ type: "gestureTouchEnd" });
      }

      if (e.touches && e.touches.length === 1) {
        const t = e.touches[0];
        singleTouchStartScreenX = t.screenX || t.pageX;
        singleTouchStartScreenY = t.screenY || t.pageY;
        singleTouchStartTime = Date.now();
        isPullingSidebar = false;
        pullInitialScrollLeft = view.scrollDOM ? view.scrollDOM.scrollLeft : 0;
      }
    },
    { passive: true }
  );

  window.addEventListener(
    "touchmove",
    function (e) {
      if (isPinching && e.touches && e.touches.length === 2 && touchStartDist > 0) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDist = Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY);
        const currentAbsDx = Math.abs(t2.pageX - t1.pageX);
        post({
          type: "gestureTouchMove",
          dist: currentDist,
          absDx: currentAbsDx,
        });
        if (e.cancelable) {
          e.preventDefault();
        }
      } else if (isSidebarPullEnabled && !isPinching && e.touches && e.touches.length === 1) {
        const t = e.touches[0];
        const curX = t.screenX || t.pageX;
        const curY = t.screenY || t.pageY;
        const dx = curX - singleTouchStartScreenX;
        const dy = curY - singleTouchStartScreenY;
        const currentScrollLeft = view.scrollDOM ? view.scrollDOM.scrollLeft : 0;

        if (!isPullingSidebar) {
          // If swiped rightwards past 12px, predominantly horizontal, and scroll is at left edge
          if (dx > 12 && Math.abs(dx) > Math.abs(dy) * 1.1 && (pullInitialScrollLeft <= 1 || currentScrollLeft <= 1)) {
            isPullingSidebar = true;
            post({ type: "editorPullStart" });
          }
        }

        if (isPullingSidebar) {
          post({ type: "editorPullMove", dx: Math.max(0, dx) });
          if (e.cancelable) {
            e.preventDefault();
          }
        }
      }
    },
    { passive: false }
  );

  function handleTouchEnd(e) {
    if (isPinching) {
      isPinching = false;
      touchStartDist = 0;
      post({ type: "gestureTouchEnd" });
    }
    if (isPullingSidebar) {
      isPullingSidebar = false;
      const dt = Math.max(1, Date.now() - singleTouchStartTime);
      const lastTouch = (e && e.changedTouches && e.changedTouches[0]) || (e && e.touches && e.touches[0]);
      const lastX = lastTouch ? (lastTouch.screenX || lastTouch.pageX) : singleTouchStartScreenX;
      const dx = lastX - singleTouchStartScreenX;
      const vx = dx / dt;
      post({ type: "editorPullEnd", dx: Math.max(0, dx), vx: vx });
    }
  }

  window.addEventListener("touchend", handleTouchEnd, { passive: true });
  window.addEventListener("touchcancel", function () {
    if (isPinching) {
      isPinching = false;
      post({ type: "gestureTouchEnd" });
    }
    if (isPullingSidebar) {
      isPullingSidebar = false;
      post({ type: "editorPullEnd", dx: 0, vx: 0 });
    }
  }, { passive: true });
}
