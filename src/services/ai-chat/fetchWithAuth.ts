/**
 * @fileoverview Authenticated fetch() wrapper for the AI Chat service.
 *
 * # Why this exists alongside the Axios client
 * Axios cannot consume ReadableStream responses — it buffers the entire body
 * before resolving.  SSE streams and large file downloads MUST use the native
 * fetch() API.  This module gives those callers the same auth guarantees
 * (token injection, 401 refresh-and-retry, correlation IDs) that the Axios
 * interceptor chain provides for standard REST calls.
 *
 * # Integration with existing auth infrastructure
 * - Token source: `tokenService.getAccessToken()` — in-memory first, no extra
 *   storage reads.
 * - Token refresh: `refreshAccessTokenShared()` — the same single-flight,
 *   cross-tab coordinator used by `apiClient`.  A concurrent refresh triggered
 *   by the main Axios client and this fetch wrapper will NOT issue two HTTP
 *   requests; one wins and the other awaits the shared promise.
 * - On definitive failure: `authRefreshCoordinator` emits `refresh_failed`,
 *   which `authStore` is subscribed to — the logout + redirect happens there,
 *   not here.  This module stays transport-focused.
 *
 * # AbortSignal composition
 * The caller may pass their own `signal` (e.g. from a React `useEffect`
 * cleanup or a user cancel button).  Internally we also need a timeout signal.
 * `composeAbortSignal` merges both without `AbortSignal.any()` (which is not
 * universally supported in all targeted browsers as of this writing).
 */

import { getAccessToken } from "../tokenService";
import { refreshAccessTokenShared } from "../authRefreshCoordinator";
import { isDefiniteAuthRefreshFailure } from "../authRefreshErrorClassifier";
import { logger } from "../../utils/logger";
import {
  AI_CHAT_TIMEOUT_MS,
  AUTHORIZATION_HEADER,
  X_REQUEST_ID_HEADER,
} from "./constants";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface FetchWithAuthOptions {
  /**
   * External cancellation signal — typically from a `useEffect` cleanup or
   * a user-facing "Stop" button.  This signal is composed with the internal
   * timeout signal; whichever fires first wins.
   */
  signal?: AbortSignal;

  /**
   * Override the default request timeout in milliseconds.
   * Use `AI_CHAT_UPLOAD_TIMEOUT_MS` for file uploads,
   * `AI_CHAT_SSE_TIMEOUT_MS` for streaming connections.
   */
  timeoutMs?: number;

  /**
   * Pre-computed correlation ID (UUID) to attach as `X-Request-Id`.
   * When absent, a fresh UUID is generated per request.
   */
  correlationId?: string;
}

// ---------------------------------------------------------------------------
// Signal composition
// ---------------------------------------------------------------------------

interface ComposedSignal {
  signal: AbortSignal;
  /** Call this in a finally block to clear the internal timeout. */
  cleanup: () => void;
}

/**
 * Composes an external AbortSignal with an internal timeout signal.
 *
 * Why manual composition instead of `AbortSignal.any()`?
 * `AbortSignal.any()` is a relatively recent addition (Chrome 116, FF 115).
 * Our target browser matrix includes slightly older enterprise WebViews, so
 * we implement the composition manually for reliability.
 *
 * The returned cleanup function MUST be called in a `finally` block to prevent
 * timer leaks when the request finishes before the timeout fires.
 */
function composeAbortSignal(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
): ComposedSignal {
  const ac = new AbortController();

  // Internal timeout — DOMException name "TimeoutError" lets normalizeError
  // classify this as `kind: 'timeout'` rather than `kind: 'network'`.
  const timer = setTimeout(
    () => ac.abort(new DOMException("Request timed out", "TimeoutError")),
    timeoutMs,
  );

  const cleanup = (): void => clearTimeout(timer);

  if (!externalSignal) {
    return { signal: ac.signal, cleanup };
  }

  // If already aborted, propagate immediately.
  if (externalSignal.aborted) {
    clearTimeout(timer);
    ac.abort(externalSignal.reason);
    return { signal: ac.signal, cleanup: () => undefined };
  }

  const forwardAbort = (): void => ac.abort(externalSignal.reason);
  externalSignal.addEventListener("abort", forwardAbort, { once: true });

  return {
    signal: ac.signal,
    cleanup: () => {
      cleanup();
      externalSignal.removeEventListener("abort", forwardAbort);
    },
  };
}

// ---------------------------------------------------------------------------
// Header builder
// ---------------------------------------------------------------------------

/**
 * Merges caller-supplied headers with the auth token and correlation ID.
 * Existing `Authorization` headers are preserved when `forceOverride` is false
 * — this lets callers pass a pre-refreshed token on retry without being
 * clobbered by the interceptor.
 */
export function buildAiChatHeaders(
  base: HeadersInit = {},
  options: { forceOverride?: boolean; correlationId?: string } = {},
): Record<string, string> {
  const merged: Record<string, string> = {};

  // Flatten HeadersInit variants into a plain object.
  if (base instanceof Headers) {
    base.forEach((v, k) => {
      merged[k] = v;
    });
  } else if (Array.isArray(base)) {
    for (const [k, v] of base) merged[k] = v;
  } else {
    Object.assign(merged, base);
  }

  // Token injection — skip if caller already set Authorization.
  const hasAuth =
    !options.forceOverride &&
    (merged[AUTHORIZATION_HEADER] ||
      merged[AUTHORIZATION_HEADER.toLowerCase()]);

  if (!hasAuth) {
    const token = getAccessToken();
    if (token) merged[AUTHORIZATION_HEADER] = `Bearer ${token}`;
  }

  // Correlation ID — use provided or generate a new UUID.
  if (!merged[X_REQUEST_ID_HEADER]) {
    merged[X_REQUEST_ID_HEADER] =
      options.correlationId ??
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

/**
 * Authenticated fetch() wrapper.
 *
 * On 401:
 *   1. Calls `refreshAccessTokenShared('http_401')` — single-flight across tabs.
 *   2. Re-issues the request with the fresh token.
 *   3. If refresh fails definitively, allows the error to bubble — the shared
 *      coordinator already emits `refresh_failed`, which `authStore` handles.
 *
 * On abort (deliberate cancellation):
 *   Returns the response as-is (caller decides how to handle it).
 *   Does NOT retry after a user-initiated abort.
 *
 * @returns The raw `Response` — body is NOT consumed here.  The caller reads
 *          it as JSON, a stream, or a blob depending on the use-case.
 */
export async function fetchWithAuth(
  url: string,
  init: RequestInit = {},
  opts: FetchWithAuthOptions = {},
): Promise<Response> {
  const { signal: externalSignal, timeoutMs, correlationId } = opts;
  const timeout = timeoutMs ?? AI_CHAT_TIMEOUT_MS;

  const { signal, cleanup } = composeAbortSignal(externalSignal, timeout);
  const headers = buildAiChatHeaders(init.headers, { correlationId });

  try {
    const response = await fetch(url, { ...init, headers, signal });

    // ── 401: token expired → refresh + retry once ──────────────────────────
    if (response.status === 401) {
      let newToken: string;
      try {
        newToken = await refreshAccessTokenShared("http_401");
      } catch (refreshError) {
        if (isDefiniteAuthRefreshFailure(refreshError)) {
          // authStore handles redirect; we just let the 401 surface.
          logger.error("ai-chat-fetch", "definitive_refresh_failure", {
            url,
            correlationId: headers[X_REQUEST_ID_HEADER],
          });
        }
        // Return the original 401 response so the caller can throw AiApiError.
        return response;
      }

      // Retry with refreshed token — forceOverride=true to replace the old one.
      const retryHeaders = buildAiChatHeaders(init.headers, {
        forceOverride: true,
        correlationId: headers[X_REQUEST_ID_HEADER],
      });
      retryHeaders[AUTHORIZATION_HEADER] = `Bearer ${newToken}`;
      return fetch(url, { ...init, headers: retryHeaders, signal });
    }

    return response;
  } finally {
    cleanup();
  }
}
