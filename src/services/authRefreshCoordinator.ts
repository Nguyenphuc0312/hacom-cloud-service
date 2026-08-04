import axios from "axios";
import { AUTH_CONFIG } from "../config";
import { buildAuthEndpoint } from "../lib/authPath";
import { AUTH_ENDPOINTS } from "../lib/authEndpoints";
import { unwrapApiSuccess } from "../lib/apiContract";
import {
  getAccessToken,
  getCsrfToken,
  getRefreshToken,
  isAuthSessionActive,
  isRefreshTokenCookieMode,
  isRememberMeEnabled,
  storeTokens,
  updateAccessToken,
} from "./tokenService";
import { getJwtExpirationMs, isTokenExpiringSoon } from "../utils/jwtHelpers";
import {
  createDefinitiveRefreshError,
  isDefiniteAuthRefreshFailure,
} from "./authRefreshErrorClassifier";
import { logger } from "../utils/logger";

type RefreshPayload = {
  accessToken?: string;
  refreshToken?: string;
  tokens?: {
    accessToken?: string;
    refreshToken?: string;
  };
};

export type AuthRefreshTrigger =
  | "bootstrap"
  | "http_401"
  | "ws_reauth_required"
  | "ws_unauthorized"
  | "ws_close_4401"
  | "ws_connect"
  | "proactive";

export type AuthRefreshEvent =
  | {
      type: "token_refreshed";
      trigger: AuthRefreshTrigger;
      accessToken: string;
      refreshToken: string | null;
      expiresAtMs: number | null;
    }
  | {
      type: "refresh_failed";
      trigger: AuthRefreshTrigger;
      error: unknown;
    };

type AuthRefreshListener = (event: AuthRefreshEvent) => void;

let refreshPromise: Promise<string> | null = null;
const listeners = new Set<AuthRefreshListener>();

const emitRefreshEvent = (event: AuthRefreshEvent): void => {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      logger.error("auth-refresh", "listener_failed", error);
    }
  });
};

const resolveRefreshTokens = (
  payload: RefreshPayload,
): { accessToken: string | null; refreshToken: string | null } => {
  const accessToken =
    payload.tokens?.accessToken ?? payload.accessToken ?? null;
  const refreshToken =
    payload.tokens?.refreshToken ?? payload.refreshToken ?? null;

  return { accessToken, refreshToken };
};

const applyRefreshedTokens = (
  accessToken: string,
  refreshToken: string | null,
): void => {
  if (isRefreshTokenCookieMode()) {
    updateAccessToken(accessToken);
    return;
  }

  // Use the rotated token if the backend provided one; otherwise keep the
  // existing refresh token. Some backends don't rotate on every refresh call.
  const tokenToStore = refreshToken ?? getRefreshToken();
  if (!tokenToStore) {
    throw new Error("No refresh token available to persist after refresh");
  }

  storeTokens(accessToken, tokenToStore, isRememberMeEnabled());
};

const performRefresh = async (trigger: AuthRefreshTrigger): Promise<string> => {
  if (!isAuthSessionActive()) {
    throw new Error("Auth session is inactive");
  }

  const cookieMode = isRefreshTokenCookieMode();
  const refreshToken = getRefreshToken();
  if (!cookieMode && !refreshToken) {
    throw new Error("Missing refresh token");
  }

  const csrfToken = cookieMode ? getCsrfToken() : null;
  // In cookie mode the refresh token lives in an HttpOnly cookie — the browser
  // sends it automatically. But the CSRF double-submit pattern also requires the
  // csrfToken value to be forwarded as a header. If that cookie is not readable
  // via document.cookie (e.g. due to a cookie path mismatch on the server), the
  // request would reach the backend without the header and be rejected with
  // "CSRF header missing". Fail fast here to trigger a clean logout instead of
  // letting the server reject the request and potentially causing a retry loop.
  if (cookieMode && !csrfToken) {
    throw new Error("CSRF token not available");
  }

  // buildAuthEndpoint resolves against canonical AUTH_BASE_URL (/api/v1/auth).
  const response = await axios.post(
    buildAuthEndpoint(AUTH_ENDPOINTS.refresh),
    refreshToken ? { refreshToken } : undefined,
    {
      withCredentials: cookieMode,
      headers: {
        "Content-Type": "application/json",
        "X-Api-Contract": "2",
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      },
    },
  );

  const payload = unwrapApiSuccess<RefreshPayload>(response.data);
  const { accessToken, refreshToken: rotatedRefreshToken } =
    resolveRefreshTokens(payload);

  if (!accessToken) {
    throw new Error("Refresh response missing access token");
  }

  applyRefreshedTokens(accessToken, rotatedRefreshToken);
  emitRefreshEvent({
    type: "token_refreshed",
    trigger,
    accessToken,
    refreshToken: rotatedRefreshToken,
    expiresAtMs: getJwtExpirationMs(accessToken),
  });

  return accessToken;
};

export const subscribeToAuthRefreshEvents = (
  listener: AuthRefreshListener,
): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// ---------------------------------------------------------------------------
// Cross-tab single-flight refresh coordination.
//
// Per-tab single flight (refreshPromise) prevents one tab from issuing parallel
// /auth/refresh calls. But with multiple tabs each holding the same refresh
// token in localStorage, they can refresh near-simultaneously: the first
// rotates the token, later ones present a stale token and — past the backend
// grace window — trip reuse-detection, which revokes the whole session family
// and logs everyone out. A best-effort cross-tab lock funnels refreshes through
// one tab and lets the others reuse the rotated token.
// ---------------------------------------------------------------------------

const REFRESH_CHANNEL_NAME = "auth-refresh-coordination";
const REFRESH_LOCK_KEY = "auth:refresh:lock";
const REFRESH_LOCK_TTL_MS = 15_000;
const REFRESH_TAB_ID = Math.random().toString(36).slice(2);

type RefreshLock = { ownerTabId: string; startedAt: number };

type CrossTabRefreshEvent =
  | { type: "refresh_started"; ownerTabId: string; startedAt: number }
  | {
      type: "refresh_success";
      ownerTabId: string;
      accessToken: string;
      refreshToken: string | null;
      completedAt: number;
    }
  | { type: "refresh_transient_failure"; ownerTabId: string; reason: string }
  | { type: "refresh_definitive_failure"; ownerTabId: string; reason: string };

const hasBroadcastChannel = (): boolean =>
  typeof BroadcastChannel !== "undefined" && typeof window !== "undefined";

const isBrowserStorage = (): boolean =>
  typeof window !== "undefined" && typeof localStorage !== "undefined";

let refreshChannel: BroadcastChannel | null = null;
const getRefreshChannel = (): BroadcastChannel | null => {
  if (!hasBroadcastChannel()) return null;
  if (!refreshChannel) {
    refreshChannel = new BroadcastChannel(REFRESH_CHANNEL_NAME);
  }
  return refreshChannel;
};

const broadcastRefreshEvent = (event: CrossTabRefreshEvent): void => {
  try {
    getRefreshChannel()?.postMessage(event);
  } catch (error) {
    logger.warn("auth-refresh", "cross_tab_broadcast_failed", error);
  }
};

const readRefreshLock = (): RefreshLock | null => {
  if (!isBrowserStorage()) return null;
  try {
    const raw = localStorage.getItem(REFRESH_LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RefreshLock;
    if (
      typeof parsed?.ownerTabId !== "string" ||
      typeof parsed?.startedAt !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const isLockExpired = (lock: RefreshLock): boolean =>
  Date.now() - lock.startedAt > REFRESH_LOCK_TTL_MS;

const acquireRefreshLock = (): void => {
  if (!isBrowserStorage()) return;
  try {
    localStorage.setItem(
      REFRESH_LOCK_KEY,
      JSON.stringify({ ownerTabId: REFRESH_TAB_ID, startedAt: Date.now() }),
    );
  } catch {
    // localStorage may be unavailable (private mode) — proceed without lock.
  }
};

const releaseRefreshLock = (): void => {
  if (!isBrowserStorage()) return;
  try {
    const lock = readRefreshLock();
    if (!lock || lock.ownerTabId === REFRESH_TAB_ID) {
      localStorage.removeItem(REFRESH_LOCK_KEY);
    }
  } catch {
    // ignore
  }
};

const applyReceivedTokens = (
  accessToken: string,
  refreshToken: string | null,
  trigger: AuthRefreshTrigger,
): void => {
  if (isRefreshTokenCookieMode()) {
    updateAccessToken(accessToken);
  } else {
    const tokenToStore = refreshToken ?? getRefreshToken();
    if (tokenToStore) {
      storeTokens(accessToken, tokenToStore, isRememberMeEnabled());
    } else {
      updateAccessToken(accessToken);
    }
  }

  emitRefreshEvent({
    type: "token_refreshed",
    trigger,
    accessToken,
    refreshToken,
    expiresAtMs: getJwtExpirationMs(accessToken),
  });
};

const waitForRefreshResult = (
  ownerTabId: string,
  timeoutMs: number,
): Promise<CrossTabRefreshEvent | null> => {
  const channel = getRefreshChannel();
  if (!channel) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: CrossTabRefreshEvent | null) => {
      if (settled) return;
      settled = true;
      channel.removeEventListener("message", onMessage as EventListener);
      window.clearTimeout(timer);
      resolve(result);
    };

    const onMessage = (ev: MessageEvent<CrossTabRefreshEvent>) => {
      const data = ev.data;
      if (!data || data.ownerTabId !== ownerTabId) return;
      if (
        data.type === "refresh_success" ||
        data.type === "refresh_transient_failure" ||
        data.type === "refresh_definitive_failure"
      ) {
        finish(data);
      }
    };

    const timer = window.setTimeout(() => finish(null), timeoutMs);
    channel.addEventListener("message", onMessage as EventListener);
  });
};

const reasonFromError = (error: unknown): string =>
  error instanceof Error ? error.message : "refresh_failed";

const coordinatedRefresh = async (
  trigger: AuthRefreshTrigger,
): Promise<string> => {
  // If another tab is mid-refresh, wait for its result instead of racing it.
  const existingLock = readRefreshLock();
  if (
    existingLock &&
    existingLock.ownerTabId !== REFRESH_TAB_ID &&
    !isLockExpired(existingLock) &&
    hasBroadcastChannel()
  ) {
    const result = await waitForRefreshResult(
      existingLock.ownerTabId,
      REFRESH_LOCK_TTL_MS,
    );

    if (result?.type === "refresh_success") {
      applyReceivedTokens(result.accessToken, result.refreshToken, trigger);
      return result.accessToken;
    }
    if (result?.type === "refresh_definitive_failure") {
      throw createDefinitiveRefreshError(result.reason);
    }
    // transient failure or timeout: fall through and attempt to refresh here.
  }

  acquireRefreshLock();
  broadcastRefreshEvent({
    type: "refresh_started",
    ownerTabId: REFRESH_TAB_ID,
    startedAt: Date.now(),
  });

  try {
    const accessToken = await performRefresh(trigger);
    broadcastRefreshEvent({
      type: "refresh_success",
      ownerTabId: REFRESH_TAB_ID,
      accessToken,
      refreshToken: getRefreshToken(),
      completedAt: Date.now(),
    });
    return accessToken;
  } catch (error) {
    if (isDefiniteAuthRefreshFailure(error)) {
      broadcastRefreshEvent({
        type: "refresh_definitive_failure",
        ownerTabId: REFRESH_TAB_ID,
        reason: reasonFromError(error),
      });
    } else {
      broadcastRefreshEvent({
        type: "refresh_transient_failure",
        ownerTabId: REFRESH_TAB_ID,
        reason: reasonFromError(error),
      });
    }
    throw error;
  } finally {
    releaseRefreshLock();
  }
};

export const refreshAccessTokenShared = async (
  trigger: AuthRefreshTrigger,
): Promise<string> => {
  if (!refreshPromise) {
    refreshPromise = coordinatedRefresh(trigger)
      .catch((error) => {
        emitRefreshEvent({
          type: "refresh_failed",
          trigger,
          error,
        });
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
};

export const ensureFreshAccessToken = async (
  trigger: AuthRefreshTrigger,
  minValidityMs: number = AUTH_CONFIG.TOKEN_REFRESH_THRESHOLD,
): Promise<string> => {
  const accessToken = getAccessToken();
  if (accessToken && !isTokenExpiringSoon(accessToken, minValidityMs)) {
    return accessToken;
  }

  return refreshAccessTokenShared(trigger);
};
