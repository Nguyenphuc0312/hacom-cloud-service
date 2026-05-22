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

export const refreshAccessTokenShared = async (
  trigger: AuthRefreshTrigger,
): Promise<string> => {
  if (!refreshPromise) {
    refreshPromise = performRefresh(trigger)
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
