/**
 * @fileoverview Cached + in-flight-deduped fetcher for user detail
 * (`GET /api/v1/users/{id}`).
 *
 * Mirrors the established repo pattern (see `useBatchThumbnailUrl` /
 * `useMessageSearch`): a module-level TTL cache keyed by `userId` plus an
 * in-flight map so concurrent callers (and React StrictMode's double effect)
 * share a single network request.
 *
 * Why this exists: the User Info panel must NOT re-hit the endpoint just
 * because a new message arrived / the conversation object changed / the
 * component re-rendered. Callers fetch by `userId` only; identical fresh
 * requests are served from cache with zero network traffic.
 */

import { getUserByIdUseCase } from "../features/chat/usecases/getUserById";
import { unwrapApiSuccess } from "../lib/apiContract";
import { ExpiringLruCache } from "../utils/expiringLruCache";
import { logger } from "../utils/logger";

const USER_PROFILE_STALE_MS = 5 * 60 * 1000; // 5 minutes

const fetchUserProfileRaw = async (userId: string) => {
  const response = await getUserByIdUseCase(userId);
  return unwrapApiSuccess(response);
};

export type CachedUserProfile = Awaited<ReturnType<typeof fetchUserProfileRaw>>;

const userProfileCache = new ExpiringLruCache<CachedUserProfile>({
  maxEntries: 200,
});

// Dedupe concurrent network calls for the same userId.
const inFlightUserProfileRequests = new Map<
  string,
  Promise<CachedUserProfile>
>();

/** Synchronous, fresh-only cache read (used to seed UI without a flash). */
export const getCachedUserProfile = (
  userId: string,
): CachedUserProfile | undefined =>
  userId ? userProfileCache.get(userId) : undefined;

/**
 * Fetch a user profile at most once per (userId, stale window). Returns the
 * cached value immediately when fresh; otherwise reuses any in-flight request
 * or starts a new one. `force` bypasses the freshness gate but still dedupes
 * against an in-flight request.
 */
export const fetchUserProfileOnce = (
  userId: string,
  options: { force?: boolean } = {},
): Promise<CachedUserProfile> => {
  if (!options.force) {
    const cached = userProfileCache.get(userId);
    if (cached) {
      if (import.meta.env.DEV) {
        logger.debug("user-profile", "cache_hit", { userId });
      }
      return Promise.resolve(cached);
    }
  }

  const existing = inFlightUserProfileRequests.get(userId);
  if (existing) {
    if (import.meta.env.DEV) {
      logger.debug("user-profile", "in_flight_reused", { userId });
    }
    return existing;
  }

  if (import.meta.env.DEV) {
    logger.debug("user-profile", "fetch_start", { userId });
  }

  const request = fetchUserProfileRaw(userId)
    .then((profile) => {
      userProfileCache.set(
        userId,
        profile,
        Date.now() + USER_PROFILE_STALE_MS,
      );
      if (import.meta.env.DEV) {
        logger.debug("user-profile", "fetch_success", { userId });
      }
      return profile;
    })
    .finally(() => {
      inFlightUserProfileRequests.delete(userId);
    });

  inFlightUserProfileRequests.set(userId, request);
  return request;
};

/** Drop a cached entry (e.g. after the user edits their own profile). */
export const invalidateUserProfile = (userId: string): void => {
  if (userId) userProfileCache.delete(userId);
};
