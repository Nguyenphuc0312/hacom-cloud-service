/**
 * @fileoverview useFilePreview — manages the file preview modal state.
 *
 * Tracks the list of previewable attachments in the current conversation,
 * the currently selected index, and secure URL resolution.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import type { Attachment } from "../types";
import type { PreviewType } from "../utils/mimeRegistry";
import { fileApi } from "../services/api";
import { unwrapApiSuccess } from "../lib/apiContract";
import { resolvePublicResourceUrl } from "../config";
import { ExpiringLruCache } from "../utils/expiringLruCache";

// ── Signed-URL cache (shared across hook instances) ──────────────────

interface CacheEntry {
  url: string;
}

const URL_CACHE = new ExpiringLruCache<CacheEntry>({
  maxEntries: 120,
});
const CACHE_MARGIN_MS = 30_000;

export const clearPreviewUrlCache = (): void => {
  URL_CACHE.clear();
};

const getPreviewUrlPolicy = (attachment: Attachment, previewType: PreviewType) => ({
  context: previewType === "image" ? ("image" as const) : ("media" as const),
  allowBlob: true,
  allowDataImage:
    previewType === "image" &&
    attachment.mimeType?.toLowerCase().startsWith("image/") === true,
});

const cacheKey = (conversationId: string, att: Attachment): string => {
  const id = att.id || att.objectKey || att.url || "";
  return `preview:${conversationId}:${id}`;
};

const getCached = (key: string): string | null => {
  const entry = URL_CACHE.get(key, CACHE_MARGIN_MS);
  if (!entry) return null;
  return entry.url;
};

// ── Public types ─────────────────────────────────────────────────────

export interface PreviewTarget {
  attachment: Attachment;
  conversationId: string;
  messageId?: string;
  previewType: PreviewType;
  uploaderName?: string | null;
  uploaderAvatarUrl?: string | null;
}

export interface UseFilePreviewReturn {
  /** Whether the preview modal is open */
  isOpen: boolean;
  /** Currently active preview target */
  current: PreviewTarget | null;
  /** Index of the current item in the gallery list */
  currentIndex: number;
  /** Total previewable items */
  totalItems: number;
  /** Resolved secure URL for current target */
  secureUrl: string | null;
  /** Whether the secure URL is being fetched */
  isLoadingUrl: boolean;
  /** Error message if URL resolution fails */
  urlError: string | null;
  /** Open the preview modal for a specific attachment */
  open: (target: PreviewTarget, gallery?: PreviewTarget[]) => void;
  /** Close the preview modal */
  close: () => void;
  /** Navigate to previous item */
  prev: () => void;
  /** Navigate to next item */
  next: () => void;
  /** Whether there is a previous item */
  hasPrev: boolean;
  /** Whether there is a next item */
  hasNext: boolean;
  /** Force-refresh the secure URL (e.g. on 403 or error) */
  refreshUrl: () => Promise<void>;
}

// ── Hook implementation ──────────────────────────────────────────────

export function useFilePreview(): UseFilePreviewReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [gallery, setGallery] = useState<PreviewTarget[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [secureUrl, setSecureUrl] = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const reqSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const current = isOpen ? gallery[currentIndex] ?? null : null;

  useEffect(() => {
    const seq = ++reqSeqRef.current;

    // Abort previous in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    if (!isOpen || !current) {
      setSecureUrl(null);
      setUrlError(null);
      setIsLoadingUrl(false);
      return;
    }

    const key = cacheKey(current.conversationId, current.attachment);

    // 1. Check cache (unless this run was triggered by refreshUrl)
    const isForcedRefresh = refreshNonce > 0;
    if (!isForcedRefresh) {
      const cached = getCached(key);
      if (cached) {
        setSecureUrl(cached);
        setUrlError(null);
        setIsLoadingUrl(false);
        return;
      }

      // Try attachment's own downloadUrl if not expired
      if (current.attachment.downloadUrl) {
        const expiresAtMs = current.attachment.expiresAt
          ? Date.parse(current.attachment.expiresAt)
          : 0;
        if (expiresAtMs - Date.now() > CACHE_MARGIN_MS) {
          const resolvedDownloadUrl = resolvePublicResourceUrl(
            current.attachment.downloadUrl,
            getPreviewUrlPolicy(current.attachment, current.previewType),
          );
          if (resolvedDownloadUrl) {
            URL_CACHE.set(key, { url: resolvedDownloadUrl }, expiresAtMs);
            setSecureUrl(resolvedDownloadUrl);
            setUrlError(null);
            setIsLoadingUrl(false);
            return;
          }
        }
      }
    }

    // 2. Fallback if no identity
    const hasIdentity = current.attachment.objectKey || current.attachment.id;
    if (!hasIdentity) {
      const fallbackUrl =
        resolvePublicResourceUrl(
          current.attachment.url,
          getPreviewUrlPolicy(current.attachment, current.previewType),
        ) ?? null;
      setSecureUrl(fallbackUrl);
      setUrlError(null);
      setIsLoadingUrl(false);
      return;
    }

    // 3. Needs API fetch
    setSecureUrl(null);
    setUrlError(null);
    setIsLoadingUrl(true);

    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      try {
        const response = await fileApi.getDownloadUrl({
          conversationId: current.conversationId,
          objectKey: current.attachment.objectKey || undefined,
          attachmentId: current.attachment.id || undefined,
          mode: "view",
          signal: controller.signal,
        });

        if (reqSeqRef.current !== seq || controller.signal.aborted) {
          return;
        }

        const payload = unwrapApiSuccess(response);
        const expiresAtMs = payload.expiresAt
          ? Date.parse(payload.expiresAt)
          : Date.now() + 5 * 60 * 1000;

        const signedUrl = resolvePublicResourceUrl(payload.url, {
          context: current.previewType === "image" ? "image" : "media",
          allowBlob: true,
        });

        const finalUrl =
          signedUrl ||
          (resolvePublicResourceUrl(
            current.attachment.url,
            getPreviewUrlPolicy(current.attachment, current.previewType),
          ) ?? null);

        if (signedUrl) {
          URL_CACHE.set(key, { url: signedUrl }, expiresAtMs);
        }

        if (reqSeqRef.current === seq && !controller.signal.aborted) {
          setSecureUrl(finalUrl);
          setUrlError(null);
          setIsLoadingUrl(false);
        }
      } catch (err) {
        if (reqSeqRef.current !== seq || controller.signal.aborted) {
          return;
        }

        const fallbackUrl =
          resolvePublicResourceUrl(
            current.attachment.url,
            getPreviewUrlPolicy(current.attachment, current.previewType),
          ) ?? null;

        setUrlError(
          err instanceof Error ? err.message : "Failed to load preview URL",
        );
        setSecureUrl(fallbackUrl);
        setIsLoadingUrl(false);
      } finally {
        if (reqSeqRef.current === seq && !controller.signal.aborted) {
          setIsLoadingUrl(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [isOpen, current, refreshNonce]);

  // ── Actions ────────────────────────────────────────────────────────

  const open = useCallback(
    (target: PreviewTarget, galleryItems?: PreviewTarget[]) => {
      const items = galleryItems ?? [target];
      setGallery(items);
      const idx = items.findIndex(
        (it) =>
          (target.attachment.id && it.attachment.id === target.attachment.id) ||
          (target.attachment.objectKey &&
            it.attachment.objectKey === target.attachment.objectKey) ||
          (target.attachment.url && it.attachment.url === target.attachment.url),
      );
      setSecureUrl(null);
      setUrlError(null);
      setCurrentIndex(idx >= 0 ? idx : 0);
      setIsOpen(true);
    },
    [],
  );

  const close = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsOpen(false);
    setSecureUrl(null);
    setUrlError(null);
    setIsLoadingUrl(false);
  }, []);

  const prev = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);

  const next = useCallback(() => {
    setCurrentIndex((i) => Math.min(gallery.length - 1, i + 1));
  }, [gallery.length]);

  const refreshUrl = useCallback(async () => {
    if (!current) return;
    const key = cacheKey(current.conversationId, current.attachment);
    URL_CACHE.delete(key);
    setRefreshNonce((n) => n + 1);
  }, [current]);

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
