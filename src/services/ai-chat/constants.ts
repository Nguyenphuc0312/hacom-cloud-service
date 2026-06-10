/**
 * @fileoverview AI Chat service configuration constants.
 *
 * Every magic number, env read, and header name lives here.
 * The rest of the layer imports named constants — no inline strings,
 * no scattered `import.meta.env` calls.
 */

// ---------------------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------------------

/**
 * Resolved AI Chat base URL.
 *
 * Resolution order:
 *   1. `VITE_AI_CHAT_BASE_URL` (set in .env / .env.local)
 *   2. Production hard-coded fallback
 *
 * The fallback is intentional: this is an external service with a stable
 * host; the FE should never silently hit localhost for it.
 */
export const AI_CHAT_BASE_URL: string =
  (import.meta.env.VITE_AI_CHAT_BASE_URL as string | undefined)?.trim() ||
  "https://ai-chat.fitora.id.vn";

// ---------------------------------------------------------------------------
// Timeout policies
// ---------------------------------------------------------------------------

/** Standard timeout for REST/GET calls (ms). */
export const AI_CHAT_TIMEOUT_MS = 60_000;

/**
 * Extended timeout for file uploads + AI processing (ms).
 * Uploads go through XHR (not Axios) but share this constant.
 */
export const AI_CHAT_UPLOAD_TIMEOUT_MS = 120_000;

/**
 * SSE stream timeout (ms).
 * SSE connections are long-lived; set generously to cover slow AI responses.
 */
export const AI_CHAT_SSE_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------------------

/**
 * How many times `fetchWithAuth` will retry on recoverable network errors.
 * Auth failures (401/403) are retried exactly once (for refresh) then fail.
 * This constant governs only generic network / 5xx retries.
 */
export const AI_CHAT_MAX_NETWORK_RETRIES = 0;

// ---------------------------------------------------------------------------
// Header names
// ---------------------------------------------------------------------------

export const AUTHORIZATION_HEADER = "Authorization";

/**
 * Per-request UUID attached to every outgoing request.
 * Backend should echo this header in responses to enable end-to-end tracing.
 * Sentry breadcrumbs + Datadog/Grafana dashboards can correlate by this ID.
 */
export const X_REQUEST_ID_HEADER = "X-Request-Id";

// NOTE: identity headers (X-User-Id / X-Employee-Code) were removed — the AI
// Chat backend now extracts user_id / employee_code from the JWT Bearer token,
// so the FE sends only `Authorization: Bearer <token>` for identity.

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * Minimum wait (ms) when a 429 response omits Retry-After.
 * Prevents hammering the server when it's overloaded.
 */
export const AI_CHAT_RATE_LIMIT_DEFAULT_BACKOFF_MS = 5_000;

/**
 * Maximum wait (ms) we'll honour from a Retry-After header.
 * Values above this are clamped to prevent indefinite UI blocking.
 */
export const AI_CHAT_RATE_LIMIT_MAX_BACKOFF_MS = 60_000;
