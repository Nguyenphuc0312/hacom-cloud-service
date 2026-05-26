/**
 * Phase 02: Hook for fetching batch thumbnail URLs for timeline display.
 * Uses the batch-thumbnail-urls API to get thumbnail variants for multiple images.
 */

import React, { useCallback, useEffect, useState } from "react";
import { fileApi } from "../services/api";
import { unwrapApiSuccess } from "../lib/apiContract";
import { resolvePublicResourceUrl } from "../config";
import { ExpiringLruCache } from "../utils/expiringLruCache";

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
  refresh: () => Promise<void>;
}

interface SignedUrlCacheEntry {
  url: string;
}

const BATCH_THUMBNAIL_CACHE = new ExpiringLruCache<SignedUrlCacheEntry>({
  maxEntries: 500,
});

const CACHE_SKEW_MS = 30_000;

const parseExpiry = (expiresAt?: string): number => {
  if (!expiresAt) return Date.now();
  const parsed = Date.parse(expiresAt);
  return Number.isNaN(parsed) ? Date.now() : parsed;
};

export const useBatchThumbnailUrl = (
  conversationId: string | undefined,
  fileIds: string[],
  options: { autoFetch?: boolean } = {},
): UseBatchThumbnailUrlResult => {
  const { autoFetch = true } = options;
  
  const [urls, setUrls] = useState<Record<string, ThumbnailUrlItem>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUrls = useCallback(async () => {
    if (!conversationId || fileIds.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fileApi.batchThumbnailUrls({
        conversationId,
        fileIds,
      });
      
      const payload = unwrapApiSuccess(response);
      
      // Resolve URLs and update cache
      const resolvedUrls: Record<string, ThumbnailUrlItem> = {};
      for (const item of payload.items) {
        if (item.url) {
          const resolvedUrl = resolvePublicResourceUrl(item.url, {
            context: 'image',
            allowBlob: true,
          });
          if (resolvedUrl) {
            const expiresAtMs = parseExpiry(item.expiresAt || undefined);
            // Cache the resolved URL
            BATCH_THUMBNAIL_CACHE.set(item.fileId, { url: resolvedUrl }, expiresAtMs);
            resolvedUrls[item.fileId] = {
              ...item,
              url: resolvedUrl,
            };
          } else {
            resolvedUrls[item.fileId] = item;
          }
        } else {
          resolvedUrls[item.fileId] = item;
        }
      }
      
      setUrls(resolvedUrls);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch thumbnail URLs");
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, fileIds]);

  useEffect(() => {
    if (autoFetch && conversationId && fileIds.length > 0) {
      void fetchUrls();
    }
  }, [autoFetch, conversationId, fileIds, fetchUrls]);

  return {
    urls,
    isLoading,
    error,
    refresh: fetchUrls,
  };
};

export default useBatchThumbnailUrl;
