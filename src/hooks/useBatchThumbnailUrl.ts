/**
 * Phase 02: Hook for fetching batch thumbnail URLs for timeline display.
 *
 * Loop-safety design (do NOT regress):
 *  - The set of fileIds is reduced to a STABLE string key (unique + sorted +
 *    joined by "|"). Effects depend on that string, never on the caller's array
 *    instance — otherwise every render recreates the array and refetches.
 *  - A module-level TTL cache (per fileId) gates fetching: a fileId is only
 *    requested when it has no fresh cache entry. READY URLs are reused until
 *    they near expiry; PENDING/FAILED responses get a short negative TTL so we
 *    don't hammer the endpoint while the thumbnail pipeline catches up.
 *  - A module-level in-flight map dedupes concurrent requests for the same
 *    (conversation, fileIds) batch — including React StrictMode double effects.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fileApi } from "../services/api";
import { unwrapApiSuccess } from "../lib/apiContract";
import { resolvePublicResourceUrl } from "../config";
import { ExpiringLruCache } from "../utils/expiringLruCache";
import { logger } from "../utils/logger";

export interface ThumbnailUrlItem {
  fileId: string;
  url: string | null;
  expiresAt: string | null;
  status: 'ok' | 'not_found' | 'forbidden' | 'not_previewable' | 'error';
  variant?: 'thumbnail' | 'preview' | 'original' | 'pending';
  width?: number | null;
  height?: number | null;
  mimeType?: string;
  fallbackReason?: string;
}

interface UseBatchThumbnailUrlResult {
  urls: Record<string, ThumbnailUrlItem>;
  isLoading: boolean;
  error: string | null;
  /** force=true bypasses the TTL gate (user retry / broken signed URL). */
  refresh: (force?: boolean) => Promise<void>;
}

// --- TTL / cooldown tuning -------------------------------------------------
const SAFETY_SKEW_MS = 60_000; // refresh READY urls 60s before real expiry
const MIN_READY_TTL_MS = 30_000; // never gate a READY url for less than this
const FALLBACK_TTL_MS = 5 * 60_000; // unparseable expiry → cache 5m (+ warn)
const PENDING_TTL_MS = 10_000; // negative cache for PENDING thumbnails
const FAILED_TTL_MS = 60_000; // negative cache for not_found/forbidden/error

// Cache value = the resolved display item. The cache entry's expiry encodes
// "refetch after" time, so ExpiringLruCache.get() returning undefined means
// "this fileId needs a (re)fetch".
const THUMBNAIL_CACHE = new ExpiringLruCache<ThumbnailUrlItem>({
  maxEntries: 1000,
});

// Dedupe concurrent network calls for identical batches.
const inFlightBatchRequests = new Map<
  string,
  Promise<Record<string, ThumbnailUrlItem>>
>();

const parseExpiry = (expiresAt?: string | null): number => {
  if (!expiresAt) return Number.NaN;
  // Numeric epoch (seconds or milliseconds).
  if (/^\d+$/.test(expiresAt)) {
    const num = Number(expiresAt);
    return num < 1e12 ? num * 1000 : num;
  }
  const parsed = Date.parse(expiresAt);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
};

const computeRefetchAtMs = (item: ThumbnailUrlItem): number => {
  const now = Date.now();
  if (item.variant === 'pending') return now + PENDING_TTL_MS;
  if (item.status !== 'ok' || !item.url) return now + FAILED_TTL_MS;

  const expiry = parseExpiry(item.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now) {
    logger.warn("thumbnail", "invalid_or_past_expiry_fallback", {
      fileId: item.fileId,
      expiresAt: item.expiresAt,
    });
    return now + FALLBACK_TTL_MS;
  }
  return Math.max(expiry - SAFETY_SKEW_MS, now + MIN_READY_TTL_MS);
};

const resolveItem = (raw: {
  fileId: string;
  url: string | null;
  expiresAt: string | null;
  status: string;
  variant?: ThumbnailUrlItem['variant'];
  width?: number | null;
  height?: number | null;
  mimeType?: string;
  fallbackReason?: string;
}): ThumbnailUrlItem => {
  const base: ThumbnailUrlItem = {
    ...raw,
    status: raw.status as ThumbnailUrlItem['status'],
  };

  if (raw.url) {
    const resolvedUrl = resolvePublicResourceUrl(raw.url, {
      context: 'image',
      allowBlob: true,
    });
    return { ...base, url: resolvedUrl ?? null };
  }
  return base;
};

const readCachedUrls = (
  fileIds: string[],
): { cached: Record<string, ThumbnailUrlItem>; missing: string[] } => {
  const cached: Record<string, ThumbnailUrlItem> = {};
  const missing: string[] = [];
  for (const id of fileIds) {
    const hit = THUMBNAIL_CACHE.get(id);
    if (hit) {
      cached[id] = hit;
    } else {
      missing.push(id);
    }
  }
  return { cached, missing };
};

const dedupedBatchFetch = (
  conversationId: string,
  fileIds: string[],
): Promise<Record<string, ThumbnailUrlItem>> => {
  const key = `${conversationId}::${[...fileIds].sort().join('|')}`;
  const existing = inFlightBatchRequests.get(key);
  if (existing) return existing;

  const request = (async () => {
    const response = await fileApi.batchThumbnailUrls({
      conversationId,
      fileIds,
    });
    const payload = unwrapApiSuccess(response);
    const resolved: Record<string, ThumbnailUrlItem> = {};
    for (const raw of payload.items) {
      const item = resolveItem(raw);
      THUMBNAIL_CACHE.set(item.fileId, item, computeRefetchAtMs(item));
      resolved[item.fileId] = item;
    }
    return resolved;
  })()
    .finally(() => {
      inFlightBatchRequests.delete(key);
    });

  inFlightBatchRequests.set(key, request);
  return request;
};

export const useBatchThumbnailUrl = (
  conversationId: string | undefined,
  fileIds: string[],
  options: { autoFetch?: boolean } = {},
): UseBatchThumbnailUrlResult => {
  const { autoFetch = true } = options;

  // Stable key derived from unique + sorted ids. join('|') in the dep array
  // keeps this from recomputing unless the actual id set changes.
  const stableKey = useMemo(
    () => Array.from(new Set(fileIds.filter(Boolean))).sort().join('|'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fileIds.join('|')],
  );

  const [urls, setUrls] = useState<Record<string, ThumbnailUrlItem>>(() => {
    if (!stableKey) return {};
    return readCachedUrls(stableKey.split('|')).cached;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runFetch = useCallback(
    async (force: boolean) => {
      if (!conversationId || !stableKey) return;
      const ids = stableKey.split('|');

      const { cached, missing } = readCachedUrls(ids);
      const idsToFetch = force ? ids : missing;

      // Always surface whatever is already cached.
      if (mountedRef.current && Object.keys(cached).length > 0) {
        setUrls((prev) => ({ ...prev, ...cached }));
      }

      // Everything fresh → no network call.
      if (idsToFetch.length === 0) return;

      if (mountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const resolved = await dedupedBatchFetch(conversationId, idsToFetch);
        if (mountedRef.current) {
          setUrls((prev) => ({ ...prev, ...cached, ...resolved }));
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(
            err instanceof Error ? err.message : "Failed to fetch thumbnail URLs",
          );
        }
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    },
    [conversationId, stableKey],
  );

  // Depends only on stable primitives — never on `urls`, the fileIds array, or
  // a fetch callback recreated each render.
  useEffect(() => {
    if (!autoFetch) return;
    void runFetch(false);
  }, [autoFetch, runFetch]);

  const refresh = useCallback(
    async (force = true) => {
      await runFetch(force);
    },
    [runFetch],
  );

  return { urls, isLoading, error, refresh };
};

export default useBatchThumbnailUrl;
