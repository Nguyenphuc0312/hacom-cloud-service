import { cloudApi } from "../api/cloudApi";
import type { CloudFileAccess } from "../types";

const EXPIRY_SKEW_MS = 30_000;
const MAX_ENTRIES = 300;

interface CacheEntry {
  access: CloudFileAccess;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<CloudFileAccess>>();

const keyFor = (userId: string, itemId: string): string => `${userId}:${itemId}`;

const isFresh = (access: CloudFileAccess): boolean => {
  const expiresAt = Date.parse(access.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt - Date.now() > EXPIRY_SKEW_MS;
};
const remember = (key: string, access: CloudFileAccess): void => {
  cache.delete(key);
  cache.set(key, { access });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    cache.delete(oldest);
  }
};

/**
 * Cloud's singular access endpoint is kept secure and owner-scoped. This
 * adapter gives it the same client behaviour as Chat: lazy callers share one
 * request and signed URLs are reused only until shortly before expiry.
 */
export const getCachedCloudFileAccess = async (
  userId: string,
  itemId: string,
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<CloudFileAccess> => {
  const key = keyFor(userId, itemId);
  const cached = cache.get(key)?.access;
  if (!options.force && cached && isFresh(cached)) {
    return cached;
  }

  if (!options.force) {
    const pending = inFlight.get(key);
    if (pending) return pending;
  }

  const request = cloudApi.getFileAccess(userId, itemId, options.signal).then((access) => {
    remember(key, access);
    return access;
  });
  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    if (inFlight.get(key) === request) inFlight.delete(key);
  }
};

export const clearCloudFileAccessCache = (): void => {
  cache.clear();
  inFlight.clear();
};

export const invalidateCloudFileAccess = (
  userId: string,
  itemId: string,
): void => {
  const key = keyFor(userId, itemId);
  cache.delete(key);
  inFlight.delete(key);
};
