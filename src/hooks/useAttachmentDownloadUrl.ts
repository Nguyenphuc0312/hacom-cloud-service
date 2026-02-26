import React from "react";
import type { Attachment } from "../types";
import { fileApi } from "../services/api";
import { unwrapApiSuccess } from "../lib/apiContract";

interface UseAttachmentDownloadUrlOptions {
  autoResolve?: boolean;
}

interface UseAttachmentDownloadUrlResult {
  url: string | undefined;
  isLoading: boolean;
  error: string | null;
  resolveUrl: (force?: boolean) => Promise<string | undefined>;
}

interface SignedUrlCacheEntry {
  url: string;
  expiresAtMs: number;
}

const SIGNED_URL_CACHE = new Map<string, SignedUrlCacheEntry>();
const CACHE_SKEW_MS = 30_000;

const parseExpiry = (expiresAt?: string): number => {
  if (!expiresAt) return Date.now();
  const parsed = Date.parse(expiresAt);
  return Number.isNaN(parsed) ? Date.now() : parsed;
};

const isCacheValid = (entry?: SignedUrlCacheEntry): boolean =>
  Boolean(entry && entry.expiresAtMs - Date.now() > CACHE_SKEW_MS);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const useAttachmentDownloadUrl = (
  conversationId: string | undefined,
  attachment: Attachment | undefined,
  options: UseAttachmentDownloadUrlOptions = {},
): UseAttachmentDownloadUrlResult => {
  const { autoResolve = false } = options;

  const cacheKey = React.useMemo(() => {
    const attachmentId = attachment?.id || attachment?.objectKey || attachment?.url;
    if (!conversationId || !attachmentId) return "";
    return `${conversationId}:${attachmentId}`;
  }, [attachment?.id, attachment?.objectKey, attachment?.url, conversationId]);

  const fallbackUrl = React.useMemo(() => {
    if (isNonEmptyString(attachment?.downloadUrl)) return attachment.downloadUrl;
    if (isNonEmptyString(attachment?.url)) return attachment.url;
    return undefined;
  }, [attachment?.downloadUrl, attachment?.url]);

  const [url, setUrl] = React.useState<string | undefined>(() => {
    const cached = SIGNED_URL_CACHE.get(cacheKey);
    if (isCacheValid(cached)) return cached?.url;
    return fallbackUrl;
  });
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const resolveUrl = React.useCallback(
    async (force = false): Promise<string | undefined> => {
      if (!attachment || !conversationId) {
        setUrl(fallbackUrl);
        return fallbackUrl;
      }

      if (isNonEmptyString(attachment.downloadUrl) && !force) {
        const expiresAtMs = parseExpiry(attachment.expiresAt);
        if (expiresAtMs - Date.now() > CACHE_SKEW_MS) {
          const directUrl = attachment.downloadUrl;
          if (cacheKey) {
            SIGNED_URL_CACHE.set(cacheKey, { url: directUrl, expiresAtMs });
          }
          setUrl(directUrl);
          setError(null);
          return directUrl;
        }
      }

      const cached = cacheKey ? SIGNED_URL_CACHE.get(cacheKey) : undefined;
      if (!force && isCacheValid(cached)) {
        setUrl(cached?.url);
        setError(null);
        return cached?.url;
      }

      const hasDownloadIdentity = isNonEmptyString(attachment.objectKey) || isNonEmptyString(attachment.id);
      if (!hasDownloadIdentity) {
        setUrl(fallbackUrl);
        return fallbackUrl;
      }

      setIsLoading(true);
      try {
        const response = await fileApi.getDownloadUrl({
          conversationId,
          objectKey: isNonEmptyString(attachment.objectKey) ? attachment.objectKey : undefined,
          attachmentId: isNonEmptyString(attachment.id) ? attachment.id : undefined,
        });
        const payload = unwrapApiSuccess(response);
        const signedUrl = payload.url;
        const expiresAtMs = parseExpiry(payload.expiresAt);

        if (cacheKey) {
          SIGNED_URL_CACHE.set(cacheKey, { url: signedUrl, expiresAtMs });
        }

        setUrl(signedUrl);
        setError(null);
        return signedUrl;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to resolve download URL");
        setUrl(fallbackUrl);
        return fallbackUrl;
      } finally {
        setIsLoading(false);
      }
    },
    [
      attachment,
      cacheKey,
      conversationId,
      fallbackUrl,
    ],
  );

  React.useEffect(() => {
    setError(null);
    const cached = SIGNED_URL_CACHE.get(cacheKey);
    if (isCacheValid(cached)) {
      setUrl(cached?.url);
      return;
    }

    setUrl(fallbackUrl);
    if (autoResolve) {
      void resolveUrl();
    }
  }, [autoResolve, cacheKey, fallbackUrl, resolveUrl]);

  return {
    url,
    isLoading,
    error,
    resolveUrl,
  };
};

export default useAttachmentDownloadUrl;
