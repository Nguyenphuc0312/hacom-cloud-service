import React from "react";
import type { Attachment } from "../types";
import { fileApi } from "../services/api";
import { unwrapApiSuccess } from "../lib/apiContract";
import { resolvePublicResourceUrl } from "../config";
import { ExpiringLruCache } from "../utils/expiringLruCache";

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
}

const SIGNED_URL_CACHE = new ExpiringLruCache<SignedUrlCacheEntry>({
  maxEntries: 300,
});
const CACHE_SKEW_MS = 30_000;

/**
 * In-flight single-flight map keyed by cacheKey (`conversationId:attachmentId`).
 * When the same attachment is rendered in several places at once (e.g. a file
 * shown in the timeline and the shared-resources panel), all of them share a
 * single signed-URL request instead of each firing their own.
 */
const inFlightSignedUrlRequests = new Map<string, Promise<string | undefined>>();

export const dedupeSignedUrlRequest = (
  cacheKey: string,
  fetcher: () => Promise<string | undefined>,
): Promise<string | undefined> => {
  if (!cacheKey) {
    // No stable identity → cannot safely dedupe; just run it.
    return fetcher();
  }

  const existing = inFlightSignedUrlRequests.get(cacheKey);
  if (existing) {
    return existing;
  }

  const request = fetcher();
  inFlightSignedUrlRequests.set(cacheKey, request);
  const cleanup = () => {
    // Only clear if we're still the active request for this key (avoid races
    // where a newer request replaced ours).
    if (inFlightSignedUrlRequests.get(cacheKey) === request) {
      inFlightSignedUrlRequests.delete(cacheKey);
    }
  };
  // Settle (resolve or reject) clears the slot; both branches are handled so a
  // rejected request never surfaces as an unhandled rejection here. The actual
  // caller still awaits `request` and handles the error in its own try/catch.
  request.then(cleanup, cleanup);
  return request;
};

const parseExpiry = (expiresAt?: string): number => {
  if (!expiresAt) return Date.now();
  const parsed = Date.parse(expiresAt);
  return Number.isNaN(parsed) ? Date.now() : parsed;
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const getAttachmentUrlPolicy = (attachment: Attachment | undefined) => {
  const isImage = attachment?.mimeType?.toLowerCase().startsWith("image/");
  return {
    context: isImage ? ("image" as const) : ("download" as const),
    allowBlob: true,
    allowDataImage: Boolean(isImage),
  };
};

export const useAttachmentDownloadUrl = (
  conversationId: string | undefined,
  attachment: Attachment | undefined,
  options: UseAttachmentDownloadUrlOptions = {},
): UseAttachmentDownloadUrlResult => {
  const { autoResolve = false } = options;

  const cacheKey = React.useMemo(() => {
    const attachmentId =
      attachment?.id || attachment?.objectKey || attachment?.url;
    if (!conversationId || !attachmentId) return "";
    return `${conversationId}:${attachmentId}`;
  }, [attachment?.id, attachment?.objectKey, attachment?.url, conversationId]);

  const fallbackUrl = React.useMemo(() => {
    const urlPolicy = getAttachmentUrlPolicy(attachment);
    if (isNonEmptyString(attachment?.downloadUrl)) {
      return resolvePublicResourceUrl(attachment.downloadUrl, urlPolicy);
    }
    if (isNonEmptyString(attachment?.url)) {
      return resolvePublicResourceUrl(attachment.url, urlPolicy);
    }
    return undefined;
  }, [attachment]);

  const [url, setUrl] = React.useState<string | undefined>(() => {
    const cached = cacheKey
      ? SIGNED_URL_CACHE.get(cacheKey, CACHE_SKEW_MS)
      : undefined;
    if (cached) return cached.url;
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
          const directUrl = resolvePublicResourceUrl(
            attachment.downloadUrl,
            getAttachmentUrlPolicy(attachment),
          );
          if (!directUrl) {
            setUrl(fallbackUrl);
            return fallbackUrl;
          }
          if (cacheKey) {
            SIGNED_URL_CACHE.set(cacheKey, { url: directUrl }, expiresAtMs);
          }
          setUrl(directUrl);
          setError(null);
          return directUrl;
        }
      }

      const cached =
        !force && cacheKey
          ? SIGNED_URL_CACHE.get(cacheKey, CACHE_SKEW_MS)
          : undefined;
      if (cached) {
        setUrl(cached.url);
        setError(null);
        return cached.url;
      }

      const hasDownloadIdentity =
        isNonEmptyString(attachment.objectKey) ||
        isNonEmptyString(attachment.id);
      if (!hasDownloadIdentity) {
        setUrl(fallbackUrl);
        return fallbackUrl;
      }

      setIsLoading(true);
      try {
        const signedUrl = await dedupeSignedUrlRequest(cacheKey, async () => {
          const response = await fileApi.getDownloadUrl({
            conversationId,
            objectKey: isNonEmptyString(attachment.objectKey)
              ? attachment.objectKey
              : undefined,
            attachmentId: isNonEmptyString(attachment.id)
              ? attachment.id
              : undefined,
          });
          const payload = unwrapApiSuccess(response);
          const resolved = resolvePublicResourceUrl(payload.url, {
            context: "download",
            allowBlob: true,
          });
          if (!resolved) {
            return undefined;
          }
          const expiresAtMs = parseExpiry(payload.expiresAt);
          if (cacheKey) {
            SIGNED_URL_CACHE.set(cacheKey, { url: resolved }, expiresAtMs);
          }
          return resolved;
        });
        if (!signedUrl) {
          setUrl(fallbackUrl);
          return fallbackUrl;
        }

        setUrl(signedUrl);
        setError(null);
        return signedUrl;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to resolve download URL",
        );
        setUrl(fallbackUrl);
        return fallbackUrl;
      } finally {
        setIsLoading(false);
      }
    },
    [attachment, cacheKey, conversationId, fallbackUrl],
  );

  const [prevCacheKey, setPrevCacheKey] = React.useState(cacheKey);

  if (cacheKey !== prevCacheKey) {
    setPrevCacheKey(cacheKey);
    setError(null);
    const cached = cacheKey
      ? SIGNED_URL_CACHE.get(cacheKey, CACHE_SKEW_MS)
      : undefined;
    if (cached) {
      setUrl(cached.url);
    } else {
      setUrl(fallbackUrl);
    }
  }

  React.useEffect(() => {
    if (autoResolve) {
      void resolveUrl();
    }
  }, [autoResolve, cacheKey, resolveUrl]);

  return {
    url,
    isLoading,
    error,
    resolveUrl,
  };
};

export default useAttachmentDownloadUrl;
