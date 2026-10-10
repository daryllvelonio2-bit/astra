/**
 * Reject a promise that has not settled within `ms`, so a hung network call
 * shows an error instead of an endless spinner. The original promise is not
 * aborted (it cannot be, from here) — the caller's own mounted guard ignores
 * its late result. Shared by the GitHub account section and its profile body so
 * neither file grows its own copy.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
