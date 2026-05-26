/**
 * Phase 02: Hook for fetching preview URL for lightbox/modal display.
 * Uses the preview-url API to get preview variant or fall back to original.
 */

import React, { useCallback, useEffect, useState } from "react";
import { fileApi } from "../services/api";
import { unwrapApiSuccess } from "../lib/apiContract";
import { resolvePublicResourceUrl } from "../config";
import { ExpiringLruCache } from "../utils/expiringLruCache";

export interface UsePreviewUrlResult {
  url: string | null;
  variant: 'preview' | 'original' | null;
  isLoading: boolean;
  error: string | null;
  fetchUrl: () => Promise<string | null>;
}

interface SignedUrlCacheEntry {
  url: string;
  variant: 'preview' | 'original';
}

const PREVIEW_URL_CACHE = new ExpiringLruCache<SignedUrlCacheEntry>({
  maxEntries: 200,
});

const CACHE_SKEW_MS = 30_000;

const parseExpiry = (expiresAt?: string): number => {
  if (!expiresAt) return Date.now();
  const parsed = Date.parse(expiresAt);
  return Number.isNaN(parsed) ? Date.now() : parsed;
};

export const usePreviewUrl = (
  conversationId: string | undefined,
  attachmentId: string,
  options: { autoFetch?: boolean } = {},
): UsePreviewUrlResult => {
  const { autoFetch = false } = options;

  const [url, setUrl] = useState<string | null>(null);
  const [variant, setVariant] = useState<'preview' | 'original' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUrl = useCallback(async (): Promise<string | null> => {
    if (!conversationId || !attachmentId) {
      setUrl(null);
      setVariant(null);
      return null;
    }

    // Check cache first
    const cacheKey = `${conversationId}:preview:${attachmentId}`;
    const cached = PREVIEW_URL_CACHE.get(cacheKey, CACHE_SKEW_MS);
    if (cached) {
      setUrl(cached.url);
      setVariant(cached.variant);
      setError(null);
      return cached.url;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fileApi.getPreviewUrl({
        conversationId,
        attachmentId,
      });

      const payload = unwrapApiSuccess(response);

      const resolvedUrl = resolvePublicResourceUrl(payload.url, {
        context: 'image',
        allowBlob: true,
      });

      if (resolvedUrl) {
        const expiresAtMs = parseExpiry(payload.expiresAt);
        PREVIEW_URL_CACHE.set(cacheKey, { url: resolvedUrl, variant: payload.variant }, expiresAtMs);

        setUrl(resolvedUrl);
        setVariant(payload.variant);
        return resolvedUrl;
      } else {
        setUrl(null);
        setVariant(null);
        return null;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch preview URL";
      setError(errorMessage);
      setUrl(null);
      setVariant(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, attachmentId]);

  useEffect(() => {
    if (autoFetch && conversationId && attachmentId) {
      void fetchUrl();
    }
  }, [autoFetch, conversationId, attachmentId, fetchUrl]);

  return {
    url,
    variant,
    isLoading,
    error,
    fetchUrl,
  };
};

export default usePreviewUrl;
