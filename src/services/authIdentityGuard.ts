/**
 * @fileoverview Auth identity guard.
 *
 * Defends against cross-account token contamination: the access token in
 * storage belonging to a DIFFERENT user than `currentUser` in app state. This
 * happens when the shared-localStorage refresh token is overwritten by another
 * tab's login and a stale tab later refreshes into the other user's session, or
 * after an incomplete account switch.
 *
 * Symptom: a protected request (e.g. GET /calendar/events) carries a Bearer
 * token that decodes to a user different from the one shown in the UI — chat
 * APIs may still 200 (the token is valid for *that* user) while HRM/calendar
 * 401s because the contaminating user is not HR-authorized.
 *
 * This module never logs the raw token and never verifies signatures (decode
 * only) — it is a client-side consistency check, not an authority.
 */

import { parseJwtPayload } from "../utils/jwtHelpers";

export interface TokenIdentity {
  authUserId: string | null;
  email: string | null;
}

const normalizeEmail = (email: unknown): string | null =>
  typeof email === "string" && email.trim().length > 0
    ? email.trim().toLowerCase()
    : null;

const firstString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
};

/** Decode the identity claims from an access token (no signature check). */
export const getTokenIdentity = (
  token: string | null | undefined,
): TokenIdentity | null => {
  const payload = parseJwtPayload<Record<string, unknown>>(token);
  if (!payload) return null;
  const authUserId = firstString(
    payload.authUserId,
    payload.userId,
    payload.sub,
  );
  const email = normalizeEmail(payload.email);
  if (!authUserId && !email) return null;
  return { authUserId, email };
};

export interface IdentityComparison {
  mismatch: boolean;
  tokenAuthUserId: string | null;
  tokenEmail: string | null;
  userId: string | null;
  userEmail: string | null;
}

export interface CurrentUserIdentityLike {
  id?: string | null;
  email?: string | null;
}

/**
 * Compare a token's identity against the in-app current user. Mismatch is
 * reported ONLY when a field present on BOTH sides disagrees (authUserId
 * preferred, email fallback) — missing data never produces a false positive.
 */
export const compareIdentity = (
  token: string | null | undefined,
  user: CurrentUserIdentityLike | null | undefined,
): IdentityComparison => {
  const tokenIdentity = getTokenIdentity(token);
  const userId = user?.id ?? null;
  const userEmail = normalizeEmail(user?.email);

  const base: IdentityComparison = {
    mismatch: false,
    tokenAuthUserId: tokenIdentity?.authUserId ?? null,
    tokenEmail: tokenIdentity?.email ?? null,
    userId,
    userEmail,
  };

  if (!tokenIdentity || !user || (!userId && !userEmail)) {
    return base;
  }

  if (tokenIdentity.authUserId && userId) {
    return { ...base, mismatch: tokenIdentity.authUserId !== userId };
  }
  if (tokenIdentity.email && userEmail) {
    return { ...base, mismatch: tokenIdentity.email !== userEmail };
  }
  return base;
};

// ── One-shot mismatch reporting ────────────────────────────────────────────
// A mismatch means the local auth state is corrupt; we force a clean re-login
// exactly once to avoid redirect/logout loops while requests drain.

type IdentityMismatchHandler = (info: IdentityComparison) => void;

let mismatchHandler: IdentityMismatchHandler | null = null;
let mismatchReported = false;

export const setAuthIdentityMismatchHandler = (
  handler: IdentityMismatchHandler | null,
): void => {
  mismatchHandler = handler;
};

/** Reset the one-shot guard (call after a successful clean login). */
export const resetAuthIdentityGuard = (): void => {
  mismatchReported = false;
};

export const reportAuthIdentityMismatch = (info: IdentityComparison): void => {
  if (mismatchReported) return;
  mismatchReported = true;
  mismatchHandler?.(info);
};
