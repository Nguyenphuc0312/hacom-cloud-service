/**
 * @fileoverview ImageFileAttachment - Image sent as file attachment (not inline).
 *
 * Features:
 * - Shows thumbnail + file info
 * - Similar to DocumentAttachment but with image preview
 * - Two action buttons: preview (lightbox) and download
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ArrowDownTrayIcon,
  EyeIcon,
  FolderOpenIcon,
} from "@heroicons/react/24/outline";
import type { Attachment } from "../../types";
import { useAttachmentDownloadUrl } from "../../hooks";
import { useInViewport } from "../../hooks/useInViewport";
import { formatFileSize } from "../../utils/formatFileSize";
import { FileProgress } from "./FileProgress";
import { FileStatus } from "./FileStatus";
import { truncateFilename } from "../../utils/truncateFilename";

interface ImageFileAttachmentProps {
  conversationId: string;
  attachment: Attachment;
  isOwn: boolean;
  onPreview?: (attachment: Attachment) => void;
  /** Upload progress (0-100) */
  uploadProgress?: number;
  className?: string;
}

export const ImageFileAttachment: React.FC<ImageFileAttachmentProps> = ({
  conversationId,
  attachment,
  isOwn,
  onPreview,
  uploadProgress,
  className,
}) => {
  const { t } = useTranslation();
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "loading" | "done" | "failed">("idle");
  const [showFullScreen, setShowFullScreen] = useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const isVisible = useInViewport(rootRef, { rootMargin: "240px 0px" });

  const { url: thumbnailUrl, isLoading: isLoadingThumb, resolveUrl: resolveThumbnailUrl } = useAttachmentDownloadUrl(
    conversationId,
    attachment,
    { autoResolve: false },
  );

  const { resolveUrl: resolveDownloadUrl, isLoading: isDownloading } = useAttachmentDownloadUrl(
    conversationId,
    attachment,
  );

  // Resolve thumbnail when visible
  useMemo(() => {
    if (isVisible && !thumbnailUrl && !isLoadingThumb) {
      void resolveThumbnailUrl();
    }
  }, [isVisible, thumbnailUrl, isLoadingThumb, resolveThumbnailUrl]);

  const fileName = attachment.fileName || t("chat:file.unknown", { defaultValue: "Unknown file" });
  const fileSize = formatFileSize(attachment.fileSize);
  const isUploading = uploadProgress !== undefined && uploadProgress < 100;

  const handleDownload = useCallback(async () => {
    setDownloadStatus("loading");
    try {
      const url = await resolveDownloadUrl(true);
      if (!url) {
        setDownloadStatus("failed");
        return;
      }

      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setDownloadStatus("done");
    } catch {
      setDownloadStatus("failed");
    }
  }, [resolveDownloadUrl, fileName]);

  const handlePreview = useCallback(() => {
    if (onPreview) {
      onPreview(attachment);
    } else {
      // Show lightbox
      setShowFullScreen(true);
    }
  }, [onPreview, attachment]);

  const handleClose = useCallback(() => {
    setShowFullScreen(false);
  }, []);

  // ESC to close lightbox + body scroll lock
  useEffect(() => {
    if (!showFullScreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [showFullScreen, handleClose]);

  const textColor = isOwn ? "text-[hsl(var(--chat-bubble-sent-text))]" : "text-text-primary";
  const secondaryTextColor = isOwn
    ? "text-[hsl(var(--chat-bubble-sent-text))/0.7]"
    : "text-text-muted";

  return (
    <>
      <div
        ref={rootRef}
        className={clsx(
          "group/file w-[min(20rem,100%)] min-w-0 rounded-xl border p-3 transition-colors",
          isOwn
            ? "border-[hsl(var(--chat-bubble-sent-text))/0.15] bg-[hsl(var(--chat-bubble-sent-text))/0.08] hover:bg-[hsl(var(--chat-bubble-sent-text))/0.12]"
            : "border-border/70 bg-surface hover:bg-surface-hover",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          {/* Thumbnail */}
          <div className="shrink-0">
            <div
              className="relative h-12 w-12 overflow-hidden rounded-lg bg-surface-overlay"
            >
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt={fileName}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              )}
            </div>
          </div>

          {/* File info */}
          <div className="min-w-0 flex-1">
            <p className={clsx("truncate text-sm font-medium", textColor)} title={fileName}>
              {truncateFilename(fileName, 32)}
            </p>
            <p className={clsx("text-xs", secondaryTextColor)}>{fileSize}</p>

            {/* Upload progress */}
            {isUploading && (
              <div className="mt-2">
                <FileProgress progress={uploadProgress} isLoading={true} />
              </div>
            )}

            {/* Download status */}
            {!isUploading && downloadStatus !== "idle" && (
              <div className="mt-1">
                <FileStatus
                  status={downloadStatus === "done" ? "downloaded" : downloadStatus === "failed" ? "failed" : "loading"}
                  progress={downloadStatus === "loading" ? 50 : undefined}
                  isOwn={isOwn}
                />
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex shrink-0 gap-1">
            {/* Preview button */}
            <button
              type="button"
              onClick={handlePreview}
              className={clsx(
                "flex h-8 w-8 items-center justify-center rounded-full transition-all",
                "opacity-0 group-hover/file:opacity-100 focus:opacity-100",
                isOwn
                  ? "bg-[hsl(var(--chat-bubble-sent-text))/0.15] text-[hsl(var(--chat-bubble-sent-text))] hover:bg-[hsl(var(--chat-bubble-sent-text))/0.25]"
                  : "bg-surface-overlay text-text-secondary hover:bg-surface-hover hover:text-text-primary",
              )}
              aria-label={t("chat:filePreview.preview", { defaultValue: "Preview" })}
            >
              <EyeIcon className="h-4 w-4" />
            </button>

            {/* Download button */}
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              className={clsx(
                "flex h-8 w-8 items-center justify-center rounded-full transition-all",
                isOwn
                  ? "bg-[hsl(var(--chat-bubble-sent-text))/0.15] text-[hsl(var(--chat-bubble-sent-text))] hover:bg-[hsl(var(--chat-bubble-sent-text))/0.25]"
                  : "bg-surface-overlay text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
              aria-label={t("chat:file.download", { defaultValue: "Tải về" })}
            >
              {isDownloading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : downloadStatus === "done" ? (
                <FolderOpenIcon className="h-4 w-4" />
              ) : (
                <ArrowDownTrayIcon className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox — portal so fixed always anchors to viewport regardless of parent transforms */}
      {showFullScreen && thumbnailUrl && createPortal(
        <div
          className="fixed inset-0 flex flex-col"
          style={{ zIndex: "var(--hc-z-overlay)", backgroundColor: "rgba(0, 0, 0, 0.92)" }}
          onClick={handleClose}
        >
          {/* Toolbar */}
          <div
            className="flex h-14 shrink-0 items-center justify-between gap-3 px-4"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.35)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="min-w-0 truncate text-sm font-medium text-white/70" title={fileName}>
              {fileName}
            </span>
            {/* Close — circular bg for visibility against any image color */}
            <button
              type="button"
              onClick={handleClose}
              aria-label={t("common:actions.close")}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 active:bg-white/35"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Image */}
          <div
            className="flex min-h-0 flex-1 items-center justify-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={thumbnailUrl}
              alt={fileName}
              className="max-h-[calc(100dvh-96px)] max-w-[calc(100vw-32px)] select-none object-contain"
              draggable={false}
            />
          </div>
          <div className="flex h-9 shrink-0 items-center justify-center">
            <span className="text-xs text-white/30">
              {t("common:hint.escToClose", { defaultValue: "ESC / click ngoài để đóng" })}
            </span>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

export default ImageFileAttachment;
