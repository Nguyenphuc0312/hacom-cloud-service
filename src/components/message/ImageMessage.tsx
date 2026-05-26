/**
 * @fileoverview ImageMessage - Redesigned inline image message with Phase 02 thumbnail support.
 *
 * Features:
 * - Phase 02: Timeline uses thumbnail (from batch-thumbnail-urls)
 * - Phase 02: Lightbox uses preview (from preview-url)
 * - Phase 02: Download uses original (from download-url)
 * - HD badge for large images
 * - Lazy loading with viewport detection
 * - Graceful PENDING status handling
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { PhotoIcon, ArrowDownTrayIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import type { Attachment } from "../../types";
import { useBatchThumbnailUrl, usePreviewUrl } from "../../hooks";
import { useInViewport } from "../../hooks/useInViewport";
import { Skeleton } from "../ui";

interface ImageMessageProps {
  conversationId: string;
  attachment: Attachment;
  caption?: string;
  isOwn: boolean;
  onClick?: (imageUrl: string) => void;
  /** Upload progress (0-100) */
  uploadProgress?: number;
  className?: string;
}

const HD_THRESHOLD = 10 * 1024 * 1024; // 10MB

export const ImageMessage: React.FC<ImageMessageProps> = ({
  conversationId,
  attachment,
  caption,
  isOwn,
  onClick,
  uploadProgress,
  className,
}) => {
  const { t } = useTranslation();
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [showFullScreen, setShowFullScreen] = useState(false);
  const refreshedSourceRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isVisible = useInViewport(containerRef, { rootMargin: "320px 0px" });

  // Retry counter — bounded so we never poll forever.
  // Resets when the file reaches a terminal/ready state.
  const retryCountRef = useRef(0);
  const MAX_THUMBNAIL_RETRIES = 3;
  // True once the client has exhausted all auto-retries. Triggers fallback UI.
  const [retryExhausted, setRetryExhausted] = useState(false);

  const isLargeImage = (attachment.fileSize || 0) > HD_THRESHOLD;
  const [showHd, setShowHd] = useState(!isLargeImage);

  // Phase 02: Use batch thumbnail URLs for timeline.
  // Only fetch when the attachment is near the viewport so long histories
  // don't request every thumbnail at once.
  const {
    urls: thumbnailUrls,
    isLoading: isLoadingThumbnail,
    refresh: refreshThumbnail,
  } = useBatchThumbnailUrl(conversationId, [attachment.id], {
    autoFetch: isVisible,
  });

  // Phase 02: Use preview URL for lightbox
  const {
    url: previewUrl,
    fetchUrl: fetchPreview,
  } = usePreviewUrl(conversationId, attachment.id);

  const thumbnailUrl = thumbnailUrls?.[attachment.id];
  // Only poll when the thumbnail pipeline is still in-flight AND the server says retryable.
  // Terminal states (not_previewable / failed / not_found / forbidden) must never poll.
  const isThumbnailPending =
    (thumbnailUrl?.status === 'processing' || thumbnailUrl?.status === 'queued') &&
    (thumbnailUrl?.isRetryable !== false);

  const mediaWidth = attachment.width ? Math.min(attachment.width, 320) : 280;
  const aspectRatio =
    attachment.width && attachment.height
      ? `${attachment.width} / ${attachment.height}`
      : "4 / 3";

  // Use thumbnail URL for display
  const activeSource = thumbnailUrl?.url || null;
  const hasDisplayUrl = Boolean(activeSource);
  const hasCaption = Boolean(caption);
  const isLoaded = Boolean(activeSource && loadedSource === activeSource);
  const isError = Boolean(activeSource && failedSource === activeSource);
  // Terminal states where no URL will ever be available — show a static fallback icon,
  // never a spinning skeleton.
  const isTerminalNoUrl =
    !activeSource &&
    (thumbnailUrl?.status === 'not_previewable' ||
      thumbnailUrl?.status === 'failed' ||
      thumbnailUrl?.status === 'not_found' ||
      thumbnailUrl?.status === 'forbidden');

  // Reset retry counter and exhaustion flag whenever the thumbnail pipeline
  // leaves the retryable state (reaches ready, failed, not_found, etc.).
  useEffect(() => {
    if (!isThumbnailPending) {
      retryCountRef.current = 0;
      setRetryExhausted(false);
    }
  }, [isThumbnailPending]);

  // Auto-refresh thumbnail while in-flight, visible, and under the retry budget.
  // Uses non-force path so the hook's TTL gate prevents hammering the endpoint;
  // the actual network call fires at most once per retryAfterMs / PENDING_TTL_MS.
  // When retryCountRef hits MAX_THUMBNAIL_RETRIES: stop the timer and set
  // retryExhausted so the component renders a fallback UI instead of a spinner.
  useEffect(() => {
    if (!isThumbnailPending || !isVisible || retryExhausted) return;

    // Use retryAfterMs from the server response; fall back to 8 s.
    const intervalMs = thumbnailUrl?.retryAfterMs ?? 8000;

    const timer = setInterval(() => {
      retryCountRef.current += 1;
      if (retryCountRef.current >= MAX_THUMBNAIL_RETRIES) {
        clearInterval(timer);
        setRetryExhausted(true);
        return;
      }
      void refreshThumbnail(false);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isThumbnailPending, isVisible, retryExhausted, refreshThumbnail, thumbnailUrl?.retryAfterMs]);

  // Manual retry: resets exhaustion state and forces a fresh network call,
  // bypassing the TTL cache. Gives the user 3 more auto-retries after this.
  const handleManualRetry = useCallback(() => {
    retryCountRef.current = 0;
    setRetryExhausted(false);
    void refreshThumbnail(true);
  }, [refreshThumbnail]);

  const handleImageClick = useCallback(async () => {
    if (onClick) {
      // Use thumbnail for click if available, otherwise fetch preview
      if (activeSource) {
        onClick(activeSource);
      } else if (previewUrl) {
        onClick(previewUrl);
      } else {
        const url = await fetchPreview();
        if (url) {
          onClick(url);
        }
      }
    } else {
      setShowFullScreen(true);
    }
  }, [activeSource, previewUrl, fetchPreview, onClick]);

  const handleLoadHd = useCallback(async () => {
    setShowHd(true);
    if (!activeSource) {
      await fetchPreview();
    }
  }, [activeSource, fetchPreview]);

  const handleClose = useCallback(() => {
    setShowFullScreen(false);
  }, []);

  const handleImageError = useCallback(() => {
    if (!activeSource) return;

    if (refreshedSourceRef.current !== activeSource) {
      refreshedSourceRef.current = activeSource;
      void refreshThumbnail();
      return;
    }

    setFailedSource(activeSource);
  }, [activeSource, refreshThumbnail]);

  const isUploading = uploadProgress !== undefined && uploadProgress < 100;

  // Large image with thumbnail (show thumbnail + HD download button)
  if (isLargeImage && !showHd) {
    return (
      <div className={clsx("relative", className)}>
        <div
          ref={containerRef}
          className={clsx(
            "relative overflow-hidden rounded-xl bg-surface-overlay",
          )}
          style={{ width: mediaWidth, maxWidth: "100%", aspectRatio }}
        >
          {/* Thumbnail placeholder / retry-exhausted fallback */}
          {isThumbnailPending && !retryExhausted && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <ArrowPathIcon className="h-8 w-8 animate-spin text-text-muted" />
              <span className="text-xs text-text-muted">
                {t("chat:image.processing", { defaultValue: "Đang xử lý..." })}
              </span>
            </div>
          )}
          {isThumbnailPending && retryExhausted && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3">
              <PhotoIcon className="h-10 w-10 text-text-muted" />
              <span className="text-center text-xs text-text-muted">
                {t("chat:image.processingFallback", { defaultValue: "Ảnh đang được xử lý" })}
              </span>
              <button
                type="button"
                onClick={handleManualRetry}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ArrowPathIcon className="h-3 w-3" />
                {t("chat:image.retry", { defaultValue: "Thử lại" })}
              </button>
            </div>
          )}
          {!isThumbnailPending && (
            <div className="absolute inset-0 flex items-center justify-center">
              <PhotoIcon className="h-12 w-12 text-text-muted" />
            </div>
          )}

          {/* HD badge */}
          <div className="absolute left-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            HD
          </div>

          {/* File info overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
            <p className="truncate text-xs font-medium text-white">
              {attachment.fileName || "Image"}
            </p>
            <p className="text-[10px] text-white/70">
              {formatBytes(attachment.fileSize)}
            </p>
          </div>

          {/* Download HD button */}
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              type="button"
              onClick={handleLoadHd}
              className={clsx(
                "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg transition-transform",
                "bg-surface/90 text-text-primary hover:bg-surface backdrop-blur",
              )}
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              {t("chat:image.downloadHd", { defaultValue: "Tải ảnh HD" })}
            </button>
          </div>
        </div>

        {hasCaption && (
          <p
            className={clsx(
              "mt-2 text-sm",
              isOwn ? "text-[hsl(var(--chat-bubble-sent-text))/0.9]" : "text-text-secondary",
            )}
          >
            {caption}
          </p>
        )}
      </div>
    );
  }

  // Normal inline image
  return (
    <>
      <div className={clsx("relative", className)}>
        <div
          ref={containerRef}
          className="relative overflow-hidden rounded-xl bg-surface-overlay"
          style={{ width: mediaWidth, maxWidth: "100%", aspectRatio }}
        >
          {/* Skeleton — only while we're waiting for a real URL or for the image to load.
               Hidden when thumbnail is pending (has its own UI), terminal, or errored. */}
          {(!isLoaded || isLoadingThumbnail || !hasDisplayUrl) && !isError && !isTerminalNoUrl && !isThumbnailPending && (
            <Skeleton className="absolute inset-0" rounded="lg" />
          )}

          {/* Processing/queued — thumbnail pipeline is still running, within retry budget */}
          {isThumbnailPending && !hasDisplayUrl && !retryExhausted && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-overlay">
              <ArrowPathIcon className="h-8 w-8 animate-spin text-text-muted" />
              <span className="text-xs text-text-muted">
                {t("chat:image.processing", { defaultValue: "Đang tạo xem trước…" })}
              </span>
            </div>
          )}

          {/* Retry exhausted — client gave up auto-polling; offer manual retry */}
          {isThumbnailPending && !hasDisplayUrl && retryExhausted && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-overlay p-4">
              <PhotoIcon className="h-10 w-10 text-text-muted" />
              <span className="text-center text-xs text-text-muted">
                {t("chat:image.processingFallback", { defaultValue: "Ảnh đang được xử lý" })}
              </span>
              <button
                type="button"
                onClick={handleManualRetry}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ArrowPathIcon className="h-3 w-3" />
                {t("chat:image.retry", { defaultValue: "Thử lại" })}
              </button>
            </div>
          )}

          {/* Terminal no-URL — server says this file cannot be previewed or permanently failed */}
          {isTerminalNoUrl && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
              <PhotoIcon className="h-10 w-10 text-text-muted" />
              <span className="text-center text-xs text-text-muted">
                {thumbnailUrl?.status === 'not_previewable'
                  ? t("chat:image.notPreviewable", { defaultValue: "Không hỗ trợ xem trước" })
                  : t("chat:image.previewFailed", { defaultValue: "Không tạo được xem trước" })}
              </span>
            </div>
          )}

          {/* Error state — URL was available but browser failed to load the image */}
          {isError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-sm text-text-muted">
              <PhotoIcon className="h-8 w-8" />
              <span>{t("chat:image.failedToLoad", { defaultValue: "Failed to load image" })}</span>
              <button
                type="button"
                onClick={() => void refreshThumbnail()}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ArrowPathIcon className="h-3 w-3" />
                {t("chat:image.retry", { defaultValue: "Thử lại" })}
              </button>
            </div>
          )}

          {/* Upload progress overlay */}
          {isUploading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
              <div className="h-1.5 w-3/4 max-w-[200px] overflow-hidden rounded-full bg-white/30">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <span className="mt-2 text-xs text-white">
                {t("chat:file.uploading", { defaultValue: "Đang tải lên..." })}
                {" "}
                {Math.round(uploadProgress)}%
              </span>
            </div>
          )}

          {/* Image */}
          {hasDisplayUrl && (
            <img
              loading="lazy"
              decoding="async"
              className={clsx(
                "absolute inset-0 h-full w-full cursor-pointer object-cover transition-opacity duration-150",
                isLoaded ? "opacity-100" : "opacity-0",
                "hover:opacity-95",
              )}
              src={activeSource!}
              alt={caption || attachment.fileName || t("chat:image.previewAlt")}
              onClick={handleImageClick}
              onLoad={() => {
                if (!activeSource) return;
                setLoadedSource(activeSource);
                setFailedSource((previous) =>
                  previous === activeSource ? null : previous,
                );
              }}
              onError={handleImageError}
            />
          )}

          {/* HD badge for large images */}
          {isLargeImage && showHd && (
            <div className="absolute left-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              HD
            </div>
          )}
        </div>

        {/* Caption */}
        {hasCaption && (
          <p
            className={clsx(
              "mt-2 min-h-5 text-sm transition-opacity duration-150",
              isOwn ? "text-[hsl(var(--chat-bubble-sent-text))/0.9]" : "text-text-secondary",
              isLoaded ? "opacity-100" : "opacity-0",
            )}
            aria-hidden={!isLoaded}
          >
            {caption}
          </p>
        )}
      </div>

      {/* Fullscreen lightbox */}
      {showFullScreen && (
        <ImageLightbox
          conversationId={conversationId}
          attachment={attachment}
          onClose={handleClose}
        />
      )}
    </>
  );
};

/**
 * Phase 02: Lightbox component that fetches preview URL on demand
 */
interface ImageLightboxProps {
  conversationId: string;
  attachment: Attachment;
  onClose: () => void;
}

const ImageLightbox: React.FC<ImageLightboxProps> = ({
  conversationId,
  attachment,
  onClose,
}) => {
  const { t } = useTranslation();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { url: previewUrl, fetchUrl: fetchPreview } = usePreviewUrl(
    conversationId,
    attachment.id,
  );

  useEffect(() => {
    const loadImage = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const url = previewUrl || await fetchPreview();
        setImageUrl(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load image');
      } finally {
        setIsLoading(false);
      }
    };

    void loadImage();
  }, [previewUrl, fetchPreview]);

  const handleDownload = useCallback(async () => {
    if (!imageUrl) return;
    
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${attachment.fileName || 'image'}.${attachment.mimeType?.split('/')[1] || 'jpg'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(imageUrl, "_blank");
    }
  }, [imageUrl, attachment]);

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-surface-overlay/95 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <button
        className="absolute right-4 top-4 rounded-full border border-border bg-surface/80 p-2 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
        onClick={onClose}
        aria-label={t("chat:image.close", { defaultValue: "Close" })}
      >
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {isLoading && (
        <div className="flex flex-col items-center gap-4">
          <ArrowPathIcon className="h-12 w-12 animate-spin text-text-muted" />
          <span className="text-text-muted">{t("chat:image.loading", { defaultValue: "Đang tải..." })}</span>
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center gap-4">
          <PhotoIcon className="h-12 w-12 text-text-muted" />
          <span className="text-text-muted">{error}</span>
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              setError(null);
              void fetchPreview().then(setImageUrl).catch((e) => setError(e.message)).finally(() => setIsLoading(false));
            }}
            className="rounded bg-primary px-4 py-2 text-sm text-white hover:bg-primary/80"
          >
            {t("chat:image.retry", { defaultValue: "Thử lại" })}
          </button>
        </div>
      )}

      {imageUrl && !isLoading && !error && (
        <img
          src={imageUrl}
          alt={attachment.fileName || t("chat:image.previewAlt")}
          className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-elev3"
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Download button */}
      {imageUrl && !isLoading && !error && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void handleDownload();
          }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-surface/90 px-4 py-2 text-sm shadow-lg backdrop-blur transition-colors hover:bg-surface"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          {t("chat:image.downloadOriginal", { defaultValue: "Tải ảnh gốc" })}
        </button>
      )}
    </div>
  );
};

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes?: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

export default ImageMessage;
