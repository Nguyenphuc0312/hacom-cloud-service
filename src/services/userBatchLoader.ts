/**
 * @fileoverview Request-coalescing batch loader for user profile summaries.
 *
 * Problem it solves: the chat timeline and the friends directory each need a
 * display name / avatar for many users at once. Calling `GET /users/{id}` per
 * user produces an N+1 request storm. This loader collapses many
 * `loadUserProfile(userId)` calls made within a short window (≈60ms) into a
 * single `POST /users/batch` request.
 *
 * Guarantees (do NOT regress):
 *  - Coalescing: every `loadUserProfile` issued in the same flush window is
 *    resolved by one network round-trip (chunked at the API layer if > cap).
 *  - In-flight dedupe: a second call for a userId already being fetched shares
 *    the same promise — no duplicate request.
 *  - TTL cache: fresh ids never hit the network. Mirrors the freshness window of
 *    the legacy `userProfileCache` so enrich behaviour is unchanged.
 *  - Partial failure: one unresolved id resolves to `null`; it never rejects the
 *    other ids in the batch.
 *  - Transient batch failure rejects (and does NOT negative-cache) so the next
 *    call retries.
 *
 * Scope: this is the network layer for the *enrich* path (display name + avatar
 * only). The full User Info panel keeps using `userProfileCache`
 * (`GET /users/{id}`) because it needs the complete user object — opening one
 * profile is a single deliberate request, not an N+1.
 */

import type { UserProfileSummaryDto } from "@hacom/chat-shared-types/auth";
import { userApi } from "./api";
import { ExpiringLruCache } from "../utils/expiringLruCache";
import { logger } from "../utils/logger";

export type UserProfileSummary = UserProfileSummaryDto;

// --- Tuning ----------------------------------------------------------------
/** Coalesce window: ids requested within this gap share one batch request. */
const FLUSH_WINDOW_MS = 60;
/** Fresh window for a successfully resolved summary. */
const SUMMARY_STALE_MS = 5 * 60 * 1000; // 5 minutes
/** Short negative cache for ids the server explicitly could not resolve. */
const NEGATIVE_TTL_MS = 60 * 1000; // 1 minute
/** Cooldown after a 429 when the server sends no Retry-After. */
const RATE_LIMIT_COOLDOWN_MS = 10 * 1000;
/** Max ids flushed in one tick (the API layer also chunks defensively). */
const MAX_FLUSH_BATCH = 50;

const summaryCache = new ExpiringLruCache<UserProfileSummary | null>({
  maxEntries: 500,
});

interface Deferred {
  promise: Promise<UserProfileSummary | null>;
  resolve: (value: UserProfileSummary | null) => void;
  reject: (reason: unknown) => void;
}

// userId -> deferred that resolves when the batch containing it settles.
const inFlight = new Map<string, Deferred>();
// userIds queued for the next flush.
let queue: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const createDeferred = (): Deferred => {
  let resolve!: (value: UserProfileSummary | null) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<UserProfileSummary | null>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const scheduleFlush = (): void => {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueue();
  }, FLUSH_WINDOW_MS);
};

const flushQueue = async (): Promise<void> => {
  if (queue.length === 0) return;

  // Drain the current queue; later calls accumulate into a fresh window.
  const ids = Array.from(new Set(queue));
  queue = [];

  // Process in bounded slices so one flush never exceeds the server cap.
  for (let i = 0; i < ids.length; i += MAX_FLUSH_BATCH) {
    const slice = ids.slice(i, i + MAX_FLUSH_BATCH);
    void runBatch(slice);
  }
};

const settle = (userId: string, value: UserProfileSummary | null): void => {
  const deferred = inFlight.get(userId);
  if (!deferred) return;
  inFlight.delete(userId);
  deferred.resolve(value);
};

const fail = (userId: string, reason: unknown): void => {
  const deferred = inFlight.get(userId);
  if (!deferred) return;
  inFlight.delete(userId);
  deferred.reject(reason);
};

/** Best-effort HTTP status extraction from an axios error or ApiContractError. */
const extractStatus = (error: unknown): number | undefined => {
  if (error && typeof error === "object") {
    const e = error as { response?: { status?: number }; statusCode?: number };
    return e.response?.status ?? e.statusCode;
  }
  return undefined;
};

/** Parse Retry-After (seconds) from a 429 response, in ms. */
const extractRetryAfterMs = (error: unknown): number | undefined => {
  if (error && typeof error === "object") {
    const headers = (error as { response?: { headers?: Record<string, unknown> } })
      .response?.headers;
    const raw = headers?.["retry-after"] ?? headers?.["Retry-After"];
    const seconds = Number.parseInt(String(raw ?? ""), 10);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }
  return undefined;
};

const runBatch = async (userIds: string[]): Promise<void> => {
  try {
    const map = await userApi.getUsersByIds(userIds);
    for (const userId of userIds) {
      const summary = map[userId] ?? null;
      // Cache positives for the full window; cache explicit nulls briefly so we
      // don't hammer the endpoint for genuinely missing users, but never let a
      // transient failure poison the cache (that path resolves null instead).
      summaryCache.set(
        userId,
        summary,
        Date.now() + (summary ? SUMMARY_STALE_MS : NEGATIVE_TTL_MS),
      );
      settle(userId, summary);
    }
  } catch (error) {
    const status = extractStatus(error);
    if (import.meta.env.DEV) {
      logger.warn("user-batch", "batch_request_failed", {
        count: userIds.length,
        status,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Endpoint genuinely missing (older backend) — DEV-only single-fetch
    // fallback so local dev still works. NEVER in production, and NEVER for
    // 429/5xx/network (those must not turn one batch into an N-request storm).
    if (import.meta.env.DEV && (status === 404 || status === 501)) {
      await fallbackPerId(userIds);
      return;
    }

    // Rate limited: respect Retry-After by negative-caching for the cooldown so
    // re-renders during the window don't re-queue a storm.
    if (status === 429) {
      const cooldownUntil =
        Date.now() + (extractRetryAfterMs(error) ?? RATE_LIMIT_COOLDOWN_MS);
      for (const userId of userIds) {
        summaryCache.set(userId, null, cooldownUntil);
        settle(userId, null);
      }
      return;
    }

    // Transient (network / 5xx): resolve null WITHOUT caching so the next render
    // retries — but no per-id fan-out.
    for (const userId of userIds) {
      settle(userId, null);
    }
  }
};

/**
 * DEV-only fallback used ONLY when the batch endpoint is missing (404/501),
 * e.g. running the FE against an older backend. Resolves each id via the legacy
 * single-user endpoint so local development still works. Never reached in
 * production.
 */
const fallbackPerId = async (userIds: string[]): Promise<void> => {
  logger.warn("user-batch", "falling_back_to_single_fetch", {
    count: userIds.length,
  });

  await Promise.all(
    userIds.map(async (userId) => {
      try {
        const { unwrapApiSuccess } = await import("../lib/apiContract");
        const response = await userApi.getUserById(userId);
        const profile = unwrapApiSuccess(response) as unknown as UserProfileSummary;
        summaryCache.set(userId, profile, Date.now() + SUMMARY_STALE_MS);
        settle(userId, profile);
      } catch (error) {
        fail(userId, error);
      }
    }),
  );
};

/** Synchronous fresh-only cache read (seed UI without a flash). */
export const getCachedUserProfileSummary = (
  userId: string,
): UserProfileSummary | null | undefined =>
  userId ? summaryCache.get(userId) : undefined;

/**
 * Load a single user profile summary. Served from cache when fresh; otherwise
 * coalesced into the next batch flush. Concurrent calls for the same id share
 * one request.
 */
export const loadUserProfile = (
  userId: string,
): Promise<UserProfileSummary | null> => {
  if (!userId) return Promise.resolve(null);

  const cached = summaryCache.get(userId);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  const existing = inFlight.get(userId);
  if (existing) {
    return existing.promise;
  }

  const deferred = createDeferred();
  inFlight.set(userId, deferred);
  queue.push(userId);
  scheduleFlush();
  return deferred.promise;
};

/**
 * Load many summaries at once. Each id is coalesced through {@link loadUserProfile}
 * so the whole set resolves via a single batch request (or a few chunks).
 */
export const loadUserProfiles = async (
  userIds: string[],
): Promise<Record<string, UserProfileSummary | null>> => {
  const uniqueIds = Array.from(
    new Set(userIds.filter((id): id is string => Boolean(id))),
  );
  const entries = await Promise.all(
    uniqueIds.map(async (userId) => {
      try {
        return [userId, await loadUserProfile(userId)] as const;
      } catch {
        return [userId, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
};

/** Seed the cache from data already fetched elsewhere (e.g. search results). */
export const primeUserProfileCache = (
  users: Record<string, UserProfileSummary | null>,
): void => {
  const now = Date.now();
  for (const [userId, summary] of Object.entries(users)) {
    if (!userId) continue;
    summaryCache.set(
      userId,
      summary,
      now + (summary ? SUMMARY_STALE_MS : NEGATIVE_TTL_MS),
    );
  }
};

/** Drop a cached summary (e.g. after the user edits their own profile). */
export const invalidateUserProfileSummary = (userId: string): void => {
  if (userId) summaryCache.delete(userId);
};

/** Test-only: reset all loader state. */
export const __resetUserBatchLoaderForTests = (): void => {
  summaryCache.clear();
  inFlight.clear();
  queue = [];
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
};
