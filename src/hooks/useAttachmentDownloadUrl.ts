import React from "react";
import type { Attachment } from "../types";
import { fileApi } from "../services/api";
import { unwrapApiSuccess } from "../lib/apiContract";
import { resolvePublicResourceUrl } from "../config";
import { useAuthStore } from "../stores/authStore";
import { registerStoreResetter } from "../stores/storeResetRegistry";
import { ExpiringLruCache } from "../utils/expiringLruCache";
import { createSingleFlight } from "../utils/singleFlight";

interface UseAttachmentDownloadUrlOptions {
  autoResolve?: boolean;
  /**
   * Keep transfer semantics explicit at every call site. The default remains
   * the original attachment download; inline consumers must opt into view or
   * image preview sources.
   */
  intent?: AttachmentUrlPurpose;
}

interface UseAttachmentDownloadUrlResult {
  url: string | undefined;
  isLoading: boolean;
  error: string | null;
  /**
   * `force` asks the server for a fresh descriptor for the current intent. Passing a
   * signal lets a modal cancel URL resolution together with the transfer.
   */
  resolveUrl: (force?: boolean, signal?: AbortSignal) => Promise<string | undefined>;
}

interface SignedUrlCacheEntry {
  url: string;
}

export type AttachmentUrlPurpose = "download" | "view" | "preview";

const SIGNED_URL_CACHE = new ExpiringLruCache<SignedUrlCacheEntry>({
  maxEntries: 300,
});
const CACHE_SKEW_MS = 30_000;
let signedUrlSingleFlight = createSingleFlight<string | undefined>();
let activeAccountScope: string | null = null;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const getPrimitiveField = (attachment: Attachment | undefined, field: string): string => {
  const value = (attachment as Record<string, unknown> | undefined)?.[field];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
};

const getAttachmentIdentity = (attachment: Attachment | undefined): string =>
  [attachment?.id, attachment?.objectKey].filter(isNonEmptyString).join("|");

/**
 * Cache signed resources per account, access context, source identity and
 * variant. The attachment payload does not yet carry a dedicated immutable source-version
 * field, so use every version/capability field currently carried by Attachment;
 * objectKey remains the stable fallback identity.
 */
export const buildAttachmentResolverCacheKey = ({
  accountId,
  conversationId,
  attachment,
  purpose,
  variant,
}: {
  accountId: string | undefined;
  conversationId: string | undefined;
  attachment: Attachment | undefined;
  purpose: AttachmentUrlPurpose;
  variant: string;
}): string => {
  const identity = getAttachmentIdentity(attachment);
  if (!identity || !conversationId) return "";

  const version = [
    "checksum",
    "contentVersion",
    "fileVersion",
    "objectVersion",
    "version",
    "updatedAt",
    "processedAt",
    "releaseStatus",
    "scanStatus",
    "canPreview",
    "canDownload",
    "fileSize",
    "mimeType",
  ]
    .map((field) => `${field}=${getPrimitiveField(attachment, field)}`)
    .join(";");

  return [
    "file-source-v2",
    accountId?.trim() || "anonymous",
    conversationId,
    purpose,
    variant,
    identity,
    version,
  ]
    .map(encodeURIComponent)
    .join(":");
};

export const clearAttachmentDownloadUrlCache = (): void => {
  SIGNED_URL_CACHE.clear();
  signedUrlSingleFlight = createSingleFlight<string | undefined>();
};

registerStoreResetter("attachment-download-url-cache", clearAttachmentDownloadUrlCache);

const ensureAccountScope = (accountId: string | undefined): void => {
  const nextScope = accountId?.trim() || "anonymous";
  if (activeAccountScope !== null && activeAccountScope !== nextScope) {
    clearAttachmentDownloadUrlCache();
  }
  activeAccountScope = nextScope;
};

/** Single-flight is intentionally keyed by the complete scoped resolver key. */
export const dedupeSignedUrlRequest = (
  cacheKey: string,
  fetcher: () => Promise<string | undefined>,
): Promise<string | undefined> => signedUrlSingleFlight(cacheKey, fetcher);

const parseExpiry = (expiresAt?: string): number => {
  if (!expiresAt) return Date.now();
  const parsed = Date.parse(expiresAt);
  return Number.isNaN(parsed) ? Date.now() : parsed;
};

const getAttachmentUrlPolicy = (intent: AttachmentUrlPurpose) => ({
  context:
    intent === "download"
      ? ("download" as const)
      : intent === "preview"
        ? ("image" as const)
        : ("media" as const),
  allowBlob: true,
  allowDataImage: intent === "preview",
});

const getIntentErrorMessage = (intent: AttachmentUrlPurpose): string => {
  if (intent === "preview") return "Không thể lấy liên kết xem ảnh.";
  if (intent === "view") return "Không thể lấy liên kết xem file.";
  return "Không thể lấy liên kết tải file.";
};

const getHttpStatus = (error: unknown): number | null => {
  const response = (error as { response?: { status?: unknown } } | null)?.response;
  return typeof response?.status === "number" ? response.status : null;
};

const getErrorCode = (error: unknown): string => {
  const record = error as { code?: unknown; response?: { data?: { code?: unknown } } } | null;
  const value = record?.response?.data?.code ?? record?.code;
  return typeof value === "string" ? value.toLowerCase() : "";
};

const isAbortError = (error: unknown): boolean =>
  (typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    error.name === "AbortError") ||
  getErrorCode(error) === "err_canceled" ||
  getErrorCode(error) === "canceled";

/** The auth client owns token refresh; retry URL issuance at most once after it. */
const shouldRetryAuthorization = (error: unknown): boolean => {
  const status = getHttpStatus(error);
  const code = getErrorCode(error);
  return (
    status === 401 ||
    code === "expiredtoken" ||
    code === "requestexpired" ||
    code === "authentication_expired"
  );
};

const linkAbortSignal = (controller: AbortController, signal?: AbortSignal): (() => void) => {
  if (!signal) return () => undefined;
  const abort = () => controller.abort();
  if (signal.aborted) {
    abort();
    return () => undefined;
  }
  signal.addEventListener("abort", abort, { once: true });
  return () => signal.removeEventListener("abort", abort);
};

async function requestAttachmentUrl({
  conversationId,
  attachment,
  intent,
  signal,
}: {
  conversationId: string;
  attachment: Attachment;
  intent: AttachmentUrlPurpose;
  signal: AbortSignal;
}): Promise<{ url: string; expiresAt: number }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      if (intent === "preview") {
        // A preview must never silently fall through to an original download.
        if (!isNonEmptyString(attachment.id)) {
          throw new Error("Preview source unavailable.");
        }
        const response = await fileApi.getPreviewUrl({
          conversationId,
          attachmentId: attachment.id,
          signal,
        });
        const payload = unwrapApiSuccess(response);
        const url = resolvePublicResourceUrl(
          payload.url,
          getAttachmentUrlPolicy(intent),
        );
        if (!url) throw new Error("Preview source unavailable.");
        return { url, expiresAt: parseExpiry(payload.expiresAt) };
      }

      const response = await fileApi.getDownloadUrl({
        conversationId,
        objectKey: isNonEmptyString(attachment.objectKey) ? attachment.objectKey : undefined,
        attachmentId: isNonEmptyString(attachment.id) ? attachment.id : undefined,
        ...(intent === "view" ? { mode: "view" as const } : {}),
        signal,
      });
      const payload = unwrapApiSuccess(response);
      const url = resolvePublicResourceUrl(
        payload.url,
        getAttachmentUrlPolicy(intent),
      );
      if (!url) throw new Error("Attachment URL unavailable.");
      return { url, expiresAt: parseExpiry(payload.expiresAt) };
    } catch (error) {
      if (
        signal.aborted ||
        isAbortError(error) ||
        attempt === 1 ||
        !shouldRetryAuthorization(error)
      ) {
        throw error;
      }
    }
  }
  throw new Error("Attachment URL unavailable.");
}

export const useAttachmentDownloadUrl = (
  conversationId: string | undefined,
  attachment: Attachment | undefined,
  options: UseAttachmentDownloadUrlOptions = {},
): UseAttachmentDownloadUrlResult => {
  const { autoResolve = false, intent = "download" } = options;
  const accountId = useAuthStore((state) => state.user?.id);
  const requestSeqRef = React.useRef(0);
  const abortRef = React.useRef<AbortController | null>(null);

  const cacheKey = React.useMemo(
    () =>
      buildAttachmentResolverCacheKey({
        accountId,
        conversationId,
        attachment,
        purpose: intent,
        variant:
          intent === "preview"
            ? "preview"
            : intent === "view"
              ? "original-view"
              : "original",
      }),
    [accountId, attachment, conversationId, intent],
  );
  const hasServerIdentity = Boolean(getAttachmentIdentity(attachment));
  const legacyUrl = React.useMemo(() => {
    if (hasServerIdentity) return undefined;
    const candidate =
      intent === "download"
        ? attachment?.downloadUrl ?? attachment?.url
        : intent === "preview"
          ? attachment?.thumbnailUrl ?? attachment?.url
          : attachment?.url ?? attachment?.downloadUrl;
    return isNonEmptyString(candidate)
      ? resolvePublicResourceUrl(candidate, getAttachmentUrlPolicy(intent)) ?? undefined
      : undefined;
  }, [attachment, hasServerIdentity, intent]);

  const [url, setUrl] = React.useState<string | undefined>(() => {
    const cached = cacheKey ? SIGNED_URL_CACHE.get(cacheKey, CACHE_SKEW_MS) : undefined;
    return cached?.url ?? legacyUrl;
  });
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    ensureAccountScope(accountId);
  }, [accountId]);

  React.useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const cached = cacheKey ? SIGNED_URL_CACHE.get(cacheKey, CACHE_SKEW_MS) : undefined;
    setUrl(cached?.url ?? legacyUrl);
    setError(null);
    setIsLoading(false);
  }, [cacheKey, legacyUrl]);

  React.useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const resolveUrl = React.useCallback(
    async (force = false, signal?: AbortSignal): Promise<string | undefined> => {
      if (!attachment || !conversationId) {
        setUrl(legacyUrl);
        return legacyUrl;
      }

      if (!hasServerIdentity) {
        setUrl(legacyUrl);
        setError(null);
        return legacyUrl;
      }

      const cached = !force && cacheKey ? SIGNED_URL_CACHE.get(cacheKey, CACHE_SKEW_MS) : undefined;
      if (cached) {
        setUrl(cached.url);
        setError(null);
        return cached.url;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const unlinkAbort = linkAbortSignal(controller, signal);
      const requestSeq = ++requestSeqRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const flightKey = force ? "" : cacheKey;
        const signedUrl = await dedupeSignedUrlRequest(flightKey, async () => {
          const issued = await requestAttachmentUrl({
            conversationId,
            attachment,
            intent,
            signal: controller.signal,
          });
          if (cacheKey) {
            SIGNED_URL_CACHE.set(cacheKey, { url: issued.url }, issued.expiresAt);
          }
          return issued.url;
        });

        if (controller.signal.aborted || requestSeq !== requestSeqRef.current) return undefined;
        setUrl(signedUrl);
        setError(null);
        return signedUrl;
      } catch (requestError) {
        if (controller.signal.aborted || isAbortError(requestError) || requestSeq !== requestSeqRef.current) {
          return undefined;
        }
        setError(getIntentErrorMessage(intent));
        // Never fall back to a stale attachment URL after an authorized request failed.
        setUrl(undefined);
        return undefined;
      } finally {
        unlinkAbort();
        if (abortRef.current === controller) abortRef.current = null;
        if (requestSeq === requestSeqRef.current) setIsLoading(false);
      }
    },
    [attachment, cacheKey, conversationId, hasServerIdentity, intent, legacyUrl],
  );

  React.useEffect(() => {
    if (autoResolve) void resolveUrl();
  }, [autoResolve, cacheKey, resolveUrl]);

  return { url, isLoading, error, resolveUrl };
};

export default useAttachmentDownloadUrl;
