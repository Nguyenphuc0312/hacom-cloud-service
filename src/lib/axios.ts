/**
 * @fileoverview Centralized Axios client configuration.
 * Handles auth header injection, refresh lock/queue and request cancellation.
 */

import axios, { AxiosError, AxiosHeaders } from "axios";
import type { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import {
  PUBLIC_CHAT_CONTRACT_HEADER,
  PUBLIC_CHAT_CONTRACT_VERSION,
} from "@hacom/chat-shared-types/runtime";
import { API_BASE_URL, AUTH_BASE_URL, USE_AUTH_SERVICE } from "../config";
import {
  authBaseUrl,
  buildAuthEndpoint,
  normalizeAuthRequestPath,
} from "./authPath";
import { warnLegacyRoomsRequest } from "./conversationIdentity";
import i18n from "../i18n";
import {
  clearTokens,
  getAccessToken,
  isAuthSessionActive,
  isRefreshTokenCookieMode,
} from "../services/tokenService";
import { updateSocketAuth } from "./socket";
import { refreshAccessTokenShared } from "../services/authRefreshCoordinator";
import { logger } from "../utils/logger";

type AuthFailureReason = "missing_refresh_token" | "refresh_failed";
type AuthFailureHandler = (reason: AuthFailureReason) => void | Promise<void>;

interface AuthRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
  _requestId?: string;
  _managedSignal?: boolean;
}

const PUBLIC_ENDPOINT_PATTERNS = [
  /\/auth\/login$/i,
  /\/auth\/register$/i,
  /\/auth\/refresh$/i,
  /\/auth\/forgot-password$/i,
  /\/auth\/reset-password$/i,
  /\/users\/check-username(?:\/|$)/i,
];
const API_CONTRACT_HEADER = PUBLIC_CHAT_CONTRACT_HEADER;
const API_CONTRACT_VERSION = PUBLIC_CHAT_CONTRACT_VERSION;

const toOrigin = (baseUrl: string): string | null => {
  try {
    const fallbackBase =
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost";
    return new URL(baseUrl, fallbackBase).origin;
  } catch {
    return null;
  }
};

const TRUSTED_BASE_ORIGINS = (() => {
  const trusted = new Set<string>();
  const apiOrigin = toOrigin(API_BASE_URL);
  const authOrigin = toOrigin(AUTH_BASE_URL);
  if (apiOrigin) trusted.add(apiOrigin);
  if (authOrigin) trusted.add(authOrigin);
  if (typeof window !== "undefined") {
    trusted.add(window.location.origin);
  }
  return trusted;
})();

let authFailureHandler: AuthFailureHandler | null = null;
let authFailureNotified = false;
let refreshEndpointLogged = false;

const pendingRequestControllers = new Map<string, AbortController>();

const isPublicEndpoint = (url?: string): boolean => {
  if (!url) return false;

  const normalized = url.startsWith("http")
    ? new URL(url).pathname
    : url.split("?")[0];

  return PUBLIC_ENDPOINT_PATTERNS.some((pattern) => pattern.test(normalized));
};

const isTrustedRequestOrigin = (
  config: InternalAxiosRequestConfig,
): boolean => {
  const targetUrl = config.url;
  if (!targetUrl) return false;

  try {
    const fallbackBase = config.baseURL
      ? new URL(
          config.baseURL,
          typeof window !== "undefined"
            ? window.location.origin
            : "http://localhost",
        ).toString()
      : typeof window !== "undefined"
        ? window.location.origin
        : API_BASE_URL;
    const resolved = new URL(targetUrl, fallbackBase);
    return TRUSTED_BASE_ORIGINS.has(resolved.origin);
  } catch {
    return false;
  }
};

const setAuthHeader = (
  config: InternalAxiosRequestConfig,
  accessToken: string | null,
): void => {
  config.headers = config.headers ?? {};
  const headers = config.headers as AxiosHeaders | Record<string, string>;

  if (headers instanceof AxiosHeaders) {
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
      return;
    }

    headers.delete("Authorization");
    return;
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  } else {
    delete headers.Authorization;
  }
};

const buildRequestId = (config: InternalAxiosRequestConfig): string =>
  `${config.method ?? "get"}:${config.url ?? "unknown"}:${Date.now()}:${Math.random()
    .toString(36)
    .slice(2)}`;

const releasePendingRequest = (config?: InternalAxiosRequestConfig): void => {
  if (!config) return;
  const requestId = (config as AuthRequestConfig)._requestId;
  if (requestId) {
    pendingRequestControllers.delete(requestId);
  }
};

const notifyAuthFailure = (reason: AuthFailureReason): void => {
  if (authFailureNotified) return;

  authFailureNotified = true;
  clearTokens();
  if (authFailureHandler) {
    void authFailureHandler(reason);
  }
};

const refreshAccessToken = async (): Promise<string> => {
  if (!isAuthSessionActive()) {
    notifyAuthFailure("refresh_failed");
    throw new Error(i18n.t("error:auth.sessionInactive"));
  }

  try {
    const refreshEndpoint = buildAuthEndpoint("/refresh");
    if (import.meta.env.DEV && !refreshEndpointLogged) {
      refreshEndpointLogged = true;
      logger.info("auth-refresh", "endpoint_resolved", {
        USE_AUTH_SERVICE,
        refreshEndpoint,
      });
    }
    const accessToken = await refreshAccessTokenShared("http_401");
    updateSocketAuth(accessToken);

    authFailureNotified = false;
    return accessToken;
  } catch (error) {
    notifyAuthFailure("refresh_failed");
    throw error;
  }
};

export const setAuthFailureHandler = (handler: AuthFailureHandler): void => {
  authFailureHandler = handler;
};

export const resetAuthFailureState = (): void => {
  authFailureNotified = false;
};

export const cancelPendingRequests = (reason: string = "cancelled"): void => {
  pendingRequestControllers.forEach((controller) => {
    controller.abort(reason);
  });
  pendingRequestControllers.clear();
};

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
    [API_CONTRACT_HEADER]: API_CONTRACT_VERSION,
  },
});

/**
 * Dedicated Axios client for auth endpoints (Stage 1 – body mode).
 *
 * When USE_AUTH_SERVICE=true the baseURL points to the dedicated
 * chat-auth-service canonical public contract (/api/v1/auth/*);
 * otherwise it falls back to the api-service so
 * rollback is a single env-var toggle.
 *
 * This client does NOT attach Authorization automatically (auth
 * endpoints are public or manage their own bearer in the call-site).
 * withCredentials is false in Stage 1 (body mode).
 */
export const authClient: AxiosInstance = axios.create({
  baseURL: authBaseUrl,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    [API_CONTRACT_HEADER]: API_CONTRACT_VERSION,
  },
  withCredentials: isRefreshTokenCookieMode(),
});

authClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.url = normalizeAuthRequestPath(config.url);
  config.headers = config.headers ?? {};

  const headers = config.headers as AxiosHeaders | Record<string, string>;
  if (headers instanceof AxiosHeaders) {
    headers.set(API_CONTRACT_HEADER, API_CONTRACT_VERSION);
  } else {
    headers[API_CONTRACT_HEADER] = API_CONTRACT_VERSION;
  }

  return config;
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const requestConfig = config as AuthRequestConfig;
    const requestId = buildRequestId(config);
    requestConfig._requestId = requestId;

    if (!requestConfig.signal || requestConfig._managedSignal) {
      const controller = new AbortController();
      requestConfig.signal = controller.signal;
      requestConfig._managedSignal = true;
      pendingRequestControllers.set(requestId, controller);
    }

    const shouldAttachAuth =
      !isPublicEndpoint(config.url) && isTrustedRequestOrigin(config);
    requestConfig.headers = requestConfig.headers ?? {};
    const contractHeaders = requestConfig.headers as
      | AxiosHeaders
      | Record<string, string>;
    if (contractHeaders instanceof AxiosHeaders) {
      contractHeaders.set(API_CONTRACT_HEADER, API_CONTRACT_VERSION);
    } else {
      contractHeaders[API_CONTRACT_HEADER] = API_CONTRACT_VERSION;
    }

    if (!shouldAttachAuth) {
      if (
        typeof config.url === "string" &&
        /\/rooms(?:\/|$)/i.test(config.url.split("?")[0] ?? "")
      ) {
        warnLegacyRoomsRequest(config.url);
      }
      setAuthHeader(config, null);
      return config;
    }

    const accessToken = getAccessToken();
    if (
      typeof config.url === "string" &&
      /\/rooms(?:\/|$)/i.test(config.url.split("?")[0] ?? "")
    ) {
      warnLegacyRoomsRequest(config.url);
    }
    setAuthHeader(config, accessToken);
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response) => {
    releasePendingRequest(response.config);
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as AuthRequestConfig | undefined;
    releasePendingRequest(originalRequest);

    if (
      !originalRequest ||
      error.response?.status !== 401 ||
      originalRequest._retry ||
      !isTrustedRequestOrigin(originalRequest) ||
      isPublicEndpoint(originalRequest.url) ||
      /\/auth\/refresh$/i.test((originalRequest.url ?? "").split("?")[0])
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const newAccessToken = await refreshAccessToken();
      setAuthHeader(originalRequest, newAccessToken);
      return apiClient(originalRequest);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  },
);

export default apiClient;
