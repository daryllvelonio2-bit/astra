/**
 * Lets the editor's floating find panel claim the Android back press before
 * anything else (it has no close button by design). EditorView registers a
 * closer; useSystemBackHandler tries it first.
 */

let closer: (() => boolean) | null = null;

export function registerFindCloser(fn: () => boolean): void {
  closer = fn;
}

export function unregisterFindCloser(): void {
  closer = null;
}

/** True when a registered panel consumed the press. */
export function tryCloseFindPanel(): boolean {
  try {
    return closer ? closer() : false;
  } catch (_) {
    return false;
  }
}
