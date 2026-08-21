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
  /** Force-refresh the secure URL (e.g. on 403) */
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
  const abortRef = useRef<AbortController | null>(null);

  const current = gallery[currentIndex] ?? null;

  // ─ Resolve secure URL for a given target ─

  const resolveUrl = useCallback(
    async (target: PreviewTarget, force = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const key = cacheKey(target.conversationId, target.attachment);

      // Check cache first
      if (!force) {
        const cached = getCached(key);
        if (cached) {
          setSecureUrl(cached);
          setUrlError(null);
          return;
        }

        // Try attachment's own downloadUrl
        if (target.attachment.downloadUrl) {
          const expiresAtMs = target.attachment.expiresAt
            ? Date.parse(target.attachment.expiresAt)
            : 0;
          if (expiresAtMs - Date.now() > CACHE_MARGIN_MS) {
            const resolvedDownloadUrl = resolvePublicResourceUrl(
              target.attachment.downloadUrl,
              getPreviewUrlPolicy(target.attachment, target.previewType),
            );
            if (resolvedDownloadUrl) {
              URL_CACHE.set(key, { url: resolvedDownloadUrl }, expiresAtMs);
              setSecureUrl(resolvedDownloadUrl);
              setUrlError(null);
              return;
            }
          }
        }
      }

      // No valid cached/inline URL – fetch from API
      const hasIdentity = target.attachment.objectKey || target.attachment.id;
      if (!hasIdentity) {
        // Fallback: use raw url if available
        setSecureUrl(
          resolvePublicResourceUrl(
            target.attachment.url,
            getPreviewUrlPolicy(target.attachment, target.previewType),
          ) ?? null,
        );
        return;
      }

      setIsLoadingUrl(true);
      setUrlError(null);

      try {
        const response = await fileApi.getDownloadUrl({
          conversationId: target.conversationId,
          objectKey: target.attachment.objectKey || undefined,
          attachmentId: target.attachment.id || undefined,
          // Đây là luồng XEM: xin URL hạn dài để trình xem nhúng không chết
          // giữa chừng khi người dùng đọc tài liệu lâu.
          mode: "view",
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        const payload = unwrapApiSuccess(response);
        const expiresAtMs = payload.expiresAt
          ? Date.parse(payload.expiresAt)
          : Date.now() + 5 * 60 * 1000;

        const signedUrl = resolvePublicResourceUrl(payload.url, {
          context: target.previewType === "image" ? "image" : "media",
          allowBlob: true,
        });
        if (!signedUrl) {
          setSecureUrl(
            resolvePublicResourceUrl(
              target.attachment.url,
              getPreviewUrlPolicy(target.attachment, target.previewType),
            ) ?? null,
          );
          return;
        }

        URL_CACHE.set(key, { url: signedUrl }, expiresAtMs);
        setSecureUrl(signedUrl);
      } catch (err) {
        if (controller.signal.aborted) return;
        setUrlError(
          err instanceof Error ? err.message : "Failed to load preview URL",
        );
        // Fallback to raw URL
        setSecureUrl(
          resolvePublicResourceUrl(
            target.attachment.url,
            getPreviewUrlPolicy(target.attachment, target.previewType),
          ) ?? null,
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingUrl(false);
        }
      }
    },
    [],
  );

  // Whenever current target changes, resolve its URL
  const [prevCurrent, setPrevCurrent] = useState(current);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  if (current !== prevCurrent || isOpen !== prevIsOpen) {
    setPrevCurrent(current);
    setPrevIsOpen(isOpen);
    setSecureUrl(null);
    setUrlError(null);
    if (isOpen && current) {
      setIsLoadingUrl(true);
    } else {
      setIsLoadingUrl(false);
    }
  }

  useEffect(() => {
    if (isOpen && current) {
      void resolveUrl(current);
    }

    return () => {
      abortRef.current?.abort();
    };
  }, [isOpen, current, resolveUrl]);

  // ─ Actions ─

  const open = useCallback(
    (target: PreviewTarget, galleryItems?: PreviewTarget[]) => {
      const items = galleryItems ?? [target];
      setGallery(items);
      const idx = items.findIndex(
        (it) =>
          it.attachment.id === target.attachment.id &&
          it.attachment.objectKey === target.attachment.objectKey,
      );
      setSecureUrl(null);
      setUrlError(null);
      setIsLoadingUrl(true);
      setCurrentIndex(idx >= 0 ? idx : 0);
      setIsOpen(true);
    },
    [],
  );

  const close = useCallback(() => {
    abortRef.current?.abort();
    setIsOpen(false);
    setSecureUrl(null);
    setUrlError(null);
    setIsLoadingUrl(false);
  }, []);

  const prev = useCallback(() => {
    setSecureUrl(null);
    setUrlError(null);
    setIsLoadingUrl(true);
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);

  const next = useCallback(() => {
    setSecureUrl(null);
    setUrlError(null);
    setIsLoadingUrl(true);
    setCurrentIndex((i) => Math.min(gallery.length - 1, i + 1));
  }, [gallery.length]);

  const refreshUrl = useCallback(async () => {
    if (!current) return;
    await resolveUrl(current, true);
  }, [current, resolveUrl]);


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
