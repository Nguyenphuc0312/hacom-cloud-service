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
import type { Attachment, ImageClickPayload } from "../../types";
import { useBatchThumbnailUrl, usePreviewUrl } from "../../hooks";
import { useInViewport } from "../../hooks/useInViewport";
import { resolvePublicResourceUrl } from "../../config";
import { blobPreviewCache } from "../../lib/blobPreviewCache";
import { Skeleton } from "../ui";
import { ImagePreviewModal } from "../modals/ImagePreviewModal";
import { SafeImage } from "../common/SafeImage";
import {
  afterNextPaint,
  getRedactedResourceTiming,
  markImagePerformanceMilestone,
  reportImagePerformance,
} from "../../utils/imagePerformanceTelemetry";
import {
  getThumbnailPollDelayMs,
  shouldContinueThumbnailPolling,
} from "./imageThumbnailPolling";
import { areAttachmentsRenderEquivalent } from "../../utils/messageRenderSignature";

interface ImageMessageProps {
  conversationId: string;
  attachment: Attachment;
  caption?: string;
  isOwn: boolean;
  onClick?: (payload: ImageClickPayload) => void;
  /** Upload progress (0-100) */
  uploadProgress?: number;
  className?: string;
  /** When true, fills parent container (used in ImageGallery grid cells) */
  fillContainer?: boolean;
  /** Sender metadata forwarded to the lightbox bottom bar */
  senderName?: string;
  senderAvatar?: string;
  sentAt?: Date | string;
}

const HD_THRESHOLD = 10 * 1024 * 1024; // 10MB

// --- Thumbnail polling cadence (fallback when WS preview event is missed) ----
// Exponential backoff during an "active" window, then a slow heartbeat so a job
// that finishes late (large image / queue backlog) still self-heals without the
// user refreshing. WebSocket `attachment:preview_ready` short-circuits all of
// this when it arrives.
const ImageMessageComponent: React.FC<ImageMessageProps> = ({
  conversationId,
  attachment,
  caption,
  isOwn,
  onClick,
  uploadProgress,
  className,
  fillContainer = false,
  senderName,
  senderAvatar,
  sentAt,
}) => {
  const { t } = useTranslation();
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [showFullScreen, setShowFullScreen] = useState(false);
  const refreshedSourceRef = useRef<string | null>(null);
  const imageRequestedAtRef = useRef<number | null>(null);
  const reportedPlaceholderRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isVisible = useInViewport(containerRef, { rootMargin: "320px 0px" });

  // Backoff bookkeeping. `pendingSinceRef` anchors the active window; `pollAttemptRef`
  // indexes the backoff schedule. We never hard-stop while the server says
  // retryable — once the active window elapses we keep a slow heartbeat going.
  const pollAttemptRef = useRef(0);
  // True once the active window has elapsed: show the "still processing, open the
  // original" fallback while continuing to poll slowly in the background.
  const [retryExhausted, setRetryExhausted] = useState(false);
  // Bumped on tab visibility changes so the polling effect re-evaluates (pauses
  // while hidden, resumes on focus).
  const [tabVisibilityTick, setTabVisibilityTick] = useState(0);

  const isLargeImage = (attachment.fileSize || 0) > HD_THRESHOLD;
  // Missing capability fields are legacy payloads and remain allowed.
  const canPreview = attachment.canPreview !== false;
  const canDownload = attachment.canDownload !== false;
  const [showHd, setShowHd] = useState(!isLargeImage);

  // Phase 02: Use batch thumbnail URLs for timeline.
  // Only fetch when the attachment is near the viewport so long histories
  // don't request every thumbnail at once.
  const {
    urls: thumbnailUrls,
    isLoading: isLoadingThumbnail,
    refresh: refreshThumbnail,
  } = useBatchThumbnailUrl(conversationId, canPreview ? [attachment.id] : [], {
    autoFetch: canPreview && isVisible,
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
    canPreview &&
    (thumbnailUrl?.status === 'processing' || thumbnailUrl?.status === 'queued') &&
    (thumbnailUrl?.isRetryable !== false);

  const mediaWidth = attachment.width ? Math.min(attachment.width, 320) : 280;
  const aspectRatio =
    attachment.aspectRatio && attachment.aspectRatio > 0
      ? String(attachment.aspectRatio)
      : attachment.width && attachment.height
      ? `${attachment.width} / ${attachment.height}`
      : "4 / 3";
  const placeholderCandidate = canPreview
    ? attachment.placeholder ?? thumbnailUrl?.placeholder ?? undefined
    : undefined;
  const placeholderUrl =
    placeholderCandidate && placeholderCandidate.length <= 2_048
      ? resolvePublicResourceUrl(placeholderCandidate, {
          context: "image",
          allowDataImage: true,
        })
      : undefined;
  const placeholderStyle: React.CSSProperties | undefined = placeholderUrl
    ? {
        backgroundImage: `url("${placeholderUrl}")`,
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }
    : undefined;

  useEffect(() => {
    if (!placeholderUrl || reportedPlaceholderRef.current === attachment.id) return;
    reportedPlaceholderRef.current = attachment.id;
    return afterNextPaint(() => {
      const renderedHeight =
        attachment.width && attachment.height
          ? Math.round(mediaWidth * (attachment.height / attachment.width))
          : undefined;
      reportImagePerformance(conversationId, {
        kind: "placeholder_painted",
        renderedWidth: mediaWidth,
        renderedHeight,
        outcome: "success",
      });
      markImagePerformanceMilestone(conversationId, "T3", {
        renderedWidth: mediaWidth,
        renderedHeight,
        outcome: "success",
      });
    });
  }, [attachment.height, attachment.id, attachment.width, conversationId, mediaWidth, placeholderUrl]);

  // True when batch thumbnail API has permanently failed for this file.
  // This happens for forwarded messages where the new conversationId is not yet
  // authorized on the backend, even though the file itself exists.
  const terminalBatchStatus =
    thumbnailUrl?.status === 'not_previewable' ||
    thumbnailUrl?.status === 'failed' ||
    thumbnailUrl?.status === 'not_found' ||
    thumbnailUrl?.status === 'forbidden';

  // blobPreviewCache holds a separate ObjectURL created in getReadyMeta(), valid
  // even after the draft's previewUrl is revoked in acknowledgeSent(). Used as
  // fallback when the real server message (no attachment.url) replaces optimistic.
  const cachedBlobUrl = canPreview
    ? blobPreviewCache.get(attachment.id) ?? null
    : null;

  const attachmentThumbnailUrl = canPreview
    ? resolvePublicResourceUrl(attachment.thumbnailUrl, {
        context: "image",
        allowBlob: true,
      })
    : null;
  const optimisticDirectUrl =
    canPreview && attachment.url?.startsWith("blob:")
      ? resolvePublicResourceUrl(attachment.url, {
          context: "image",
          allowBlob: true,
        })
      : null;

  // Timeline rendering is thumbnail-only. A persisted attachment's original URL
  // must never be an eager fallback while the batch thumbnail request is pending.
  // Optimistic local blobs remain available until the server message reconciles.
  const activeSource = canPreview
    ? thumbnailUrl?.url ??
      attachmentThumbnailUrl ??
      cachedBlobUrl ??
      optimisticDirectUrl ??
      null
    : null;
  const hasDisplayUrl = Boolean(activeSource);
  const hasCaption = Boolean(caption);
  const isLoaded = Boolean(activeSource && loadedSource === activeSource);
  const isError = Boolean(activeSource && failedSource === activeSource);
  // Terminal states where no URL will ever be available — show a static fallback icon,
  // never a spinning skeleton.
  const isTerminalNoUrl = !activeSource && (!canPreview || terminalBatchStatus);

  useEffect(() => {
    imageRequestedAtRef.current = activeSource ? performance.now() : null;
  }, [activeSource]);

  const handleImageLoad = useCallback(
    (
      event: React.SyntheticEvent<HTMLImageElement>,
      source: string,
      meta?: { decodeDurationMs?: number },
    ) => {
      if (!activeSource) return;
      const requestedAt = imageRequestedAtRef.current;
      const resourceTiming = getRedactedResourceTiming(source);
      const paintPayload = {
        durationMs:
          requestedAt === null
            ? undefined
            : Math.round(performance.now() - requestedAt),
        width: event.currentTarget.naturalWidth,
        height: event.currentTarget.naturalHeight,
        renderedWidth: event.currentTarget.clientWidth,
        renderedHeight: event.currentTarget.clientHeight,
        decodeDurationMs: meta?.decodeDurationMs,
        ...resourceTiming,
        outcome: "success" as const,
      };

      if (resourceTiming.requestStartMs !== undefined) {
        markImagePerformanceMilestone(
          conversationId,
          "T5",
          { outcome: "success" },
          resourceTiming.requestStartMs,
        );
      }
      if (resourceTiming.responseStartMs !== undefined) {
        markImagePerformanceMilestone(
          conversationId,
          "T6",
          { outcome: "success" },
          resourceTiming.responseStartMs,
        );
      }
      if (resourceTiming.responseEndMs !== undefined) {
        markImagePerformanceMilestone(
          conversationId,
          "T7",
          { outcome: "success" },
          resourceTiming.responseEndMs,
        );
      }
      markImagePerformanceMilestone(conversationId, "T8", {
        decodeDurationMs: meta?.decodeDurationMs,
        outcome: "success",
      });

      setLoadedSource(activeSource);
      setFailedSource((previous) =>
        previous === activeSource ? null : previous,
      );
      afterNextPaint(() => {
        reportImagePerformance(conversationId, {
          kind: "image_painted",
          ...paintPayload,
        });
        markImagePerformanceMilestone(conversationId, "T9", paintPayload);
      });
    },
    [activeSource, conversationId],
  );

  // Reset backoff bookkeeping whenever the thumbnail pipeline leaves the
  // retryable state (reaches ready, failed, not_found, etc.).
  useEffect(() => {
    if (!isThumbnailPending) {
      pollAttemptRef.current = 0;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRetryExhausted(false);
    }
  }, [isThumbnailPending]);

  // Pause/resume polling with tab visibility (avoid background spam).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => setTabVisibilityTick((tick) => tick + 1);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Smart auto-poll: exponential backoff inside the active window, then a slow
  // heartbeat — never a hard stop while the server says retryable. The hook's
  // TTL gate + in-flight dedupe still prevent hammering the endpoint. The
  // WebSocket preview_ready handler evicts the cache and refetches out-of-band,
  // so in the happy path this loop fires only once or twice.
  useEffect(() => {
    if (!isThumbnailPending || !isVisible) return;
    if (typeof document !== "undefined" && document.hidden) return;

    if (!shouldContinueThumbnailPolling(pollAttemptRef.current)) {
      if (!retryExhausted) {
        setRetryExhausted(true);
      }
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleNext = () => {
      if (!shouldContinueThumbnailPolling(pollAttemptRef.current)) {
        if (!retryExhausted) {
          setRetryExhausted(true);
        }
        return;
      }

      const delay = getThumbnailPollDelayMs(
        pollAttemptRef.current,
        thumbnailUrl?.retryAfterMs,
      );

      timer = setTimeout(() => {
        if (cancelled) return;
        pollAttemptRef.current += 1;
        void refreshThumbnail(false);
        if (!shouldContinueThumbnailPolling(pollAttemptRef.current)) {
          setRetryExhausted(true);
          return;
        }
        scheduleNext();
      }, delay);
    };

    scheduleNext();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    isThumbnailPending,
    isVisible,
    retryExhausted,
    refreshThumbnail,
    thumbnailUrl?.retryAfterMs,
    tabVisibilityTick,
  ]);

  // Manual retry: restarts the bounded polling budget and forces a fresh network call,
  // bypassing the TTL cache.
  const handleManualRetry = useCallback(() => {
    if (!canPreview) return;
    pollAttemptRef.current = 0;
    setRetryExhausted(false);
    void refreshThumbnail(true);
  }, [canPreview, refreshThumbnail]);

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const handleImageClick = useCallback(async () => {
    if (!canPreview) return;
    if (onClick) {
      let url = activeSource;
      if (!url && previewUrl) url = previewUrl;
      if (!url) url = await fetchPreview();
      if (url) {
        onClick({
          url,
          canPreview: attachment.canPreview,
          canDownload: attachment.canDownload,
          alt: attachment.fileName,
          senderName,
          senderAvatar,
          sentAt,
          conversationId,
          groupKey: attachment.id,
        });
      }
    } else {
      // Open modal immediately with whatever URL we have; upgrade to preview URL async
      const immediateUrl = previewUrl ?? activeSource ?? null;
      setLightboxUrl(immediateUrl);
      setShowFullScreen(true);
      if (!immediateUrl) {
        const url = await fetchPreview();
        if (url) setLightboxUrl(url);
      }
    }
  }, [
    activeSource,
    attachment.canDownload,
    attachment.canPreview,
    attachment.fileName,
    attachment.id,
    canPreview,
    conversationId,
    fetchPreview,
    onClick,
    previewUrl,
    senderAvatar,
    senderName,
    sentAt,
  ]);

  const handleLoadHd = useCallback(async () => {
    if (!canPreview || !canDownload) return;
    setShowHd(true);
    if (!activeSource) {
      await fetchPreview();
    }
  }, [activeSource, canDownload, canPreview, fetchPreview]);

  const handleClose = useCallback(() => {
    setShowFullScreen(false);
    setLightboxUrl(null);
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
  // Skip this UI in gallery/fillContainer mode — show thumbnail directly instead
  if (canPreview && isLargeImage && !showHd && !fillContainer) {
    return (
      <div className={clsx("relative", className)}>
        <div
          ref={containerRef}
          data-image-placeholder={placeholderUrl ? "painted" : undefined}
          className={clsx(
            "relative overflow-hidden rounded-xl bg-surface-overlay",
          )}
          style={{ width: mediaWidth, maxWidth: "100%", aspectRatio, ...placeholderStyle }}
        >
          {/* Thumbnail placeholder / retry-exhausted fallback */}
          {isThumbnailPending && !retryExhausted && !placeholderUrl && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <ArrowPathIcon className="h-8 w-8 animate-spin text-text-muted" />
              <span className="text-xs text-text-muted">
                {t("chat:image.processing", { defaultValue: "Đang xử lý..." })}
              </span>
            </div>
          )}
          {isThumbnailPending && retryExhausted && !placeholderUrl && (
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
          {!isThumbnailPending && !hasDisplayUrl && !placeholderUrl && (
            <div className="absolute inset-0 flex items-center justify-center">
              <PhotoIcon className="h-12 w-12 text-text-muted" />
            </div>
          )}

          {hasDisplayUrl && (
            <SafeImage
              className={clsx(
                "absolute inset-0 h-full w-full cursor-pointer object-cover transition-opacity duration-150",
                isLoaded ? "opacity-100" : "opacity-0",
                "hover:opacity-95",
              )}
              src={activeSource!}
              alt={caption || attachment.fileName || t("chat:image.previewAlt")}
              onClick={handleImageClick}
              onLoad={handleImageLoad}
              onError={handleImageError}
              fallback={null}
              retryOnSignedUrlExpired
              onRetrySource={() => void refreshThumbnail(true)}
            />
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
              disabled={!canDownload}
              className={clsx(
                "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg transition-transform",
                "bg-surface/90 text-text-primary hover:bg-surface backdrop-blur",
                !canDownload && "cursor-not-allowed opacity-50 hover:bg-surface",
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
      <div className={clsx("relative", fillContainer && "h-full w-full", className)}>
        <div
          ref={containerRef}
          data-image-placeholder={placeholderUrl ? "painted" : undefined}
          className={clsx(
            "relative overflow-hidden bg-surface-overlay",
            fillContainer ? "h-full w-full" : "rounded-xl",
          )}
          style={
            fillContainer
              ? placeholderStyle
              : { width: mediaWidth, maxWidth: "100%", aspectRatio, ...placeholderStyle }
          }
        >
          {/* Skeleton — only while we're waiting for a real URL or for the image to load.
               Hidden when thumbnail is pending (has its own UI), terminal, or errored. */}
          {(!isLoaded || isLoadingThumbnail || !hasDisplayUrl) && !isError && !isTerminalNoUrl && !isThumbnailPending && !placeholderUrl && (
            <Skeleton className="absolute inset-0" rounded="lg" />
          )}

          {/* Processing/queued — thumbnail pipeline is still running, within retry budget */}
          {isThumbnailPending && !hasDisplayUrl && !retryExhausted && !placeholderUrl && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-overlay">
              <ArrowPathIcon className="h-8 w-8 animate-spin text-text-muted" />
              <span className="text-xs text-text-muted">
                {t("chat:image.processing", { defaultValue: "Đang tạo xem trước…" })}
              </span>
            </div>
          )}

          {/* Active window elapsed — still polling slowly in the background, but
              surface a fallback so the user can open/download the original now. */}
          {isThumbnailPending && !hasDisplayUrl && retryExhausted && !placeholderUrl && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-overlay p-4">
              <PhotoIcon className="h-10 w-10 text-text-muted" />
              <span className="text-center text-xs text-text-muted">
                {t("chat:image.processingFallback", {
                  defaultValue: "Ảnh đang được xử lý, bạn vẫn có thể mở/tải ảnh gốc.",
                })}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleImageClick}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <PhotoIcon className="h-3 w-3" />
                  {t("chat:image.openOriginal", { defaultValue: "Mở ảnh gốc" })}
                </button>
                <button
                  type="button"
                  onClick={handleManualRetry}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ArrowPathIcon className="h-3 w-3" />
                  {t("chat:image.retry", { defaultValue: "Thử lại" })}
                </button>
              </div>
            </div>
          )}

          {/* Terminal no-URL — server says this file cannot be previewed or permanently failed */}
          {isTerminalNoUrl && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
              <PhotoIcon className="h-10 w-10 text-text-muted" />
              <span className="text-center text-xs text-text-muted">
                {!canPreview || thumbnailUrl?.status === 'not_previewable'
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
                  className="h-full w-full origin-left rounded-full bg-primary transition-transform duration-300"
                  style={{ transform: `scaleX(${uploadProgress / 100})` }}
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
            <SafeImage
              className={clsx(
                "absolute inset-0 h-full w-full cursor-pointer object-cover transition-opacity duration-150",
                isLoaded ? "opacity-100" : "opacity-0",
                "hover:opacity-95",
              )}
              src={activeSource!}
              alt={caption || attachment.fileName || t("chat:image.previewAlt")}
              onClick={handleImageClick}
              onLoad={handleImageLoad}
              onError={handleImageError}
              fallback={null}
              retryOnSignedUrlExpired
              onRetrySource={() => void refreshThumbnail(true)}
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

      {/* Fullscreen lightbox — uses the same ImagePreviewModal as the media gallery */}
      <ImagePreviewModal
        isOpen={showFullScreen && lightboxUrl !== null}
        onClose={handleClose}
        imageUrl={lightboxUrl ?? undefined}
        canPreview={canPreview}
        canDownload={attachment.canDownload}
        alt={attachment.fileName}
        senderName={senderName}
        senderAvatar={senderAvatar}
        sentAt={sentAt}
        telemetryConversationKey={conversationId}
      />
    </>
  );
};

const areEqualImageMessageProps = (
  previous: ImageMessageProps,
  next: ImageMessageProps,
): boolean =>
  previous.conversationId === next.conversationId &&
  areAttachmentsRenderEquivalent(previous.attachment, next.attachment) &&
  previous.caption === next.caption &&
  previous.isOwn === next.isOwn &&
  previous.onClick === next.onClick &&
  previous.uploadProgress === next.uploadProgress &&
  previous.className === next.className &&
  previous.fillContainer === next.fillContainer &&
  previous.senderName === next.senderName &&
  previous.senderAvatar === next.senderAvatar &&
  String(previous.sentAt ?? "") === String(next.sentAt ?? "");

export const ImageMessage = React.memo(
  ImageMessageComponent,
  areEqualImageMessageProps,
);

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
