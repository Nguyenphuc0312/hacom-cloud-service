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
import { blobPreviewCache } from "../lib/blobPreviewCache";
import { reportImagePerformance } from "../utils/imagePerformanceTelemetry";

export interface ThumbnailUrlItem {
  fileId: string;
  url: string | null;
  expiresAt: string | null;
  /**
   * ready          — signed URL available; use `url`.
   * processing     — thumbnail job running; retry after `retryAfterMs`.
   * queued         — thumbnail job enqueued but not started; retry after `retryAfterMs`.
   * not_previewable — file type not supported; do NOT retry.
   * failed         — thumbnail generation failed permanently; do NOT retry.
   * not_found      — fileId does not exist.
   * forbidden      — no access to this file.
   * error          — unexpected server error.
   */
  status: 'ready' | 'processing' | 'queued' | 'not_previewable' | 'failed' | 'not_found' | 'forbidden' | 'error';
  /** Only set when a URL is returned (status = ready). */
  variant?: 'thumbnail' | 'preview' | 'original';
  width?: number | null;
  height?: number | null;
  mimeType?: string;
  fallbackReason?: string | null;
  /**
   * Whether the client is allowed to retry this fileId.
   * False = terminal state; the hook will use a long negative TTL and never auto-retry.
   */
  isRetryable: boolean;
  /** Milliseconds to wait before retrying. Null when isRetryable = false. */
  retryAfterMs: number | null;
  /** Suggested cache TTL from the server (ms). Hook uses this to set the LRU expiry. */
  cacheTtlMs: number | null;
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
const MAX_THUMBNAIL_CACHE_ENTRIES = 500;
const MAX_PREVIEW_SIGNAL_KEYS = 500;
const MAX_BATCH_IDS = 20;
const BATCH_WINDOW_MS = 16;
const MAX_BATCH_REQUESTS_PER_CONVERSATION = 2;

// Cache value = the resolved display item. The cache entry's expiry encodes
// "refetch after" time, so ExpiringLruCache.get() returning undefined means
// "this fileId needs a (re)fetch".
const THUMBNAIL_CACHE = new ExpiringLruCache<ThumbnailUrlItem>({
  maxEntries: MAX_THUMBNAIL_CACHE_ENTRIES,
});

// Dedupe concurrent network calls for identical batches.
const inFlightBatchRequests = new Map<
  string,
  Promise<Record<string, ThumbnailUrlItem>>
>();

interface QueuedBatchRequest {
  fileIds: string[];
  queuedAtMs: number;
  resolve: (items: Record<string, ThumbnailUrlItem>) => void;
  reject: (error: unknown) => void;
}

interface ConversationBatchQueue {
  pending: QueuedBatchRequest[];
  timer: ReturnType<typeof setTimeout> | null;
  active: number;
}

const conversationBatchQueues = new Map<string, ConversationBatchQueue>();

const isTimelineBatchingEnabled = (): boolean =>
  import.meta.env.VITE_WEB_IMAGE_TIMELINE_BATCHING_ENABLED !== "false";

// --- Realtime preview signals (WebSocket-driven) ---------------------------
// When the worker finishes a thumbnail it publishes `attachment:preview_ready`
// (or `:_failed`). The WS handler calls markPreview*() below, which evicts the
// per-file TTL cache entry and notifies any mounted hook watching that fileId so
// it re-fetches a fresh signed URL immediately — turning polling into a fallback
// rather than the primary delivery path.
const previewSignalListeners = new Map<string, Set<() => void>>();

const prunePreviewSignalListeners = (): void => {
  for (const [fileId, listeners] of previewSignalListeners) {
    if (listeners.size === 0) {
      previewSignalListeners.delete(fileId);
    }
  }
};

const subscribePreviewSignal = (
  fileIds: string[],
  cb: () => void,
): (() => void) => {
  for (const id of fileIds) {
    if (!id) continue;
    let set = previewSignalListeners.get(id);
    if (!set) {
      prunePreviewSignalListeners();
      if (previewSignalListeners.size >= MAX_PREVIEW_SIGNAL_KEYS) {
        logger.warn("thumbnail", "preview_signal_listener_cap_reached", {
          fileId: id,
          maxKeys: MAX_PREVIEW_SIGNAL_KEYS,
        });
        continue;
      }
      set = new Set();
      previewSignalListeners.set(id, set);
    }
    set.add(cb);
  }
  return () => {
    for (const id of fileIds) {
      const set = previewSignalListeners.get(id);
      if (!set) continue;
      set.delete(cb);
      if (set.size === 0) previewSignalListeners.delete(id);
    }
  };
};

const emitPreviewSignal = (fileId: string): void => {
  const set = previewSignalListeners.get(fileId);
  if (!set) return;
  for (const cb of set) {
    try {
      cb();
    } catch {
      // listener errors must not break the emitter loop
    }
  }
};

/**
 * Called when a WS `attachment:preview_ready` event arrives. Evicts the cached
 * (likely PENDING) entry so the next fetch returns the READY signed URL, then
 * nudges any mounted hook to refetch now. Idempotent — safe to call repeatedly.
 */
export const markPreviewReady = (fileId: string): void => {
  if (!fileId) return;
  THUMBNAIL_CACHE.delete(fileId);
  blobPreviewCache.delete(fileId); // revoke local blob, server URL now available
  emitPreviewSignal(fileId);
};

/**
 * Called when a WS `attachment:preview_failed` event arrives. Evicts the cached
 * entry so the next fetch reflects the terminal failed/fallback state from the
 * server (which decides retryability).
 */
export const markPreviewFailed = (fileId: string): void => {
  if (!fileId) return;
  THUMBNAIL_CACHE.delete(fileId);
  emitPreviewSignal(fileId);
};

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

  // Server explicitly says do not retry — use a long terminal TTL so the hook
  // never re-fetches. This covers not_previewable, failed, not_found, forbidden.
  if (!item.isRetryable && item.status !== 'ready') {
    return now + FAILED_TTL_MS;
  }

  // Retryable in-flight state — use server-supplied cacheTtlMs or retryAfterMs,
  // falling back to PENDING_TTL_MS.
  if (item.isRetryable) {
    const serverDelay = item.cacheTtlMs ?? item.retryAfterMs;
    const delay = typeof serverDelay === 'number' && serverDelay > 0 ? serverDelay : PENDING_TTL_MS;
    return now + delay;
  }

  // Ready — prefer server-supplied cacheTtlMs over computing from expiresAt.
  if (typeof item.cacheTtlMs === 'number' && item.cacheTtlMs > 0) {
    return now + Math.max(item.cacheTtlMs, MIN_READY_TTL_MS);
  }

  // Signed URL is valid — cache until safety skew before real expiry.
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
  variant?: ThumbnailUrlItem['variant'] | 'pending'; // accept legacy 'pending' defensively
  width?: number | null;
  height?: number | null;
  mimeType?: string;
  fallbackReason?: string | null;
  isRetryable?: boolean;    // present in new contract; absent in legacy responses
  retryAfterMs?: number | null;
  cacheTtlMs?: number | null;
}): ThumbnailUrlItem => {
  // Strip legacy 'pending' variant — it was a BE bug, treat as no variant.
  const safeVariant: ThumbnailUrlItem['variant'] =
    raw.variant === 'pending' ? undefined : raw.variant;

  const status = raw.status as ThumbnailUrlItem['status'];

  // If the server didn't send isRetryable (legacy response), derive it from status.
  const isRetryable: boolean = raw.isRetryable !== undefined
    ? raw.isRetryable
    : (status === 'processing' || status === 'queued');

  const base: ThumbnailUrlItem = {
    ...raw,
    status,
    variant: safeVariant,
    isRetryable,
    retryAfterMs: raw.retryAfterMs ?? null,
    cacheTtlMs: raw.cacheTtlMs ?? null,
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

const executeBatchFetch = async (
  conversationId: string,
  fileIds: string[],
): Promise<Record<string, ThumbnailUrlItem>> => {
  const startedAtMs = performance.now();
  let outcome: 'success' | 'error' = 'error';
  try {
    const response = await fileApi.batchThumbnailUrls({ conversationId, fileIds });
    const payload = unwrapApiSuccess(response);
    const resolved: Record<string, ThumbnailUrlItem> = {};
    for (const raw of payload.items) {
      const item = resolveItem(raw);
      THUMBNAIL_CACHE.set(item.fileId, item, computeRefetchAtMs(item));
      resolved[item.fileId] = item;
    }
    outcome = 'success';
    return resolved;
  } finally {
    reportImagePerformance({ kind: 'batch_url_request', batchSize: fileIds.length, durationMs: Math.round(performance.now() - startedAtMs), outcome });
  }
};

const flushConversationQueue = (conversationId: string): void => {
  const queue = conversationBatchQueues.get(conversationId);
  if (!queue) return;
  if (queue.timer) { clearTimeout(queue.timer); queue.timer = null; }
  if (queue.active >= MAX_BATCH_REQUESTS_PER_CONVERSATION || queue.pending.length === 0) return;
  const selected: QueuedBatchRequest[] = [];
  const selectedIds = new Set<string>();
  const deferred: QueuedBatchRequest[] = [];
  for (const request of queue.pending) {
    const nextIds = request.fileIds.filter((id) => !selectedIds.has(id));
    if (selected.length > 0 && selectedIds.size + nextIds.length > MAX_BATCH_IDS) { deferred.push(request); continue; }
    selected.push(request);
    for (const id of nextIds) selectedIds.add(id);
  }
  queue.pending = deferred;
  if (selected.length === 0) return;
  queue.active += 1;
  const queueWaitMs = Math.max(0, Date.now() - Math.min(...selected.map((request) => request.queuedAtMs)));
  void executeBatchFetch(conversationId, [...selectedIds])
    .then((results) => {
      reportImagePerformance({ kind: 'batch_url_request', batchSize: selectedIds.size, queueWaitMs, outcome: 'success' });
      for (const request of selected) {
        const requestResults: Record<string, ThumbnailUrlItem> = {};
        for (const fileId of request.fileIds) { const item = results[fileId]; if (item) requestResults[fileId] = item; }
        request.resolve(requestResults);
      }
    })
    .catch((error) => {
      reportImagePerformance({ kind: 'batch_url_request', batchSize: selectedIds.size, queueWaitMs, outcome: 'error' });
      for (const request of selected) request.reject(error);
    })
    .finally(() => {
      const current = conversationBatchQueues.get(conversationId);
      if (!current) return;
      current.active -= 1;
      if (current.pending.length > 0) current.timer = setTimeout(() => flushConversationQueue(conversationId), 0);
      else if (current.active === 0) conversationBatchQueues.delete(conversationId);
    });
};

const enqueueBatchFetch = (conversationId: string, fileIds: string[]): Promise<Record<string, ThumbnailUrlItem>> => {
  if (!isTimelineBatchingEnabled()) return executeBatchFetch(conversationId, fileIds);
  return new Promise((resolve, reject) => {
    const queue = conversationBatchQueues.get(conversationId) ?? { pending: [], timer: null, active: 0 };
    queue.pending.push({ fileIds, queuedAtMs: Date.now(), resolve, reject });
    conversationBatchQueues.set(conversationId, queue);
    if (!queue.timer) queue.timer = setTimeout(() => flushConversationQueue(conversationId), BATCH_WINDOW_MS);
  });
};

const dedupedBatchFetch = (
  conversationId: string,
  fileIds: string[],
): Promise<Record<string, ThumbnailUrlItem>> => {
  const key = `${conversationId}::${[...fileIds].sort().join('|')}`;
  const existing = inFlightBatchRequests.get(key);
  if (existing) return existing;
  const request = enqueueBatchFetch(conversationId, fileIds).finally(() => inFlightBatchRequests.delete(key));

  inFlightBatchRequests.set(key, request);
  return request;
};

/**
 * Shared, deduped, TTL-cached batch fetch for thumbnail URLs.
 *
 * This is the SAME cache (`THUMBNAIL_CACHE`) and in-flight dedupe used by the
 * timeline hook below. Other surfaces that render the same files — the Shared
 * Resources drawer and the "Kho lưu trữ" modal — call this instead of issuing
 * their own `fileApi.batchThumbnailUrls` requests, so a `fileId` shown in the
 * timeline and again in the library is fetched at most once per TTL (no
 * duplicate presigned-URL minting). WS `attachment:preview_ready` evicts this
 * cache via `markPreviewReady`, benefiting every surface at once.
 *
 * Returns the resolved items for every requested id (cached + freshly fetched).
 * Never throws for individual ids; a failed batch rejects so the caller can
 * decide whether to surface the error.
 */
export const fetchThumbnailUrlsShared = async (
  conversationId: string,
  fileIds: string[],
  options: { force?: boolean } = {},
): Promise<Record<string, ThumbnailUrlItem>> => {
  const ids = Array.from(new Set(fileIds.filter(Boolean)));
  if (!conversationId || ids.length === 0) return {};

  const { cached, missing } = readCachedUrls(ids);
  const idsToFetch = options.force ? ids : missing;
  if (idsToFetch.length === 0) return cached;

  const resolved = await dedupedBatchFetch(conversationId, idsToFetch);
  return { ...cached, ...resolved };
};

/** Canonical name for the shared batch fetch (alias of fetchThumbnailUrlsShared). */
export const getBatchThumbnailUrls = fetchThumbnailUrlsShared;

/** Synchronous fresh-only read from the shared thumbnail cache. */
export const readThumbnailCache = (
  fileId: string,
): ThumbnailUrlItem | undefined =>
  fileId ? THUMBNAIL_CACHE.get(fileId) : undefined;

/** Seed the shared cache from items already resolved elsewhere. */
export const primeThumbnailCache = (items: ThumbnailUrlItem[]): void => {
  for (const item of items) {
    if (!item?.fileId) continue;
    THUMBNAIL_CACHE.set(item.fileId, item, computeRefetchAtMs(item));
  }
};

/** Drop a single fileId from the shared cache (e.g. broken signed URL). */
export const evictThumbnailCache = (fileId: string): void => {
  if (fileId) THUMBNAIL_CACHE.delete(fileId);
};

export const __thumbnailCacheTestUtils = {
  maxThumbnailEntries: MAX_THUMBNAIL_CACHE_ENTRIES,
  maxPreviewSignalKeys: MAX_PREVIEW_SIGNAL_KEYS,
  previewSignalKeyCount: () => previewSignalListeners.size,
  clearThumbnailCache: () => THUMBNAIL_CACHE.clear(),
  clearBatchQueues: () => {
    for (const queue of conversationBatchQueues.values()) if (queue.timer) clearTimeout(queue.timer);
    conversationBatchQueues.clear();
    inFlightBatchRequests.clear();
  },
  clearPreviewSignalListeners: () => previewSignalListeners.clear(),
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

  // Realtime: when a preview_ready/failed signal fires for any managed fileId,
  // refetch immediately (the cache entry was already evicted by markPreview*).
  useEffect(() => {
    if (!stableKey) return;
    const ids = stableKey.split("|");
    const unsubscribe = subscribePreviewSignal(ids, () => {
      void runFetch(false);
    });
    return unsubscribe;
  }, [stableKey, runFetch]);

  return { urls, isLoading, error, refresh };
};

export default useBatchThumbnailUrl;
