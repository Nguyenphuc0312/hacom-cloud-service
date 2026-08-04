/**
 * Keyed in-flight request deduper ("single flight").
 *
 * Concurrent calls with the same key share one promise; the slot clears when
 * the promise settles (resolve OR reject), so this dedupes concurrent work
 * WITHOUT caching results — no staleness risk. Layer a TTL cache on top when
 * you also want fresh-read reuse (see `userProfileCache`, `SIGNED_URL_CACHE`).
 *
 * An empty key disables deduping (no stable identity → always run).
 *
 * Usage:
 *   const flight = createSingleFlight<Result>();
 *   const value = await flight(key, () => fetchThing(key));
 */
export type SingleFlight<T> = (
  key: string,
  fn: () => Promise<T>,
) => Promise<T>;

export const createSingleFlight = <T>(): SingleFlight<T> => {
  const inFlight = new Map<string, Promise<T>>();

  return (key, fn) => {
    if (!key) {
      return fn();
    }

    const existing = inFlight.get(key);
    if (existing) {
      return existing;
    }

    const request = fn();
    inFlight.set(key, request);
    const clear = () => {
      // Only clear if we're still the active request for this key (a newer
      // request may have replaced ours after settle ordering).
      if (inFlight.get(key) === request) {
        inFlight.delete(key);
      }
    };
    // Handle both branches so a rejected request is not an unhandled rejection
    // here; the caller still awaits `request` and handles errors itself.
    request.then(clear, clear);
    return request;
  };
};
