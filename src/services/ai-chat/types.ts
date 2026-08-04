/**
 * @fileoverview Shared TypeScript contracts for the AI Chat API layer.
 *
 * Pure type / interface definitions — no runtime code.
 * Consumed by every layer: Axios client, fetchWithAuth, sseWithAuth, and all
 * feature hooks.  Keep this file stable; changes here ripple everywhere.
 */

// ---------------------------------------------------------------------------
// Generic API envelope
// ---------------------------------------------------------------------------

/**
 * Standard success envelope for REST endpoints on the AI Chat service.
 *
 * @example
 *   const { data } = await aiChatClient.get<ApiResponse<Session[]>>('/sessions')
 *   // data is Session[] — no runtime assertion needed
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  /** ISO-8601 server timestamp — use for cache invalidation keys. */
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Raw error body shape
// ---------------------------------------------------------------------------

/**
 * Body shape the AI Chat service sends on failure.
 * Variance between endpoints is handled by `normalizeAiChatError`.
 */
export interface ApiError {
  status: number;
  /** Machine-readable code (e.g. "UNAUTHORIZED", "RATE_LIMITED"). */
  code: string;
  message: string;
  /** Validation field errors, trace identifiers, etc. */
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Normalised client-side error
// ---------------------------------------------------------------------------

/**
 * The canonical error every AI Chat call rejects with after the transport
 * layer normalises the raw Axios / fetch / native error.
 *
 * Use `kind` to branch UI logic — never inspect raw status codes in components.
 *
 * ```typescript
 * } catch (err) {
 *   const e = err as NormalizedError;
 *   switch (e.kind) {
 *     case 'auth':       return redirectToLogin();
 *     case 'rate-limit': return showRetryAfterBanner(e.retryAfterMs);
 *     case 'network':    return showOfflineBanner();
 *     case 'timeout':    return showTimeoutRetryPrompt();
 *   }
 * }
 * ```
 */
export interface NormalizedError {
  /**
   * - `http`       — server replied with non-2xx (other than auth/rate-limit)
   * - `auth`       — 401 / 403; token missing, expired, or insufficient scope
   * - `network`    — no response received (offline, CORS, DNS)
   * - `timeout`    — request exceeded the configured timeout
   * - `rate-limit` — 429 Too Many Requests
   * - `unknown`    — unclassified; inspect `original` for debugging
   */
  kind: "http" | "auth" | "network" | "timeout" | "rate-limit" | "unknown";

  /** HTTP status code; 0 when no response was received. */
  status: number;

  /** Human-readable description safe for display or logging. */
  message: string;

  /**
   * Whether the operation can safely be retried without human intervention.
   * Auth failures (401/403) and 4xx client errors are NOT retryable.
   * Network, timeout, and 5xx errors are conditionally retryable.
   */
  retryable: boolean;

  /**
   * Correlation ID from the originating request's `X-Request-Id` header.
   * Present when the request made it through the Axios/fetch interceptor stack.
   * Attach this to Sentry events and support tickets for end-to-end tracing.
   */
  correlationId?: string;

  /**
   * When `kind === 'rate-limit'`, this is the number of milliseconds the
   * client should wait before retrying (parsed from Retry-After header).
   * Absent if the server didn't send a Retry-After header.
   */
  retryAfterMs?: number;

  /** The raw original error — for debugging and Sentry `originalException`. */
  original?: unknown;
}

// ---------------------------------------------------------------------------
// Internal request config extension
// ---------------------------------------------------------------------------

/**
 * Extended Axios request config — used internally by interceptors.
 * @internal
 */
export interface AiChatRequestConfig {
  /**
   * Set to `true` before the first 401 retry to prevent infinite loops if
   * the refreshed token is also rejected by the AI Chat service.
   */
  _retry?: boolean;

  /**
   * UUID generated in the request interceptor and stored here so the response
   * interceptor can attach it to NormalizedError without re-parsing headers.
   */
  _correlationId?: string;
}

// ---------------------------------------------------------------------------
// Observability hooks
// ---------------------------------------------------------------------------

/**
 * Optional plugin object for custom observability instrumentation.
 * Pass to `configureAiChatObservability()` at app bootstrap.
 *
 * @example
 *   configureAiChatObservability({
 *     onRequest: (url, correlationId) =>
 *       Sentry.addBreadcrumb({ category: 'ai-chat', message: url }),
 *     onError: (err) => Sentry.captureException(err.original),
 *   });
 */
export interface AiChatObservabilityHooks {
  /** Called just before each request is sent. */
  onRequest?: (url: string, correlationId: string, method: string) => void;
  /** Called after a successful response. */
  onResponse?: (url: string, correlationId: string, status: number, durationMs: number) => void;
  /** Called when a request fails (after all retries). */
  onError?: (error: NormalizedError, url: string) => void;
}

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

/**
 * Parsed SSE event as returned by the `parseSSEEvent` utility.
 * `type` defaults to `"message"` when no `event:` line is present.
 */
export interface ParsedSSEEvent {
  type: string;
  data: string;
}
