/**
 * @fileoverview VideoMessage - Video message component with thumbnail and play button.
 *
 * Features:
 * - Thumbnail from first frame
 * - Play button overlay (48px, semi-transparent)
 * - Duration badge (bottom-left)
 * - Click to play inline (for < 50MB) or redirect to preview
 */

import React, { useCallback, useRef, useState, useEffect } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { PlayIcon, VideoCameraIcon } from "@heroicons/react/24/outline";
import type { Attachment } from "../../types";
import { useAttachmentDownloadUrl } from "../../hooks";
import { useInViewport } from "../../hooks/useInViewport";
import { Skeleton } from "../ui";

interface VideoMessageProps {
  conversationId: string;
  attachment: Attachment;
  onPreview?: (attachment: Attachment) => void;
  /** Upload progress (0-100) */
  uploadProgress?: number;
  className?: string;
}

const INLINE_PLAY_THRESHOLD = 50 * 1024 * 1024; // 50MB

export const VideoMessage: React.FC<VideoMessageProps> = ({
  conversationId,
  attachment,
  onPreview,
  uploadProgress,
  className,
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [showInlinePlayer, setShowInlinePlayer] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const isVisible = useInViewport(containerRef, { rootMargin: "320px 0px" });

  const { url: resolvedUrl, isLoading: isLoadingUrl, resolveUrl } = useAttachmentDownloadUrl(
    conversationId,
    attachment,
    { autoResolve: false },
  );

  const isLargeVideo = (attachment.fileSize || 0) > INLINE_PLAY_THRESHOLD;
  const attachmentMeta = attachment as unknown as Record<string, unknown>;
  const duration = (attachmentMeta.duration as number)
    ? formatDuration(attachmentMeta.duration as number)
    : null;

  // Resolve video URL when visible
  useEffect(() => {
    if (isVisible && !resolvedUrl && !isLoadingUrl) {
      void resolveUrl();
    }
  }, [isVisible, resolvedUrl, isLoadingUrl, resolveUrl]);

  const handlePlay = useCallback(async () => {
    if (isLargeVideo) {
      // Redirect to preview modal
      if (onPreview) {
        onPreview(attachment);
      }
      return;
    }

    // Inline play
    if (resolvedUrl) {
      setVideoUrl(resolvedUrl);
      setShowInlinePlayer(true);
    } else {
      const url = await resolveUrl();
      if (url) {
        setVideoUrl(url);
        setShowInlinePlayer(true);
      }
    }
  }, [isLargeVideo, resolvedUrl, resolveUrl, onPreview, attachment]);

  const handleClose = useCallback(() => {
    setShowInlinePlayer(false);
    setVideoUrl(null);
    if (videoRef.current) {
      videoRef.current.pause();
    }
  }, []);

  const handleVideoEnded = useCallback(() => {
    setShowInlinePlayer(false);
    setVideoUrl(null);
  }, []);

  const isUploading = uploadProgress !== undefined && uploadProgress < 100;

  // Inline video player
  if (showInlinePlayer && videoUrl) {
    return (
      <div className="relative" style={{ width: 280, maxWidth: "100%" }}>
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          autoPlay
          className="w-full rounded-xl"
          onEnded={handleVideoEnded}
        >
          <track kind="captions" />
        </video>

        <button
          className="absolute right-2 top-2 rounded-full border border-border bg-surface/80 p-1.5 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
          onClick={handleClose}
          aria-label={t("common:actions.close")}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className={clsx("group/video relative", className)}
      >
        {/* Video container */}
        <div
          className={clsx(
            "relative flex h-36 w-full max-w-[280px] cursor-pointer items-center justify-center overflow-hidden rounded-xl transition-colors",
            "hover:brightness-95",
          )}
          onClick={handlePlay}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handlePlay();
            }
          }}
          aria-label={t("chat:filePreview.playVideo", { defaultValue: "Play video" })}
        >
          {/* Thumbnail */}
          {attachment.thumbnailUrl && !thumbnailError ? (
            <img
              src={attachment.thumbnailUrl}
              alt={attachment.fileName || "Video"}
              loading="lazy"
              decoding="async"
              className={clsx(
                "absolute inset-0 h-full w-full object-cover transition-opacity",
                thumbnailLoaded ? "opacity-100" : "opacity-0",
              )}
              onLoad={() => setThumbnailLoaded(true)}
              onError={() => setThumbnailError(true)}
            />
          ) : !thumbnailError ? (
            <Skeleton className="absolute inset-0" rounded="lg" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-surface-overlay">
              <VideoCameraIcon className="h-12 w-12 text-text-muted" />
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

          {/* Play button overlay */}
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-text-primary/20 transition-colors group-hover/video:bg-text-primary/30">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface/90 shadow-md backdrop-blur transition-transform group-hover/video:scale-110">
              <PlayIcon className="ml-0.5 h-6 w-6 text-text-primary" />
            </div>
          </div>

          {/* Duration badge */}
          {duration && (
            <div className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
              {duration}
            </div>
          )}

          {/* Large video indicator */}
          {isLargeVideo && (
            <div className="absolute right-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {formatBytes(attachment.fileSize)}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

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

export default VideoMessage;
