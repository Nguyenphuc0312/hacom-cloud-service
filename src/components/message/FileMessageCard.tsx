/**
 * @fileoverview FileMessageCard — displays file attachments in chat bubbles.
 *
 * Features:
 * - Inline thumbnail for images / video
 * - File icon based on MIME type
 * - File name (truncated with ellipsis)
 * - File size formatted
 * - Download button
 * - Preview button (if previewable)
 * - Hover states for actions
 * - Skeleton loading for thumbnails
 * - Edge-case: deleted, scanning, blocked, large files
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ArrowDownTrayIcon,
  EyeIcon,
  PlayIcon,
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import type { Attachment } from "../../types";
import { useAttachmentDownloadUrl } from "../../hooks";
import { resolvePublicResourceUrl } from "../../config";
import { useInViewport } from "../../hooks/useInViewport";
import {
  formatFileSize,
  getFileExtension,
  getFileIconType,
  getPreviewType,
  isFileTooLargeForPreview,
} from "../../utils/formatFileSize";
import type { PreviewType } from "../../utils/formatFileSize";
import { FileTypeIcon } from "./FileTypeIcon";

// ── Status types for edge cases ──────────────────────────────────────

type FileStatus = "ready" | "scanning" | "blocked" | "deleted" | "error";

interface FileMessageCardProps {
  conversationId: string;
  attachment: Attachment;
  isOwn: boolean;
  /** Called when user wants to preview the file */
  onPreview?: (attachment: Attachment, previewType: PreviewType) => void;
  /** Override file status for edge-case states */
  fileStatus?: FileStatus;
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────

const FileMessageCardComponent: React.FC<FileMessageCardProps> = ({
  conversationId,
  attachment,
  isOwn,
  onPreview,
  fileStatus = "ready",
  className,
}) => {
  const { t } = useTranslation();

  const previewType = getPreviewType(
    attachment.mimeType,
    attachment.fileName,
  );
  const iconType = getFileIconType(attachment.mimeType, attachment.fileName);
  const extension = getFileExtension(attachment.fileName || "file");
  const size = formatFileSize(attachment.fileSize);
  const isPreviewable =
    previewType !== "unsupported" &&
    !isFileTooLargeForPreview(attachment.fileSize) &&
    fileStatus === "ready";

  const isImage = previewType === "image";
  const isVideo = previewType === "video";
  const showThumbnail = (isImage || isVideo) && fileStatus === "ready";
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isVisible = useInViewport(rootRef, { rootMargin: "240px 0px" });
  const thumbnailWidth = attachment.width ? Math.min(attachment.width, 280) : 200;
  const thumbnailAspectRatio =
    attachment.width && attachment.height
      ? `${attachment.width} / ${attachment.height}`
      : "4 / 3";

  // Resolve download URL (lazy — not auto-resolved)
  const { resolveUrl, isLoading: isDownloading } = useAttachmentDownloadUrl(
    conversationId,
    attachment,
  );

  const directThumbnailUrl = useMemo(
    () =>
      resolvePublicResourceUrl(attachment.thumbnailUrl, {
        context: "image",
        allowBlob: true,
        allowDataImage: attachment.mimeType?.startsWith("image/") === true,
      }) ?? undefined,
    [attachment.mimeType, attachment.thumbnailUrl],
  );

  // Thumbnail URL: use thumbnail if available, otherwise resolve on-demand only
  const { url: resolvedThumbnailUrl, isLoading: isThumbLoading, resolveUrl: resolveThumbnailUrl } =
    useAttachmentDownloadUrl(conversationId, attachment, {
      autoResolve: false,
    });
  const thumbnailUrl = directThumbnailUrl || resolvedThumbnailUrl;
  const shouldResolveThumbnail = isImage && !directThumbnailUrl;

  useEffect(() => {
    if (!isVisible || !shouldResolveThumbnail || thumbnailUrl) {
      return;
    }

    void resolveThumbnailUrl();
  }, [isVisible, resolveThumbnailUrl, shouldResolveThumbnail, thumbnailUrl]);

  // Derive thumbnail state keyed to URL, automatically resets on URL change
  const thumbStateKey = thumbnailUrl ?? "";
  const [thumbState, setThumbState] = useState<{
    key: string;
    loaded: boolean;
    error: boolean;
  }>({ key: thumbStateKey, loaded: false, error: false });

  // If thumbnail URL changed, reset state by creating new state object
  const thumbLoaded =
    thumbState.key === thumbStateKey ? thumbState.loaded : false;
  const thumbError =
    thumbState.key === thumbStateKey ? thumbState.error : false;

  const setThumbLoaded = useCallback(
    (loaded: boolean) =>
      setThumbState((prev) => ({ ...prev, key: thumbStateKey, loaded })),
    [thumbStateKey],
  );
  const setThumbError = useCallback(
    (error: boolean) =>
      setThumbState((prev) => ({ ...prev, key: thumbStateKey, error })),
    [thumbStateKey],
  );

  // ─ Handlers ─

  const handleDownload = useCallback(async () => {
    const downloadUrl = await resolveUrl(true);
    if (!downloadUrl) return;
    // Open in new tab for download
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = attachment.fileName || "download";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [resolveUrl, attachment.fileName]);

  const handlePreview = useCallback(() => {
    if (onPreview && isPreviewable) {
      onPreview(attachment, previewType);
    }
  }, [onPreview, isPreviewable, attachment, previewType]);

  // ─ Edge-case renderers ─

  if (fileStatus === "deleted") {
    return (
      <div
        className={clsx(
          "flex items-center gap-3 rounded-lg p-3 opacity-60",
          isOwn ? "bg-surface/20" : "bg-surface-overlay",
          className,
        )}
      >
        <ExclamationTriangleIcon className="h-8 w-8 shrink-0 text-text-muted" />
        <span className="text-sm italic text-text-muted">
          {t("chat:filePreview.deleted", {
            defaultValue: "This file has been deleted",
          })}
        </span>
      </div>
    );
  }

  if (fileStatus === "blocked") {
    return (
      <div
        className={clsx(
          "flex items-center gap-3 rounded-lg border border-danger/30 p-3",
          isOwn ? "bg-danger/10" : "bg-danger/5",
          className,
        )}
      >
        <ShieldExclamationIcon className="h-8 w-8 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-danger">
            {t("chat:filePreview.blocked", {
              defaultValue: "File blocked — potential threat detected",
            })}
          </p>
          <p className="text-xs text-text-muted">
            {attachment.fileName || t("chat:file.unknown")}
          </p>
        </div>
      </div>
    );
  }

  if (fileStatus === "scanning") {
    return (
      <div
        className={clsx(
          "flex items-center gap-3 rounded-lg p-3",
          isOwn ? "bg-surface/20" : "bg-surface-overlay",
          className,
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={clsx(
              "truncate text-sm font-medium",
              isOwn ? "text-text-inverse" : "text-text-primary",
            )}
          >
            {attachment.fileName || t("chat:file.unknown")}
          </p>
          <p
            className={clsx(
              "text-xs",
              isOwn ? "text-text-inverse/70" : "text-text-muted",
            )}
          >
            {t("chat:filePreview.scanning", { defaultValue: "Scanning…" })}
          </p>
        </div>
      </div>
    );
  }

  // ─ Image thumbnail layout ─

  if (showThumbnail && isImage) {
    return (
      <div
        ref={rootRef}
        className={clsx(
          "group/file relative overflow-hidden rounded-lg",
          className,
        )}
      >
        {/* Skeleton */}
        <div
          className="relative overflow-hidden rounded-lg bg-surface-overlay"
          style={{
            width: thumbnailWidth,
            maxWidth: "100%",
            aspectRatio: thumbnailAspectRatio,
          }}
        >
          {(!thumbLoaded || isThumbLoading) && !thumbError && (
            <div className="absolute inset-0 animate-pulse bg-surface-overlay" />
          )}

          {thumbError && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface-overlay">
              <ExclamationTriangleIcon className="h-8 w-8 text-text-muted" />
            </div>
          )}

          {thumbnailUrl && !thumbError && (
            <img
              src={thumbnailUrl}
              alt={attachment.fileName || t("chat:image.previewAlt")}
              className={clsx(
                "absolute inset-0 h-full w-full cursor-pointer object-cover transition-opacity",
                thumbLoaded ? "opacity-100" : "opacity-0",
                "hover:brightness-90",
              )}
              onLoad={() => setThumbLoaded(true)}
              onError={() => setThumbError(true)}
              onClick={handlePreview}
            />
          )}

          {thumbLoaded && isPreviewable && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-text-primary/0 transition-colors group-hover/file:bg-text-primary/20">
              <button
                type="button"
                onClick={handlePreview}
                className="pointer-events-auto rounded-full bg-surface/90 p-2 opacity-0 shadow-md backdrop-blur transition-opacity group-hover/file:opacity-100"
                aria-label={t("chat:filePreview.preview", {
                  defaultValue: "Preview",
                })}
              >
                <EyeIcon className="h-5 w-5 text-text-primary" />
              </button>
            </div>
          )}
        </div>

        {/* File info bar at bottom */}
        <div
          className={clsx("mt-1 flex items-center justify-between gap-2 px-1")}
        >
          <span
            className={clsx(
              "truncate text-xs",
              isOwn ? "text-text-inverse/70" : "text-text-muted",
            )}
          >
            {size}
          </span>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={isDownloading}
            className={clsx(
              "shrink-0 rounded-full p-1 transition-colors disabled:opacity-50",
              isOwn
                ? "text-text-inverse/70 hover:text-text-inverse"
                : "text-text-muted hover:text-text-primary",
            )}
            aria-label={t("chat:file.download")}
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // ─ Video thumbnail layout ─

  if (showThumbnail && isVideo) {
    return (
      <div
        ref={rootRef}
        className={clsx(
          "group/file relative overflow-hidden rounded-lg",
          className,
        )}
      >
        {/* Video placeholder */}
        <div
          className={clsx(
            "relative flex h-36 w-full max-w-[280px] cursor-pointer items-center justify-center rounded-lg",
            isOwn ? "bg-surface/20" : "bg-surface-overlay",
          )}
          onClick={handlePreview}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handlePreview();
            }
          }}
          aria-label={t("chat:filePreview.playVideo", {
            defaultValue: "Play video",
          })}
        >
          {/* If thumbnail available, show it */}
          {attachment.thumbnailUrl ? (
            <img
              src={attachment.thumbnailUrl}
              alt=""
              className="absolute inset-0 h-full w-full rounded-lg object-cover"
            />
          ) : (
            <VideoCameraIcon className="h-12 w-12 text-text-muted" />
          )}

          {/* Play button overlay */}
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-text-primary/30 transition-colors group-hover/file:bg-text-primary/40">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface/90 shadow-md backdrop-blur">
              <PlayIcon className="h-6 w-6 text-text-primary" />
            </div>
          </div>
        </div>

        {/* Info bar */}
        <div className="mt-1 flex items-center justify-between gap-2 px-1">
          <span
            className={clsx(
              "truncate text-xs",
              isOwn ? "text-text-inverse/70" : "text-text-muted",
            )}
          >
            {attachment.fileName || t("chat:file.unknown")} · {size}
          </span>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={isDownloading}
            className={clsx(
              "shrink-0 rounded-full p-1 transition-colors disabled:opacity-50",
              isOwn
                ? "text-text-inverse/70 hover:text-text-inverse"
                : "text-text-muted hover:text-text-primary",
            )}
            aria-label={t("chat:file.download")}
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // ─ Generic file card (PDF, documents, etc.) ─

  return (
    <div
      className={clsx(
        "group/file flex min-w-0 max-w-full items-center gap-3 rounded-lg p-3 transition-colors",
        isOwn
          ? "bg-surface/20 hover:bg-surface/25"
          : "bg-surface-overlay hover:bg-surface-hover",
        className,
      )}
    >
      {/* Icon */}
      <div
        className={clsx(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          isOwn ? "bg-surface/25" : "bg-surface",
        )}
      >
        <FileTypeIcon type={iconType} />
      </div>

      {/* File info */}
      <div className="min-w-0 flex-1">
        <p
          className={clsx(
            "truncate text-sm font-medium",
            isOwn ? "text-text-inverse" : "text-text-primary",
          )}
          title={attachment.fileName}
        >
          {attachment.fileName || t("chat:file.unknown")}
        </p>
        <p
          className={clsx(
            "text-xs",
            isOwn ? "text-text-inverse/70" : "text-text-muted",
          )}
        >
          {size}
          {extension ? ` · ${extension}` : ""}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex shrink-0 items-center gap-1">
        {isPreviewable && onPreview && (
          <button
            type="button"
            onClick={handlePreview}
            className={clsx(
              "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
              "opacity-0 group-hover/file:opacity-100 focus:opacity-100",
              isOwn
                ? "bg-surface/25 text-text-inverse hover:bg-surface/40"
                : "bg-surface text-text-secondary hover:bg-surface-raised hover:text-text-primary",
            )}
            aria-label={t("chat:filePreview.preview", {
              defaultValue: "Preview",
            })}
          >
            <EyeIcon className="h-4 w-4" />
          </button>
        )}

        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={isDownloading}
          className={clsx(
            "flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            isOwn
              ? "bg-surface/25 text-text-inverse hover:bg-surface/40"
              : "bg-surface text-text-secondary hover:bg-surface-raised hover:text-text-primary",
          )}
          aria-label={t("chat:file.download")}
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export const FileMessageCard = React.memo(FileMessageCardComponent);

export default FileMessageCard;
