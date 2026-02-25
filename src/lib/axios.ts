/**
 * @fileoverview Centralized Axios client configuration.
 * Handles auth header injection, refresh lock/queue and request cancellation.
 */

import axios, { AxiosError, AxiosHeaders } from "axios";
import type { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import type { ApiResponse } from "@hacom/chat-shared-types";
import { API_BASE_URL } from "../config";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  isAuthSessionActive,
  isRefreshTokenCookieMode,
  isRememberMeEnabled,
  storeTokens,
  updateAccessToken,
} from "../services/tokenService";

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
  /\/auth\/logout$/i,
  /\/auth\/refresh$/i,
  /\/auth\/forgot-password$/i,
  /\/auth\/reset-password$/i,
  /\/users\/check-username(?:\/|$)/i,
];
const API_CONTRACT_HEADER = "X-Api-Contract";
const API_CONTRACT_VERSION = "2";

let authFailureHandler: AuthFailureHandler | null = null;
let authFailureNotified = false;
let refreshPromise: Promise<string> | null = null;

const pendingRequestControllers = new Map<string, AbortController>();

const isPublicEndpoint = (url?: string): boolean => {
  if (!url) return false;

  const normalized = url.startsWith("http")
    ? new URL(url).pathname
    : url.split("?")[0];

  return PUBLIC_ENDPOINT_PATTERNS.some((pattern) => pattern.test(normalized));
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

const extractTokenPayload = (
  rawResponseData: unknown,
): { accessToken: string | null; refreshToken: string | null } => {
  const contractPayload = rawResponseData as ApiResponse<{
    accessToken?: string;
    refreshToken?: string;
    tokens?: {
      accessToken?: string;
      refreshToken?: string;
    };
  }>;

  if (contractPayload && typeof contractPayload === "object" && contractPayload.success) {
    const responseData = contractPayload.data;
    const accessTokenCandidate =
      responseData.tokens?.accessToken ?? responseData.accessToken;
    const refreshTokenCandidate =
      responseData.tokens?.refreshToken ?? responseData.refreshToken;

    return {
      accessToken:
        typeof accessTokenCandidate === "string" ? accessTokenCandidate : null,
      refreshToken:
        typeof refreshTokenCandidate === "string" ? refreshTokenCandidate : null,
    };
  }

  const topLevel =
    rawResponseData && typeof rawResponseData === "object"
      ? (rawResponseData as Record<string, unknown>)
      : {};

  const payload =
    topLevel.data && typeof topLevel.data === "object"
      ? (topLevel.data as Record<string, unknown>)
      : topLevel;

  const nestedTokens =
    payload.tokens && typeof payload.tokens === "object"
      ? (payload.tokens as Record<string, unknown>)
      : null;

  const accessTokenCandidate = nestedTokens?.accessToken ?? payload.accessToken;
  const refreshTokenCandidate =
    nestedTokens?.refreshToken ?? payload.refreshToken;

  return {
    accessToken:
      typeof accessTokenCandidate === "string" ? accessTokenCandidate : null,
    refreshToken:
      typeof refreshTokenCandidate === "string" ? refreshTokenCandidate : null,
  };
};

// Lock refresh with a shared promise so all 401 requests wait for one refresh call.
const refreshAccessToken = async (): Promise<string> => {
  if (!isAuthSessionActive()) {
    notifyAuthFailure("refresh_failed");
    throw new Error("Auth session is inactive");
  }

  const storedRefreshToken = getRefreshToken();

  if (!isRefreshTokenCookieMode() && !storedRefreshToken) {
    notifyAuthFailure("missing_refresh_token");
    throw new Error("Missing refresh token");
  }

  try {
    const response = await axios.post(
      `${API_BASE_URL}/auth/refresh`,
      storedRefreshToken ? { refreshToken: storedRefreshToken } : undefined,
      {
        withCredentials: true,
        headers: {
          "Content-Type": "application/json",
          [API_CONTRACT_HEADER]: API_CONTRACT_VERSION,
        },
      },
    );

    const { accessToken, refreshToken } = extractTokenPayload(response.data);
    if (!accessToken) {
      throw new Error("Refresh response missing access token");
    }

    if (refreshToken || storedRefreshToken) {
      storeTokens(
        accessToken,
        refreshToken ?? storedRefreshToken ?? undefined,
        isRememberMeEnabled(),
      );
    } else {
      updateAccessToken(accessToken);
    }

    authFailureNotified = false;
    return accessToken;
  } catch (error) {
    notifyAuthFailure("refresh_failed");
    throw error;
  }
};

const getRefreshPromise = async (): Promise<string> => {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
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

    const shouldAttachAuth = !isPublicEndpoint(config.url);
    requestConfig.headers = requestConfig.headers ?? {};
    const contractHeaders =
      requestConfig.headers as AxiosHeaders | Record<string, string>;
    if (contractHeaders instanceof AxiosHeaders) {
      contractHeaders.set(API_CONTRACT_HEADER, API_CONTRACT_VERSION);
    } else {
      contractHeaders[API_CONTRACT_HEADER] = API_CONTRACT_VERSION;
    }

    if (!shouldAttachAuth) {
      setAuthHeader(config, null);
      return config;
    }

    const accessToken = getAccessToken();
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
      isPublicEndpoint(originalRequest.url) ||
      /\/auth\/refresh$/i.test((originalRequest.url ?? "").split("?")[0])
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const newAccessToken = await getRefreshPromise();
      setAuthHeader(originalRequest, newAccessToken);
      return apiClient(originalRequest);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  },
);

export default apiClient;
