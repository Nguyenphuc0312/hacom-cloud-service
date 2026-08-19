/**
 * @fileoverview Stale-deploy chunk reload guard.
 *
 * When a new version is deployed, clients on the old build fail to load hashed
 * JS/CSS chunks (see {@link isChunkLoadError}). The fix is a single hard reload
 * to fetch the new index.html + asset manifest. This module performs that reload
 * exactly once per incident, guarded by a sessionStorage flag so a persistently
 * broken deploy cannot trap the user in an infinite reload loop.
 */

import { isChunkLoadError } from "./errorClassification";
import { logger } from "./logger";

const RELOAD_FLAG = "chat-web:chunk-reload-attempted";

const safeSession = (): Storage | null => {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    // sessionStorage can throw in private mode / sandboxed iframes.
    return null;
  }
};

export const wasChunkReloadAttempted = (): boolean => {
  const store = safeSession();
  if (!store) return false;
  try {
    return store.getItem(RELOAD_FLAG) === "1";
  } catch {
    return false;
  }
};

export const markChunkReloadAttempted = (): void => {
  const store = safeSession();
  try {
    store?.setItem(RELOAD_FLAG, "1");
  } catch {
    // ignore — worst case we lose the loop guard, handled by the time check below
  }
};

export const clearChunkReloadFlag = (): void => {
  const store = safeSession();
  try {
    store?.removeItem(RELOAD_FLAG);
  } catch {
    // ignore
  }
};

/**
 * Reload the page once to recover from a stale-deploy chunk failure.
 *
 * @returns `true` if a reload was triggered (caller should render a brief
 * "updating" placeholder while it happens); `false` if a reload was already
 * attempted this session — meaning the reload did NOT fix it, so the caller must
 * fall back to a normal error UI instead of looping.
 */
export const attemptChunkReloadOnce = (): boolean => {
  if (wasChunkReloadAttempted()) {
    logger.warn("chunk-reload", "give_up_after_reload", undefined, {
      debugOnly: false,
    });
    return false;
  }

  markChunkReloadAttempted();
  logger.warn("chunk-reload", "reloading_for_new_version", undefined, {
    debugOnly: false,
  });

  if (typeof window !== "undefined") {
    window.location.reload();
  }
  return true;
};

/**
 * Clear the loop guard once the app has demonstrably booted on the current
 * build, so a *future* (unrelated) chunk failure during navigation can still
 * trigger its own one-shot reload. Called after a successful app mount with a
 * short delay; if the app instead crashed at mount, the boundary runs first and
 * the flag stays set (preventing a loop).
 */
export const scheduleChunkReloadFlagReset = (delayMs = 5000): void => {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    clearChunkReloadFlag();
  }, delayMs);
};

/**
 * Install global listeners that catch chunk failures surfacing as uncaught
 * errors / unhandled promise rejections (e.g. a dynamic import() that is not
 * wrapped by a React error boundary). Mirrors the one-shot reload behaviour.
 */
export const installChunkReloadGuard = (): void => {
  if (typeof window === "undefined") return;

  const handle = (error: unknown): void => {
    if (!isChunkLoadError(error)) return;
    attemptChunkReloadOnce();
  };

  window.addEventListener("error", (event: ErrorEvent) => {
    handle(event.error ?? event.message);
  });

  window.addEventListener(
    "unhandledrejection",
    (event: PromiseRejectionEvent) => {
      handle(event.reason);
    },
  );
};
