/**
 * @fileoverview Shared classification for auth-refresh failures.
 *
 * The deployment runs in body mode (refresh token in localStorage, not an
 * HttpOnly cookie). The single source of truth for "should this failure log the
 * user out?" must be shared between the HTTP interceptor, the WebSocket auth
 * recovery flow and the bootstrap flow — otherwise the three paths drift and a
 * transient network error in one of them silently destroys a valid session.
 *
 * Rule:
 *  - definitive  → the refresh token is genuinely invalid/expired/revoked or the
 *                  account is inactive. Safe to clear the session and log out.
 *  - transient   → network blip, timeout, rate limit (429) or 5xx. The session
 *                  may still be valid; keep the token and retry later.
 */

import axios from "axios";
import { extractApiError } from "../lib/apiContract";

// Backend reasonCodes (see chat-auth-service refresh flow) that unambiguously
// mean the refresh token can never succeed again.
const DEFINITIVE_REASON_CODES = new Set<string>([
  "REFRESH_TOKEN_MISSING",
  "REFRESH_TOKEN_INVALID",
  "REFRESH_TOKEN_INVALID_SIGNATURE",
  "REFRESH_TOKEN_EXPIRED",
  "REFRESH_TOKEN_REVOKED",
  "REFRESH_TOKEN_ROTATED_REUSE",
  "REFRESH_SESSION_NOT_FOUND",
  "REFRESH_SESSION_EXPIRED",
  "REFRESH_ACCOUNT_INACTIVE",
  "REFRESH_TOKEN_VERSION_MISMATCH",
  "REFRESH_PERMISSION_VERSION_MISMATCH",
]);

// Sentinel embedded in errors propagated from another tab (cross-tab refresh
// coordination) so the receiving tab classifies them as definitive.
export const DEFINITIVE_REFRESH_SENTINEL = "AUTH_REFRESH_DEFINITIVE";

// Local FE error messages thrown before the request leaves the browser — these
// mean there is nothing to refresh with, so they are definitive.
const DEFINITIVE_LOCAL_MESSAGES = [
  "Missing refresh token",
  "No refresh token available",
  "Auth session is inactive",
  // csrfToken cookie unreadable (cookie mode only) — clear and re-login.
  "CSRF token not available",
  DEFINITIVE_REFRESH_SENTINEL,
];

/** Build an error a waiting tab can throw so the classifier treats it as definitive. */
export const createDefinitiveRefreshError = (reason: string): Error =>
  new Error(`${DEFINITIVE_REFRESH_SENTINEL}: ${reason}`);

export const extractHttpStatus = (error: unknown): number => {
  if (axios.isAxiosError(error)) {
    return error.response?.status ?? 0;
  }
  return extractApiError(error).statusCode;
};

export const extractRefreshReasonCode = (error: unknown): string | null => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | {
          reasonCode?: string;
          code?: string;
          errorCode?: string;
          error?: { code?: string; details?: { reasonCode?: string } };
          details?: { reasonCode?: string };
        }
      | undefined;
    // Contract V2 nests under error.{code,details}; legacy uses top-level code.
    return (
      data?.reasonCode ??
      data?.error?.details?.reasonCode ??
      data?.details?.reasonCode ??
      data?.code ??
      data?.error?.code ??
      data?.errorCode ??
      null
    );
  }
  return null;
};

export const isNetworkError = (error: unknown): boolean => {
  if (axios.isAxiosError(error)) {
    return !error.response;
  }
  return extractApiError(error).isNetworkError === true;
};

/**
 * True only when the refresh attempt carries a definitive server reason code
 * or there is no usable refresh token. HTTP status alone is not enough because
 * a proxy can map a transient upstream failure to 401/403.
 * Only definitive failures may clear the session / log out.
 */
export const isDefiniteAuthRefreshFailure = (error: unknown): boolean => {
  if (axios.isAxiosError(error)) {
    if (!error.response) return false; // network error, not a server rejection
    const reasonCode = extractRefreshReasonCode(error);
    return reasonCode !== null && DEFINITIVE_REASON_CODES.has(reasonCode);
  }

  if (error instanceof Error) {
    return DEFINITIVE_LOCAL_MESSAGES.some((msg) => error.message.includes(msg));
  }

  return false;
};

/**
 * True when the failure is likely temporary: network error, timeout (408),
 * rate limit (429) or any 5xx. The session must be preserved and retried.
 */
export const isTransientRefreshFailure = (error: unknown): boolean => {
  if (isDefiniteAuthRefreshFailure(error)) {
    return false;
  }

  if (isNetworkError(error)) {
    return true;
  }

  const status = extractHttpStatus(error);
  return status === 0 || status === 408 || status === 429 || status >= 500;
};
