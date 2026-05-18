/**
 * @fileoverview ImageMessage - Redesigned inline image message with HD support.
 *
 * Features:
 * - Direct image display for files < 10MB
 * - HD badge for large images
 * - Thumbnail preview for large images with "Download HD" button
 * - Lightbox fullscreen preview
 * - Lazy loading with viewport detection
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { PhotoIcon, ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import type { Attachment } from "../../types";
import { useAttachmentDownloadUrl } from "../../hooks";
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

  const isLargeImage = (attachment.fileSize || 0) > HD_THRESHOLD;
  const [showHd, setShowHd] = useState(!isLargeImage); // Auto-show HD for small images

  const {
    url: resolvedUrl,
    isLoading,
    resolveUrl,
  } = useAttachmentDownloadUrl(conversationId, attachment, {
    autoResolve: false,
  });

  const mediaWidth = attachment.width ? Math.min(attachment.width, 320) : 280;
  const aspectRatio =
    attachment.width && attachment.height
      ? `${attachment.width} / ${attachment.height}`
      : "4 / 3";

  const activeSource = resolvedUrl || null;
  const hasDisplayUrl = Boolean(activeSource);
  const hasCaption = Boolean(caption);
  const isLoaded = Boolean(activeSource && loadedSource === activeSource);
  const isError = Boolean(activeSource && failedSource === activeSource);

  useEffect(() => {
    if (!isVisible || activeSource || isError) {
      return;
    }

    void resolveUrl();
  }, [activeSource, isError, isVisible, resolveUrl]);

  const handleImageClick = useCallback(async () => {
    const imageUrl = resolvedUrl || (await resolveUrl());
    if (!imageUrl) return;

    if (onClick) {
      onClick(imageUrl);
    } else {
      setShowFullScreen(true);
    }
  }, [resolvedUrl, resolveUrl, onClick]);

  const handleLoadHd = useCallback(async () => {
    setShowHd(true);
    if (!resolvedUrl) {
      await resolveUrl();
    }
  }, [resolvedUrl, resolveUrl]);

  const handleClose = useCallback(() => {
    setShowFullScreen(false);
  }, []);

  const handleImageError = useCallback(() => {
    if (!activeSource) {
      return;
    }

    if (refreshedSourceRef.current !== activeSource) {
      refreshedSourceRef.current = activeSource;
      void resolveUrl(true);
      return;
    }

    setFailedSource(activeSource);
  }, [activeSource, resolveUrl]);

  const isUploading = uploadProgress !== undefined && uploadProgress < 100;

  // Large image with thumbnail (show thumbnail + HD download button)
  if (isLargeImage && !showHd) {
    return (
      <div className={clsx("relative", className)}>
        <div
          className={clsx(
            "relative overflow-hidden rounded-xl bg-surface-overlay",
          )}
          style={{ width: mediaWidth, maxWidth: "100%", aspectRatio }}
        >
          {/* Thumbnail placeholder */}
          <div className="absolute inset-0 flex items-center justify-center bg-surface-overlay">
            <PhotoIcon className="h-12 w-12 text-text-muted" />
          </div>

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
          {/* Loading skeleton */}
          {(!isLoaded || isLoading || !hasDisplayUrl) && !isError && (
            <Skeleton className="absolute inset-0" rounded="lg" />
          )}

          {/* Error state */}
          {isError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-sm text-text-muted">
              <PhotoIcon className="h-8 w-8" />
              <span>{t("chat:image.failedToLoad", { defaultValue: "Failed to load image" })}</span>
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
              src={resolvedUrl}
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
      {showFullScreen && resolvedUrl && (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center bg-surface-overlay/95 backdrop-blur-md animate-fade-in"
          onClick={handleClose}
        >
          <button
            className="absolute right-4 top-4 rounded-full border border-border bg-surface/80 p-2 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
            onClick={handleClose}
            aria-label={t("chat:image.close", { defaultValue: "Close" })}
          >
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={resolvedUrl}
            alt={attachment.fileName || t("chat:image.previewAlt")}
            decoding="async"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-elev3"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
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
