/**
 * @fileoverview Transport-agnostic error normalisation for the AI Chat layer.
 *
 * # Design principle
 * No component or hook should import `AxiosError`, inspect HTTP status codes,
 * or catch specific error class names.  Every thrown value — whether it came
 * from Axios, native fetch(), XHR, or an AbortController — passes through this
 * module first and emerges as a `NormalizedError`.
 *
 * # Transport compatibility
 * The normaliser handles:
 *   - Axios AxiosError   (from aiChatClient)
 *   - fetch Response     (non-ok status from fetchWithAuth / sseWithAuth)
 *   - DOMException       (AbortError / TimeoutError from fetch / AbortController)
 *   - AiApiError         (existing custom class — detected by duck-typing)
 *   - Generic Error      (any other thrown Error)
 *   - Unknown values     (string throws, null, etc.)
 */

import axios from "axios";
import type { AxiosError } from "axios";
import {
  AI_CHAT_RATE_LIMIT_DEFAULT_BACKOFF_MS,
  AI_CHAT_RATE_LIMIT_MAX_BACKOFF_MS,
} from "./constants";
import type { NormalizedError } from "./types";

// ---------------------------------------------------------------------------
// Retryability table
// ---------------------------------------------------------------------------

/**
 * Returns true when the normalised error is safe to retry automatically.
 *
 * Rules:
 *   - Auth failures are never auto-retried (redirect/re-login is the fix)
 *   - Rate-limit is retried only after the Retry-After window elapses
 *   - 4xx client errors are not retryable (bad request won't heal on retry)
 *   - Network / timeout are retryable (transient infrastructure failure)
 *   - 5xx server errors are conditionally retryable
 */
export function isRetryableError(err: NormalizedError): boolean {
  switch (err.kind) {
    case "auth":
    case "rate-limit":
      return false;
    case "network":
    case "timeout":
      return true;
    case "http":
      // 5xx are retryable; 4xx are not
      return err.status >= 500;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Retry-After header parser
// ---------------------------------------------------------------------------

function parseRetryAfterMs(
  header: string | null | undefined,
): number | undefined {
  if (!header) return undefined;

  const trimmed = header.trim();

  // Numeric form: "Retry-After: 30"
  const seconds = Number.parseFloat(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    const ms = Math.round(seconds * 1000);
    return Math.min(ms, AI_CHAT_RATE_LIMIT_MAX_BACKOFF_MS);
  }

  // HTTP-date form: "Retry-After: Wed, 21 Oct 2025 07:28:00 GMT"
  const retryDate = Date.parse(trimmed);
  if (!Number.isNaN(retryDate)) {
    const ms = Math.max(0, retryDate - Date.now());
    return Math.min(ms, AI_CHAT_RATE_LIMIT_MAX_BACKOFF_MS);
  }

  return AI_CHAT_RATE_LIMIT_DEFAULT_BACKOFF_MS;
}

// ---------------------------------------------------------------------------
// fetch() Response normaliser
// ---------------------------------------------------------------------------

/**
 * Normalises a non-ok `fetch()` Response **without consuming the body**.
 * The response body is intentionally left unread — the caller may still
 * need to read it for structured error details.
 *
 * If you need the body message, read it first and pass it as `bodyMessage`.
 */
export function normalizeResponseError(
  response: Response,
  options: { correlationId?: string; bodyMessage?: string } = {},
): NormalizedError {
  const { status } = response;
  const { correlationId, bodyMessage } = options;

  const retryAfterMs =
    status === 429
      ? parseRetryAfterMs(response.headers.get("retry-after"))
      : undefined;

  const kind: NormalizedError["kind"] =
    status === 401 || status === 403
      ? "auth"
      : status === 429
        ? "rate-limit"
        : "http";

  const message =
    bodyMessage ??
    (status === 401
      ? "Session expired. Please log in again."
      : status === 403
        ? "You don't have permission to access this resource."
        : status === 429
          ? "Too many requests. Please wait before trying again."
          : `Request failed with status ${status}`);

  return {
    kind,
    status,
    message,
    retryable: isRetryableError({ kind, status, message, retryable: false }),
    correlationId,
    retryAfterMs,
  };
}

// ---------------------------------------------------------------------------
// Primary normaliser — handles any thrown value
// ---------------------------------------------------------------------------

/**
 * Converts **any** thrown value from an AI Chat API call into `NormalizedError`.
 *
 * @param error     The value caught in a `catch` block.
 * @param correlationId  The `X-Request-Id` from the originating request, if known.
 */
export function normalizeAiChatError(
  error: unknown,
  correlationId?: string,
): NormalizedError {
  // ── DOMException: AbortError / TimeoutError ────────────────────────────────
  if (error instanceof DOMException) {
    const isTimeout =
      error.name === "TimeoutError" ||
      error.message.toLowerCase().includes("timeout");
    const kind = isTimeout ? "timeout" : "network";
    return {
      kind,
      status: 0,
      message: isTimeout
        ? "Request timed out. Please try again."
        : "Request was cancelled.",
      retryable: false, // deliberate abort = not retryable; timeout = caller decides
      correlationId,
      original: error,
    };
  }

  // ── Axios AxiosError ───────────────────────────────────────────────────────
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiErrorBody>;

    // No response → network or timeout
    if (!axiosError.response) {
      const isTimeout =
        axiosError.code === "ECONNABORTED" ||
        axiosError.code === "ETIMEDOUT" ||
        axiosError.message.toLowerCase().includes("timeout");
      const kind = isTimeout ? ("timeout" as const) : ("network" as const);
      return {
        kind,
        status: 0,
        message: isTimeout
          ? "Request timed out. Please try again."
          : "Network error. Check your connection and try again.",
        retryable: true,
        correlationId,
        original: error,
      };
    }

    const { status } = axiosError.response;
    const body = axiosError.response.data;
    const bodyMessage =
      typeof body === "object" && body !== null
        ? (body as ApiErrorBody).message
        : undefined;

    const retryAfterMs =
      status === 429
        ? parseRetryAfterMs(
            axiosError.response.headers?.["retry-after"] as string | undefined,
          )
        : undefined;

    const kind: NormalizedError["kind"] =
      status === 401 || status === 403
        ? "auth"
        : status === 429
          ? "rate-limit"
          : "http";

    const message =
      bodyMessage ??
      (status === 401
        ? "Session expired. Please log in again."
        : status === 403
          ? "You don't have permission to access this resource."
          : status === 429
            ? "Too many requests. Please wait before trying again."
            : axiosError.message || `Request failed with status ${status}`);

    return {
      kind,
      status,
      message,
      retryable: kind === "http" && status >= 500,
      correlationId,
      retryAfterMs,
      original: error,
    };
  }

  // ── AiApiError (duck-type detection, avoids cross-layer import) ────────────
  if (error instanceof Error) {
    const maybeAiError = error as Error & {
      status?: unknown;
      kind?: unknown;
    };
    if (
      typeof maybeAiError.status === "number" &&
      typeof maybeAiError.kind === "string"
    ) {
      const k = maybeAiError.kind as string;
      const kind: NormalizedError["kind"] =
        k === "timeout"
          ? "timeout"
          : k === "network"
            ? "network"
            : "http";
      return {
        kind,
        status: maybeAiError.status,
        message: error.message,
        retryable: kind === "network" || kind === "timeout",
        correlationId,
        original: error,
      };
    }

    // AbortError thrown as generic Error in some environments
    if (error.name === "AbortError") {
      return {
        kind: "network",
        status: 0,
        message: "Request was cancelled.",
        retryable: false,
        correlationId,
        original: error,
      };
    }

    return {
      kind: "unknown",
      status: 0,
      message: error.message || "An unexpected error occurred.",
      retryable: false,
      correlationId,
      original: error,
    };
  }

  // ── Catch-all ──────────────────────────────────────────────────────────────
  return {
    kind: "unknown",
    status: 0,
    message: "An unexpected error occurred.",
    retryable: false,
    correlationId,
    original: error,
  };
}

// ---------------------------------------------------------------------------
// Internal type helper
// ---------------------------------------------------------------------------

interface ApiErrorBody {
  message?: string;
  code?: string;
  [key: string]: unknown;
}
