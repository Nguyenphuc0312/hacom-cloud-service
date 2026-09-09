/**
 * Modal file-preview state and authenticated view-source resolver.
 *
 * View sources are intentionally distinct from original-download sources. A
 * signed URL is cached only inside the current account/context/version/variant
 * boundary and is discarded when that boundary changes.
 */
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { Attachment } from "../types";
import type { PreviewType } from "../utils/mimeRegistry";
import { fileApi } from "../services/api";
import { unwrapApiSuccess } from "../lib/apiContract";
import { resolvePublicResourceUrl } from "../config";
import { useAuthStore } from "../stores/authStore";
import { registerStoreResetter } from "../stores/storeResetRegistry";
import { ExpiringLruCache } from "../utils/expiringLruCache";
import { createSingleFlight } from "../utils/singleFlight";
import { buildAttachmentResolverCacheKey } from "./useAttachmentDownloadUrl";
import { recordFileViewerLifecycle } from "../utils/fileViewerLifecycleTelemetry";

interface CacheEntry {
  url: string;
  variant: "preview" | "original";
}

const URL_CACHE = new ExpiringLruCache<CacheEntry>({ maxEntries: 120 });
const CACHE_MARGIN_MS = 30_000;
let previewUrlSingleFlight = createSingleFlight<CacheEntry>();
let activeAccountScope: string | null = null;

export const clearPreviewUrlCache = (): void => {
  URL_CACHE.clear();
  previewUrlSingleFlight = createSingleFlight<CacheEntry>();
};

registerStoreResetter("file-preview-url-cache", clearPreviewUrlCache);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const hasServerIdentity = (attachment: Attachment | undefined): boolean =>
  Boolean(attachment?.id || attachment?.objectKey);

const isOfficePreviewType = (previewType: PreviewType): boolean =>
  previewType === "document" ||
  previewType === "spreadsheet" ||
  previewType === "presentation";

const getPreviewUrlPolicy = (previewType: PreviewType) => ({
  context: previewType === "image" ? ("image" as const) : ("media" as const),
  allowBlob: true,
  allowDataImage: false,
});

const parseExpiry = (expiresAt?: string): number => {
  if (!expiresAt) return Date.now();
  const parsed = Date.parse(expiresAt);
  return Number.isNaN(parsed) ? Date.now() : parsed;
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
  (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") ||
  getErrorCode(error) === "err_canceled" ||
  getErrorCode(error) === "canceled";

/** API auth refresh is centralised; repeat signed-source issuance no more than once. */
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

const ensureAccountScope = (accountId: string | undefined): void => {
  const nextScope = accountId?.trim() || "anonymous";
  if (activeAccountScope !== null && activeAccountScope !== nextScope) {
    clearPreviewUrlCache();
  }
  activeAccountScope = nextScope;
};

const resolveLegacySource = (attachment: Attachment, previewType: PreviewType): string | null => {
  if (hasServerIdentity(attachment)) return null;
  const candidate = attachment.url ?? attachment.downloadUrl;
  return isNonEmptyString(candidate)
    ? resolvePublicResourceUrl(candidate, getPreviewUrlPolicy(previewType)) ?? null
    : null;
};

async function requestViewSource({
  conversationId,
  attachment,
  previewType,
  signal,
}: {
  conversationId: string;
  attachment: Attachment;
  previewType: PreviewType;
  signal: AbortSignal;
}): Promise<{ entry: CacheEntry; expiresAt: number }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      if (previewType === "image" && isNonEmptyString(attachment.id)) {
        const response = await fileApi.getPreviewUrl({
          conversationId,
          attachmentId: attachment.id,
          signal,
        });
        const payload = unwrapApiSuccess(response);
        const url = resolvePublicResourceUrl(payload.url, getPreviewUrlPolicy(previewType));
        if (!url) throw new Error("Không nhận được liên kết xem ảnh an toàn.");
        return {
          entry: { url, variant: payload.variant === "preview" ? "preview" : "original" },
          expiresAt: parseExpiry(payload.expiresAt),
        };
      }

      const response = await fileApi.getDownloadUrl({
        conversationId,
        objectKey: isNonEmptyString(attachment.objectKey) ? attachment.objectKey : undefined,
        attachmentId: isNonEmptyString(attachment.id) ? attachment.id : undefined,
        mode: "view",
        signal,
      });
      const payload = unwrapApiSuccess(response);
      const url = resolvePublicResourceUrl(payload.url, getPreviewUrlPolicy(previewType));
      if (!url) throw new Error("Không nhận được liên kết xem file an toàn.");
      return { entry: { url, variant: "original" }, expiresAt: parseExpiry(payload.expiresAt) };
    } catch (error) {
      if (signal.aborted || isAbortError(error) || attempt === 1 || !shouldRetryAuthorization(error)) {
        throw error;
      }
    }
  }
  throw new Error("Không nhận được liên kết xem file an toàn.");
}

export interface PreviewTarget {
  attachment: Attachment;
  conversationId: string;
  messageId?: string;
  previewType: PreviewType;
  uploaderName?: string | null;
  uploaderAvatarUrl?: string | null;
  createdAt?: string | Date | null;
}

export interface UseFilePreviewReturn {
  isOpen: boolean;
  current: PreviewTarget | null;
  currentIndex: number;
  totalItems: number;
  /** Authenticated source for an in-app renderer, never the original download URL. */
  secureUrl: string | null;
  isLoadingUrl: boolean;
  urlError: string | null;
  open: (target: PreviewTarget, gallery?: PreviewTarget[]) => void;
  close: () => void;
  prev: () => void;
  next: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  refreshUrl: () => Promise<void>;
}

export function useFilePreview(): UseFilePreviewReturn {
  const accountId = useAuthStore((state) => state.user?.id);
  const [isOpen, setIsOpen] = useState(false);
  const [gallery, setGallery] = useState<PreviewTarget[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [secureUrl, setSecureUrl] = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const requestSequenceRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const forcedRefreshKeyRef = useRef<string | null>(null);

  const current = isOpen ? gallery[currentIndex] ?? null : null;
  const sourceVariant = current?.previewType === "image" ? "image-preview" : "original-view";
  const sourcePurpose = current?.previewType === "image" ? "preview" : "view";
  const sourceKey = useMemo(
    () =>
      current
        ? buildAttachmentResolverCacheKey({
            accountId,
            conversationId: current.conversationId,
            attachment: current.attachment,
            purpose: sourcePurpose,
            variant: sourceVariant,
          })
        : "",
    [accountId, current, sourcePurpose, sourceVariant],
  );

  useEffect(() => {
    ensureAccountScope(accountId);
  }, [accountId]);

  useEffect(() => {
    const requestSequence = ++requestSequenceRef.current;
    abortRef.current?.abort();
    abortRef.current = null;

    if (!isOpen || !current) {
      setSecureUrl(null);
      setUrlError(null);
      setIsLoadingUrl(false);
      return;
    }

    if (current.attachment.canPreview === false) {
      setSecureUrl(null);
      setUrlError("Tệp chưa sẵn sàng để xem trước.");
      setIsLoadingUrl(false);
      recordFileViewerLifecycle("source_unavailable", current.previewType, {
        outcome: "blocked",
      });
      return;
    }

    // Office preview is deliberately an unsupported in-app state: do not issue
    // a signed URL merely to hand it to a public third-party viewer.
    if (isOfficePreviewType(current.previewType)) {
      setSecureUrl(null);
      setUrlError(null);
      setIsLoadingUrl(false);
      recordFileViewerLifecycle("source_ready", current.previewType, {
        source: "none",
        outcome: "success",
      });
      return;
    }

    const forceRefresh = forcedRefreshKeyRef.current === sourceKey;
    if (forceRefresh) forcedRefreshKeyRef.current = null;
    const cached = !forceRefresh && sourceKey ? URL_CACHE.get(sourceKey, CACHE_MARGIN_MS) : undefined;
    if (cached) {
      setSecureUrl(cached.url);
      setUrlError(null);
      setIsLoadingUrl(false);
      recordFileViewerLifecycle("source_ready", current.previewType, {
        source: "cache",
        outcome: "success",
      });
      return;
    }

    if (!hasServerIdentity(current.attachment)) {
      const legacyUrl = resolveLegacySource(current.attachment, current.previewType);
      setSecureUrl(legacyUrl);
      setUrlError(legacyUrl ? null : "File không có định danh để xin liên kết xem.");
      setIsLoadingUrl(false);
      recordFileViewerLifecycle(
        legacyUrl ? "source_ready" : "source_unavailable",
        current.previewType,
        {
          source: "legacy",
          outcome: legacyUrl ? "success" : "error",
        },
      );
      return;
    }

    if (!sourceKey) {
      setSecureUrl(null);
      setUrlError("Không thể xác định ngữ cảnh xem file.");
      setIsLoadingUrl(false);
      recordFileViewerLifecycle("source_unavailable", current.previewType, {
        source: "none",
        outcome: "error",
      });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setSecureUrl(null);
    setUrlError(null);
    setIsLoadingUrl(true);

    void (async () => {
      try {
        const entry = await previewUrlSingleFlight(sourceKey, async () => {
          const issued = await requestViewSource({
            conversationId: current.conversationId,
            attachment: current.attachment,
            previewType: current.previewType,
            signal: controller.signal,
          });
          URL_CACHE.set(sourceKey, issued.entry, issued.expiresAt);
          return issued.entry;
        });

        if (requestSequence !== requestSequenceRef.current || controller.signal.aborted) return;
        setSecureUrl(entry.url);
        setUrlError(null);
        recordFileViewerLifecycle("source_ready", current.previewType, {
          source: "network",
          outcome: "success",
        });
      } catch (error) {
        if (requestSequence !== requestSequenceRef.current || controller.signal.aborted || isAbortError(error)) {
          return;
        }
        setSecureUrl(null);
        setUrlError("Không thể lấy liên kết xem file.");
        recordFileViewerLifecycle("source_unavailable", current.previewType, {
          source: "network",
          outcome: "error",
        });
      } finally {
        if (requestSequence === requestSequenceRef.current && !controller.signal.aborted) {
          setIsLoadingUrl(false);
        }
      }
    })();

    return () => controller.abort();
  }, [current, isOpen, refreshNonce, sourceKey]);

  const open = useCallback((target: PreviewTarget, galleryItems?: PreviewTarget[]) => {
    if (target.attachment.canPreview === false) {
      setSecureUrl(null);
      setUrlError("Tệp chưa sẵn sàng để xem trước.");
      setIsLoadingUrl(false);
      setIsOpen(false);
      recordFileViewerLifecycle("open_blocked", target.previewType, {
        outcome: "blocked",
      });
      return;
    }
    recordFileViewerLifecycle("open_requested", target.previewType);
    const items = (galleryItems ?? [target]).filter((item) => item.attachment.canPreview !== false);
    const index = items.findIndex(
      (item) =>
        (target.attachment.id && item.attachment.id === target.attachment.id) ||
        (target.attachment.objectKey && item.attachment.objectKey === target.attachment.objectKey) ||
        (target.attachment.url && item.attachment.url === target.attachment.url),
    );
    setGallery(items);
    setSecureUrl(null);
    setUrlError(null);
    setCurrentIndex(index >= 0 ? index : 0);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    if (current) recordFileViewerLifecycle("closed", current.previewType);
    abortRef.current?.abort();
    abortRef.current = null;
    setIsOpen(false);
    setSecureUrl(null);
    setUrlError(null);
    setIsLoadingUrl(false);
  }, [current]);

  const prev = useCallback(() => setCurrentIndex((index) => Math.max(0, index - 1)), []);
  const next = useCallback(
    () => setCurrentIndex((index) => Math.min(gallery.length - 1, index + 1)),
    [gallery.length],
  );

  const refreshUrl = useCallback(async () => {
    if (!current || !sourceKey || isOfficePreviewType(current.previewType)) return;
    URL_CACHE.delete(sourceKey);
    forcedRefreshKeyRef.current = sourceKey;
    setRefreshNonce((nonce) => nonce + 1);
  }, [current, sourceKey]);

  return {
    isOpen,
    current,
    currentIndex,
    totalItems: gallery.length,
    secureUrl,
    isLoadingUrl,
    urlError,
    open,
    close,
    prev,
    next,
    hasPrev: currentIndex > 0,
    hasNext: currentIndex < gallery.length - 1,
    refreshUrl,
  };
}

export default useFilePreview;
