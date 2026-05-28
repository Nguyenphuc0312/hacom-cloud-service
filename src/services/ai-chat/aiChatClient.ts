/**
 * @fileoverview Dedicated Axios instance for the AI Chat service.
 *
 * # Transport isolation
 * The main `apiClient` (lib/axios.ts) has a trusted-origin guard that strips
 * `Authorization` from requests targeting different origins — a correct
 * security decision for the internal API, but wrong for the AI Chat service
 * which lives on a different domain.  A shared instance would silently omit
 * auth headers on every AI Chat call.  Isolation also gives us independent
 * timeout policies, custom middleware, and contract headers without coupling.
 *
 * # Token injection at request-time
 * We read `getAccessToken()` inside the request interceptor, NOT at module
 * initialisation.  The module loads before the user logs in; the token is
 * only available after login.  Capturing it at init time would always be null.
 *
 * # Single-flight refresh
 * The 401 response interceptor delegates to `refreshAccessTokenShared()`
 * from the existing coordinator.  If both `apiClient` and `aiChatClient`
 * receive a 401 simultaneously (e.g. on session expiry), only ONE HTTP refresh
 * request is issued.  The second awaits the first's result.
 *
 * # Observability
 * Every outgoing request gets a `X-Request-Id` UUID.  This ID is:
 *   - stored on the request config for the response interceptor to read
 *   - available via `error.correlationId` in every `NormalizedError`
 *   - passed to any registered `AiChatObservabilityHooks`
 *
 * Register hooks at app bootstrap:
 *   configureAiChatObservability({ onError: Sentry.captureException })
 */

import axios, { AxiosHeaders } from "axios";
import type {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from "axios";
import { getAccessToken } from "../tokenService";
import { refreshAccessTokenShared } from "../authRefreshCoordinator";
import { isDefiniteAuthRefreshFailure } from "../authRefreshErrorClassifier";
import { logger } from "../../utils/logger";
import {
  AI_CHAT_BASE_URL,
  AI_CHAT_TIMEOUT_MS,
  AI_CHAT_RATE_LIMIT_DEFAULT_BACKOFF_MS,
  AI_CHAT_RATE_LIMIT_MAX_BACKOFF_MS,
  AUTHORIZATION_HEADER,
  X_REQUEST_ID_HEADER,
} from "./constants";
import { normalizeAiChatError } from "./normalizeError";
import type { AiChatObservabilityHooks, AiChatRequestConfig } from "./types";

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

// Components and hooks import from this single module rather than spreading
// imports across normalizeError.ts.
export { normalizeAiChatError } from "./normalizeError";
export { isRetryableError } from "./normalizeError";
export type { NormalizedError } from "./types";

// ---------------------------------------------------------------------------
// Observability registry
// ---------------------------------------------------------------------------

let observabilityHooks: AiChatObservabilityHooks = {};

/**
 * Register optional observability callbacks (Sentry, Datadog, custom logging).
 * Call this once at app bootstrap before any API calls are made.
 *
 * @example
 *   configureAiChatObservability({
 *     onRequest: (url, cid) =>
 *       Sentry.addBreadcrumb({ message: `AI Chat: ${url}`, data: { cid } }),
 *     onError: (err) =>
 *       Sentry.captureException(err.original, { tags: { cid: err.correlationId } }),
 *   });
 */
export function configureAiChatObservability(
  hooks: AiChatObservabilityHooks,
): void {
  observabilityHooks = hooks;
}

// ---------------------------------------------------------------------------
// Request timing store
// ---------------------------------------------------------------------------

const requestStartTimes = new Map<string, number>();

// ---------------------------------------------------------------------------
// Correlation ID generator
// ---------------------------------------------------------------------------

function generateCorrelationId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ---------------------------------------------------------------------------
// Header injection helper
// ---------------------------------------------------------------------------

function setHeader(
  headers: AxiosHeaders | Record<string, string>,
  name: string,
  value: string,
): void {
  if (headers instanceof AxiosHeaders) {
    headers.set(name, value);
  } else {
    (headers as Record<string, string>)[name] = value;
  }
}

function getHeader(
  headers: AxiosHeaders | Record<string, string>,
  name: string,
): string | undefined {
  if (headers instanceof AxiosHeaders) {
    // AxiosHeaders.get() returns string | number | boolean | string[] | AxiosHeaders | null.
    // We only care about the string case; coerce others to undefined.
    const value = headers.get(name);
    return typeof value === "string" ? value : undefined;
  }
  return (
    (headers as Record<string, string>)[name] ??
    (headers as Record<string, string>)[name.toLowerCase()]
  );
}

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

const aiChatClient: AxiosInstance = axios.create({
  baseURL: AI_CHAT_BASE_URL,
  timeout: AI_CHAT_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// ---------------------------------------------------------------------------
// Request interceptor
// ---------------------------------------------------------------------------

aiChatClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const requestConfig = config as InternalAxiosRequestConfig & AiChatRequestConfig;
    requestConfig.headers = requestConfig.headers ?? new AxiosHeaders();
    const headers = requestConfig.headers as AxiosHeaders | Record<string, string>;

    // ── 1. Correlation ID ─────────────────────────────────────────────────
    // Generate once and store on the config so the response interceptor can
    // attach it to NormalizedError without re-reading the header.
    const correlationId = generateCorrelationId();
    requestConfig._correlationId = correlationId;
    setHeader(headers, X_REQUEST_ID_HEADER, correlationId);

    // ── 2. Bearer token injection ─────────────────────────────────────────
    // Read at request-time — the token changes after refresh.
    // Preserve manually-provided Authorization (e.g. tests, one-off overrides).
    const hasAuth = getHeader(headers, AUTHORIZATION_HEADER);
    if (!hasAuth) {
      const token = getAccessToken();
      if (token) setHeader(headers, AUTHORIZATION_HEADER, `Bearer ${token}`);
    }

    // ── 3. Timing start ───────────────────────────────────────────────────
    requestStartTimes.set(correlationId, performance.now());

    // ── 4. Observability ──────────────────────────────────────────────────
    observabilityHooks.onRequest?.(
      String(config.url ?? ""),
      correlationId,
      String(config.method ?? "get").toUpperCase(),
    );

    return requestConfig;
  },
  (error: AxiosError) => Promise.reject(error),
);

// ---------------------------------------------------------------------------
// Response interceptor
// ---------------------------------------------------------------------------

aiChatClient.interceptors.response.use(
  // ── Success path ──────────────────────────────────────────────────────────
  (response) => {
    const requestConfig = response.config as InternalAxiosRequestConfig & AiChatRequestConfig;
    const correlationId = requestConfig._correlationId;
    if (correlationId) {
      const start = requestStartTimes.get(correlationId);
      if (start !== undefined) {
        const durationMs = Math.round(performance.now() - start);
        requestStartTimes.delete(correlationId);
        observabilityHooks.onResponse?.(
          String(response.config.url ?? ""),
          correlationId,
          response.status,
          durationMs,
        );
      }
    }
    return response;
  },

  // ── Error path ────────────────────────────────────────────────────────────
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & AiChatRequestConfig)
      | undefined;

    const correlationId = originalRequest?._correlationId;
    if (correlationId) requestStartTimes.delete(correlationId);

    if (!originalRequest) return Promise.reject(error);

    const status = error.response?.status;

    // ── 401: refresh + retry once ────────────────────────────────────────────
    if (status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const newToken = await refreshAccessTokenShared("http_401");
        const headers = originalRequest.headers as
          | AxiosHeaders
          | Record<string, string>;
        setHeader(headers, AUTHORIZATION_HEADER, `Bearer ${newToken}`);
        return aiChatClient(originalRequest);
      } catch (refreshError) {
        if (isDefiniteAuthRefreshFailure(refreshError)) {
          // authStore handles logout/redirect via the coordinator event bus.
          logger.error("ai-chat", "definitive_auth_failure", { correlationId });
        }
        return Promise.reject(refreshError);
      }
    }

    // ── 403: log and propagate ───────────────────────────────────────────────
    if (status === 403) {
      logger.warn("ai-chat", "forbidden", {
        url: originalRequest.url,
        correlationId,
      });
    }

    // ── 429: parse Retry-After and surface it ────────────────────────────────
    if (status === 429) {
      const retryAfterRaw = error.response?.headers?.["retry-after"] as
        | string
        | undefined;
      const retryAfterSec = Number.parseFloat(retryAfterRaw ?? "");
      const retryAfterMs = Number.isFinite(retryAfterSec)
        ? Math.min(
            Math.round(retryAfterSec * 1000),
            AI_CHAT_RATE_LIMIT_MAX_BACKOFF_MS,
          )
        : AI_CHAT_RATE_LIMIT_DEFAULT_BACKOFF_MS;

      // Attach to response data so callers and normalizeAiChatError can read it.
      if (error.response?.data && typeof error.response.data === "object") {
        (error.response.data as Record<string, unknown>)["_retryAfterMs"] =
          retryAfterMs;
      }

      logger.warn("ai-chat", "rate_limited", {
        url: originalRequest.url,
        retryAfterMs,
        correlationId,
      });
    }

    // ── 5xx: server error logging ─────────────────────────────────────────────
    if (status !== undefined && status >= 500) {
      logger.error("ai-chat", "server_error", {
        status,
        url: originalRequest.url,
        correlationId,
      });
    }

    // ── Network / timeout ─────────────────────────────────────────────────────
    if (!error.response) {
      logger.warn("ai-chat", "network_or_timeout", {
        code: error.code,
        url: originalRequest.url,
        correlationId,
      });
    }

    // ── Observability: report to registered hooks ─────────────────────────────
    const normalized = normalizeAiChatError(error, correlationId);
    observabilityHooks.onError?.(normalized, String(originalRequest.url ?? ""));

    return Promise.reject(error);
  },
);

export default aiChatClient;
