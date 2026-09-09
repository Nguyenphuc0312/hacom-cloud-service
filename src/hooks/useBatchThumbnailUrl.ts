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
import { useAuthStore } from "../stores/authStore";
import { registerStoreResetter } from "../stores/storeResetRegistry";
import { ExpiringLruCache } from "../utils/expiringLruCache";
import { logger } from "../utils/logger";
import { blobPreviewCache } from "../lib/blobPreviewCache";
import {
  markImagePerformanceMilestone,
  reportImagePerformance,
} from "../utils/imagePerformanceTelemetry";

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
  status: 'ready' | 'processing' | 'queued' | 'not_previewable' | 'failed' | 'fallback_original' | 'not_found' | 'forbidden' | 'error';
  /** Only set when a URL is returned (status = ready). */
  variant?: 'thumbnail' | 'preview' | 'original';
  width?: number | null;
  height?: number | null;
  aspectRatio?: number | null;
  placeholder?: string | null;
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
// Must track chat-api-service MAX_THUMBNAIL_URL_BATCH_SIZE. The API remains
// authoritative and rejects oversize batches instead of silently truncating.
const MAX_BATCH_IDS = 20;
const BATCH_WINDOW_MS = 16;
const MAX_BATCH_REQUESTS_PER_CONVERSATION = 2;

interface ScopedThumbnailCacheEntry {
  item: ThumbnailUrlItem;
  cacheEpoch: number;
  scopeEpoch: number;
  fileEpoch: number;
}

interface ThumbnailCacheScope {
  key: string;
  conversationId: string;
  cacheEpoch: number;
  scopeEpoch: number;
}

interface ThumbnailFetchOptions {
  force?: boolean;
  /** Internal escape hatch for callers that already subscribe to auth state. */
  accountId?: string;
}

type ThumbnailCacheInvalidation = "reset" | "conversation";
type ThumbnailCacheListener = (reason: ThumbnailCacheInvalidation) => void;

// Cache entries are scoped by account + conversation + file. Epochs make a
// late response harmless after logout, identity change, or resource revocation.
const THUMBNAIL_CACHE = new ExpiringLruCache<ScopedThumbnailCacheEntry>({
  maxEntries: MAX_THUMBNAIL_CACHE_ENTRIES,
});
let thumbnailCacheEpoch = 0;
const scopeEpochs = new Map<string, number>();
const fileEpochs = new Map<string, number>();
let activeAccountScope: string | null = null;

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
  scope: ThumbnailCacheScope;
}

const conversationBatchQueues = new Map<string, ConversationBatchQueue>();
const thumbnailCacheListeners = new Map<string, Set<ThumbnailCacheListener>>();

const isTimelineBatchingEnabled = (): boolean =>
  import.meta.env.VITE_WEB_IMAGE_TIMELINE_BATCHING_ENABLED !== "false";

const normalizeAccountId = (accountId: string | undefined): string =>
  accountId?.trim() || "anonymous";

/** Opaque local namespace; it never becomes a request parameter or telemetry field. */
export const buildThumbnailCacheScopeKey = (
  accountId: string | undefined,
  conversationId: string | undefined,
): string => {
  if (!conversationId) return "";
  return ["thumbnail-source-v2", normalizeAccountId(accountId), conversationId]
    .map(encodeURIComponent)
    .join(":");
};

const getActiveAccountId = (): string | undefined => useAuthStore.getState().user?.id;

const getScopeEpoch = (scopeKey: string): number => scopeEpochs.get(scopeKey) ?? 0;

const getFileEpoch = (fileId: string): number => fileEpochs.get(fileId) ?? 0;

const getScope = (
  conversationId: string | undefined,
  accountId: string | undefined,
): ThumbnailCacheScope | null => {
  const key = buildThumbnailCacheScopeKey(accountId, conversationId);
  if (!key || !conversationId) return null;
  return {
    key,
    conversationId,
    cacheEpoch: thumbnailCacheEpoch,
    scopeEpoch: getScopeEpoch(key),
  };
};

const getCacheEntryKey = (scopeKey: string, fileId: string): string =>
  `${scopeKey}:${encodeURIComponent(fileId)}`;

const getRequestScopeKey = (scope: ThumbnailCacheScope): string =>
  `${scope.key}:${scope.cacheEpoch}:${scope.scopeEpoch}`;

const isScopeCurrent = (scope: ThumbnailCacheScope): boolean =>
  thumbnailCacheEpoch === scope.cacheEpoch &&
  getScopeEpoch(scope.key) === scope.scopeEpoch;

const isEntryCurrent = (
  entry: ScopedThumbnailCacheEntry,
  scope: ThumbnailCacheScope,
  fileId: string,
): boolean =>
  entry.cacheEpoch === scope.cacheEpoch &&
  entry.scopeEpoch === scope.scopeEpoch &&
  entry.fileEpoch === getFileEpoch(fileId) &&
  isScopeCurrent(scope);

const subscribeThumbnailCache = (
  scopeKey: string,
  listener: ThumbnailCacheListener,
): (() => void) => {
  if (!scopeKey) return () => undefined;
  const listeners = thumbnailCacheListeners.get(scopeKey) ?? new Set<ThumbnailCacheListener>();
  listeners.add(listener);
  thumbnailCacheListeners.set(scopeKey, listeners);
  return () => {
    const current = thumbnailCacheListeners.get(scopeKey);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) thumbnailCacheListeners.delete(scopeKey);
  };
};

const emitThumbnailCacheInvalidation = (
  scopeKey: string,
  reason: ThumbnailCacheInvalidation,
): void => {
  const listeners = thumbnailCacheListeners.get(scopeKey);
  if (!listeners) return;
  for (const listener of [...listeners]) {
    try {
      listener(reason);
    } catch {
      // One mounted tile must not prevent the rest of the scope from clearing.
    }
  }
};

const emitAllThumbnailCacheInvalidations = (reason: ThumbnailCacheInvalidation): void => {
  for (const scopeKey of [...thumbnailCacheListeners.keys()]) {
    emitThumbnailCacheInvalidation(scopeKey, reason);
  }
};

/** Drops all signed thumbnail sources, including the result of any old request. */
export const clearThumbnailUrlCache = (): void => {
  thumbnailCacheEpoch += 1;
  THUMBNAIL_CACHE.clear();
  scopeEpochs.clear();
  fileEpochs.clear();
  emitAllThumbnailCacheInvalidations("reset");
};

registerStoreResetter("batch-thumbnail-url-cache", clearThumbnailUrlCache);

const ensureAccountScope = (accountId: string | undefined): void => {
  const nextScope = normalizeAccountId(accountId);
  if (activeAccountScope !== null && activeAccountScope !== nextScope) {
    clearThumbnailUrlCache();
  }
  activeAccountScope = nextScope;
};

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
  fileEpochs.set(fileId, getFileEpoch(fileId) + 1);
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
  fileEpochs.set(fileId, getFileEpoch(fileId) + 1);
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
  aspectRatio?: number | null;
  placeholder?: string | null;
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
  scope: ThumbnailCacheScope,
  fileIds: string[],
): { cached: Record<string, ThumbnailUrlItem>; missing: string[] } => {
  const cached: Record<string, ThumbnailUrlItem> = {};
  const missing: string[] = [];
  for (const id of fileIds) {
    const cacheKey = getCacheEntryKey(scope.key, id);
    const hit = THUMBNAIL_CACHE.get(cacheKey);
    if (hit && isEntryCurrent(hit, scope, id)) {
      cached[id] = hit.item;
    } else {
      if (hit) THUMBNAIL_CACHE.delete(cacheKey);
      missing.push(id);
    }
  }
  return { cached, missing };
};

const executeBatchFetch = async (
  scope: ThumbnailCacheScope,
  fileIds: string[],
  telemetry: {
    queueWaitMs?: number;
    subscriberCount?: number;
    deduplicatedIds?: number;
  } = {},
): Promise<Record<string, ThumbnailUrlItem>> => {
  const startedAtMs = performance.now();
  let outcome: 'success' | 'error' = 'error';
  try {
    const response = await fileApi.batchThumbnailUrls({
      conversationId: scope.conversationId,
      fileIds,
    });
    const payload = unwrapApiSuccess(response);
    const resolved: Record<string, ThumbnailUrlItem> = {};

    // A request started before logout/recall/account change cannot repopulate a
    // cache or return a source after its captured scope has been invalidated.
    if (!isScopeCurrent(scope)) return resolved;

    for (const raw of payload.items) {
      const item = resolveItem(raw);
      if (!isScopeCurrent(scope)) return {};
      THUMBNAIL_CACHE.set(
        getCacheEntryKey(scope.key, item.fileId),
        {
          item,
          cacheEpoch: scope.cacheEpoch,
          scopeEpoch: scope.scopeEpoch,
          fileEpoch: getFileEpoch(item.fileId),
        },
        computeRefetchAtMs(item),
      );
      resolved[item.fileId] = item;
    }
    outcome = 'success';
    markImagePerformanceMilestone(scope.conversationId, "T4", {
      batchSize: fileIds.length,
      outcome: "success",
    });
    return resolved;
  } finally {
    reportImagePerformance(scope.conversationId, {
      kind: 'batch_url_request',
      batchSize: fileIds.length,
      durationMs: Math.round(performance.now() - startedAtMs),
      ...telemetry,
      outcome,
    });
  }
};

const flushConversationQueue = (queueKey: string): void => {
  const queue = conversationBatchQueues.get(queueKey);
  if (!queue) return;
  if (queue.timer) {
    clearTimeout(queue.timer);
    queue.timer = null;
  }
  if (queue.active >= MAX_BATCH_REQUESTS_PER_CONVERSATION || queue.pending.length === 0) return;

  // Select complete callers greedily. A caller never has to wait for several
  // HTTP responses, and at most MAX_BATCH_IDS unique IDs reach the API.
  const selected: QueuedBatchRequest[] = [];
  const selectedIds = new Set<string>();
  const deferred: QueuedBatchRequest[] = [];
  for (const request of queue.pending) {
    const nextIds = request.fileIds.filter((id) => !selectedIds.has(id));
    if (selected.length > 0 && selectedIds.size + nextIds.length > MAX_BATCH_IDS) {
      deferred.push(request);
      continue;
    }
    selected.push(request);
    for (const id of nextIds) selectedIds.add(id);
  }
  queue.pending = deferred;
  if (selected.length === 0) return;
  queue.active += 1;
  const queueWaitMs = Math.max(0, Date.now() - Math.min(...selected.map((request) => request.queuedAtMs)));
  const requestedIds = selected.reduce(
    (total, request) => total + request.fileIds.length,
    0,
  );

  void executeBatchFetch(queue.scope, [...selectedIds], {
    queueWaitMs,
    subscriberCount: selected.length,
    deduplicatedIds: Math.max(0, requestedIds - selectedIds.size),
  })
    .then((results) => {
      for (const request of selected) {
        const requestResults: Record<string, ThumbnailUrlItem> = {};
        for (const fileId of request.fileIds) {
          const item = results[fileId];
          if (item) requestResults[fileId] = item;
        }
        request.resolve(requestResults);
      }
    })
    .catch((error) => {
      for (const request of selected) request.reject(error);
    })
    .finally(() => {
      const current = conversationBatchQueues.get(queueKey);
      if (current !== queue) return;
      current.active -= 1;
      if (current.pending.length > 0) {
        current.timer = setTimeout(() => flushConversationQueue(queueKey), 0);
      } else if (current.active === 0) {
        conversationBatchQueues.delete(queueKey);
      }
    });
};

const enqueueBatchFetch = (
  scope: ThumbnailCacheScope,
  fileIds: string[],
): Promise<Record<string, ThumbnailUrlItem>> => {
  if (!isTimelineBatchingEnabled()) return executeBatchFetch(scope, fileIds);
  const queueKey = getRequestScopeKey(scope);
  return new Promise((resolve, reject) => {
    const queue = conversationBatchQueues.get(queueKey) ?? {
      pending: [],
      timer: null,
      active: 0,
      scope,
    };
    queue.pending.push({ fileIds, queuedAtMs: Date.now(), resolve, reject });
    conversationBatchQueues.set(queueKey, queue);
    if (!queue.timer) {
      queue.timer = setTimeout(() => flushConversationQueue(queueKey), BATCH_WINDOW_MS);
    }
  });
};

const dedupedBatchFetch = (
  scope: ThumbnailCacheScope,
  fileIds: string[],
): Promise<Record<string, ThumbnailUrlItem>> => {
  const key = `${getRequestScopeKey(scope)}::${[...fileIds].sort().join('|')}`;
  const existing = inFlightBatchRequests.get(key);
  if (existing) {
    reportImagePerformance(scope.conversationId, {
      kind: "inflight_dedupe",
      deduplicatedIds: fileIds.length,
      outcome: "success",
    });
    return existing;
  }
  const request = enqueueBatchFetch(scope, fileIds);
  inFlightBatchRequests.set(key, request);
  void request.then(
    () => {
      if (inFlightBatchRequests.get(key) === request) inFlightBatchRequests.delete(key);
    },
    () => {
      if (inFlightBatchRequests.get(key) === request) inFlightBatchRequests.delete(key);
    },
  );
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
  options: ThumbnailFetchOptions = {},
): Promise<Record<string, ThumbnailUrlItem>> => {
  const ids = Array.from(new Set(fileIds.filter(Boolean)));
  if (!conversationId || ids.length === 0) return {};

  const accountId = options.accountId ?? getActiveAccountId();
  ensureAccountScope(accountId);
  const scope = getScope(conversationId, accountId);
  if (!scope) return {};

  const { cached, missing } = readCachedUrls(scope, ids);
  const idsToFetch = options.force ? ids : missing;
  if (idsToFetch.length === 0) return cached;

  const resolved = await dedupedBatchFetch(scope, idsToFetch);
  if (!isScopeCurrent(scope)) return {};
  return { ...cached, ...resolved };
};

/** Canonical name for the shared batch fetch (alias of fetchThumbnailUrlsShared). */
export const getBatchThumbnailUrls = fetchThumbnailUrlsShared;

/** Synchronous fresh-only read for a specific account/conversation source scope. */
export const readThumbnailCache = (
  conversationId: string,
  fileId: string,
  options: Pick<ThumbnailFetchOptions, "accountId"> = {},
): ThumbnailUrlItem | undefined => {
  if (!fileId) return undefined;
  const accountId = options.accountId ?? getActiveAccountId();
  ensureAccountScope(accountId);
  const scope = getScope(conversationId, accountId);
  if (!scope) return undefined;
  return readCachedUrls(scope, [fileId]).cached[fileId];
};

/** Seed the shared cache only inside the caller's account/conversation scope. */
export const primeThumbnailCache = (
  conversationId: string,
  items: ThumbnailUrlItem[],
  options: Pick<ThumbnailFetchOptions, "accountId"> = {},
): void => {
  const accountId = options.accountId ?? getActiveAccountId();
  ensureAccountScope(accountId);
  const scope = getScope(conversationId, accountId);
  if (!scope) return;
  for (const item of items) {
    if (!item?.fileId) continue;
    THUMBNAIL_CACHE.set(
      getCacheEntryKey(scope.key, item.fileId),
      {
        item,
        cacheEpoch: scope.cacheEpoch,
        scopeEpoch: scope.scopeEpoch,
        fileEpoch: getFileEpoch(item.fileId),
      },
      computeRefetchAtMs(item),
    );
  }
};

/** Drop a file from every account/conversation cache namespace. */
export const evictThumbnailCache = (fileId: string): void => {
  if (!fileId) return;
  fileEpochs.set(fileId, getFileEpoch(fileId) + 1);
};

/**
 * Invalidate one conversation's thumbnail namespace after recall/delete/access
 * loss. Existing entries and late results fail the captured scope epoch check.
 */
export const invalidateThumbnailUrlCacheForConversation = (
  conversationId: string,
  options: Pick<ThumbnailFetchOptions, "accountId"> = {},
): void => {
  const accountId = options.accountId ?? getActiveAccountId();
  ensureAccountScope(accountId);
  const scope = getScope(conversationId, accountId);
  if (!scope) return;
  scopeEpochs.set(scope.key, scope.scopeEpoch + 1);
  emitThumbnailCacheInvalidation(scope.key, "conversation");
};

/** @deprecated Use invalidateThumbnailUrlCacheForConversation. */
export const evictThumbnailCacheForConversation = invalidateThumbnailUrlCacheForConversation;

export const __thumbnailCacheTestUtils = {
  maxThumbnailEntries: MAX_THUMBNAIL_CACHE_ENTRIES,
  maxPreviewSignalKeys: MAX_PREVIEW_SIGNAL_KEYS,
  previewSignalKeyCount: () => previewSignalListeners.size,
  clearThumbnailCache: clearThumbnailUrlCache,
  clearThumbnailCacheListeners: () => thumbnailCacheListeners.clear(),
  clearBatchQueues: () => {
    for (const queue of conversationBatchQueues.values()) {
      if (queue.timer) clearTimeout(queue.timer);
    }
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
  const accountId = useAuthStore((state) => state.user?.id);

  // Stable key derived from unique + sorted ids. join('|') in the dep array
  // keeps this from recomputing unless the actual id set changes.
  const stableKey = useMemo(
    () => Array.from(new Set(fileIds.filter(Boolean))).sort().join('|'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fileIds.join('|')],
  );
  const scopeKey = useMemo(
    () => buildThumbnailCacheScopeKey(accountId, conversationId),
    [accountId, conversationId],
  );
  const currentScopeRef = useRef(scopeKey);
  currentScopeRef.current = scopeKey;

  const [urlState, setUrlState] = useState<{
    scopeKey: string;
    urls: Record<string, ThumbnailUrlItem>;
  }>(() => {
    const scope = getScope(conversationId, accountId);
    return {
      scopeKey: scope?.key ?? "",
      urls: scope && stableKey ? readCachedUrls(scope, stableKey.split("|")).cached : {},
    };
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

  useEffect(() => {
    ensureAccountScope(accountId);
  }, [accountId]);

  const runFetch = useCallback(
    async (force: boolean) => {
      if (!conversationId || !stableKey) return;
      ensureAccountScope(accountId);
      const scope = getScope(conversationId, accountId);
      if (!scope) return;
      const ids = stableKey.split('|');
      const { cached, missing } = readCachedUrls(scope, ids);
      const idsToFetch = force ? ids : missing;

      if (
        mountedRef.current &&
        currentScopeRef.current === scope.key &&
        isScopeCurrent(scope)
      ) {
        setUrlState({ scopeKey: scope.key, urls: cached });
      }
      if (idsToFetch.length === 0) return;

      if (mountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const resolved = await dedupedBatchFetch(scope, idsToFetch);
        if (
          mountedRef.current &&
          currentScopeRef.current === scope.key &&
          isScopeCurrent(scope)
        ) {
          setUrlState({ scopeKey: scope.key, urls: { ...cached, ...resolved } });
        }
      } catch {
        if (
          mountedRef.current &&
          currentScopeRef.current === scope.key &&
          isScopeCurrent(scope)
        ) {
          setError("Không thể tải ảnh xem trước.");
        }
      } finally {
        if (
          mountedRef.current &&
          currentScopeRef.current === scope.key &&
          isScopeCurrent(scope)
        ) {
          setIsLoading(false);
        }
      }
    },
    [accountId, conversationId, stableKey],
  );

  useEffect(() => {
    if (!scopeKey) return;
    return subscribeThumbnailCache(scopeKey, (reason) => {
      if (!mountedRef.current || currentScopeRef.current !== scopeKey) return;
      setUrlState({ scopeKey, urls: {} });
      setError(null);
      setIsLoading(false);
      if (reason === "conversation") void runFetch(false);
    });
  }, [runFetch, scopeKey]);

  // Depends only on stable primitives — never on URL state or the caller array.
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
  // refetch immediately (the cache entry was already invalidated by markPreview*).
  useEffect(() => {
    if (!stableKey) return;
    const ids = stableKey.split("|");
    return subscribePreviewSignal(ids, () => {
      void runFetch(false);
    });
  }, [stableKey, runFetch]);

  const urls = urlState.scopeKey === scopeKey ? urlState.urls : {};
  return { urls, isLoading, error, refresh };
};

export default useBatchThumbnailUrl;
