/**
 * @fileoverview DocumentAttachment - Zalo-style document message component.
 *
 * Features:
 * - 36x36px colored file type badge
 * - Truncated filename with ellipsis in middle
 * - File size + type metadata
 * - Progress bar during upload/download
 * - Status indicator
 * - Download button
 * - Max width 320px (280px on mobile)
 */

import React, { useCallback, useMemo, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ArrowDownTrayIcon,
  FolderOpenIcon,
  EyeIcon,
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
} from "@heroicons/react/24/outline";
import type { Attachment } from "../../types";
import type { PreviewType } from "../../utils/formatFileSize";
import { formatFileSize } from "../../utils/formatFileSize";
import { useAttachmentDownloadUrl } from "../../hooks";
import { FileTypeIconV2 } from "./FileTypeIconV2";
import { FileProgress } from "./FileProgress";
import { FileStatus, type FileStatusType } from "./FileStatus";
import {
  getPreviewType,
  isFileTooLargeForPreview,
  getFileExtension,
} from "../../utils/formatFileSize";
import { truncateFilename } from "../../utils/truncateFileName";

interface DocumentAttachmentProps {
  conversationId: string;
  attachment: Attachment;
  isOwn: boolean;
  /** Called when user wants to preview the file */
  onPreview?: (attachment: Attachment, previewType: PreviewType) => void;
  /** Upload progress (0-100), undefined means no upload in progress */
  uploadProgress?: number;
  /** Download progress (0-100), undefined means no download in progress */
  downloadProgress?: number;
  className?: string;
}

type DisplayStatus = FileStatusType | "scanning" | "blocked" | "deleted";

export const DocumentAttachment: React.FC<DocumentAttachmentProps> = ({
  conversationId,
  attachment,
  isOwn,
  onPreview,
  uploadProgress,
  downloadProgress,
  className,
}) => {
  const { t } = useTranslation();
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  // Determine display status
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "loading" | "done" | "failed">("idle");
  const [localDownloadProgress, setLocalDownloadProgress] = useState(0);

  // Resolve download URL
  const { resolveUrl, isLoading: isDownloading } = useAttachmentDownloadUrl(
    conversationId,
    attachment,
  );

  // File info
  const fileName = attachment.fileName || t("chat:file.unknown", { defaultValue: "Unknown file" });
  const fileSize = formatFileSize(attachment.fileSize);
  const fileExtension = getFileExtension(fileName);
  const previewType = getPreviewType(attachment.mimeType, attachment.fileName);
  const isPreviewable = previewType !== "unknown" &&
    previewType !== "archive" &&
    !isFileTooLargeForPreview(attachment.fileSize);

  // Determine status
  const isUploading = uploadProgress !== undefined && uploadProgress < 100;
  const isDownloadingFile = isDownloading || downloadStatus === "loading";
  const effectiveDownloadProgress = downloadProgress ?? localDownloadProgress;

  const displayStatus: DisplayStatus = useMemo(() => {
    if (isUploading) return "loading";
    if (isDownloadingFile) return "loading";
    if (downloadStatus === "failed") return "failed";
    if (downloadStatus === "done") return "downloaded";
    // Check if we have a download URL - means it's on cloud
    if (attachment.downloadUrl || attachment.url) return "cloud";
    return "ready";
  }, [isUploading, isDownloadingFile, downloadStatus, attachment.downloadUrl, attachment.url]);

  // Handle download
  const handleDownload = useCallback(async () => {
    setDownloadStatus("loading");
    setLocalDownloadProgress(0);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setLocalDownloadProgress((prev) => Math.min(prev + 10, 90));
    }, 200);

    try {
      const downloadUrl = await resolveUrl(true);
      clearInterval(progressInterval);

      if (!downloadUrl) {
        setDownloadStatus("failed");
        return;
      }

      setLocalDownloadProgress(100);

      // Trigger download
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = fileName;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setDownloadStatus("done");
    } catch {
      clearInterval(progressInterval);
      setDownloadStatus("failed");
    }
  }, [resolveUrl, fileName]);

  // Handle preview
  const handlePreview = useCallback(() => {
    if (onPreview && isPreviewable) {
      onPreview(attachment, previewType as PreviewType);
    }
  }, [onPreview, isPreviewable, attachment, previewType]);

  // Handle retry
  const handleRetry = useCallback(() => {
    setDownloadStatus("idle");
    setLocalDownloadProgress(0);
    void handleDownload();
  }, [handleDownload]);

  // Edge case: deleted
  if ((attachment as unknown as Record<string, unknown>).status === "deleted") {
    return (
      <div
        className={clsx(
          "flex items-center gap-3 rounded-xl p-3 opacity-60",
          isOwn ? "bg-[hsl(var(--chat-bubble-sent-text))/0.08]" : "bg-surface-overlay",
          className,
        )}
      >
        <ExclamationTriangleIcon className="h-8 w-8 shrink-0 text-text-muted" />
        <span className="text-sm italic text-text-muted">
          {t("chat:filePreview.deleted", { defaultValue: "This file has been deleted" })}
        </span>
      </div>
    );
  }

  // Edge case: blocked
  if ((attachment as unknown as Record<string, unknown>).status === "blocked") {
    return (
      <div
        className={clsx(
          "flex items-center gap-3 rounded-xl border border-danger/30 p-3",
          isOwn ? "bg-danger/10" : "bg-danger/5",
          className,
        )}
      >
        <ShieldExclamationIcon className="h-8 w-8 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-danger">
            {t("chat:filePreview.blocked", { defaultValue: "File blocked — potential threat detected" })}
          </p>
          <p className="text-xs text-text-muted">{fileName}</p>
        </div>
      </div>
    );
  }

  // Edge case: scanning
  if ((attachment as unknown as Record<string, unknown>).status === "scanning") {
    return (
      <div
        className={clsx(
          "flex items-center gap-3 rounded-xl p-3",
          isOwn ? "bg-[hsl(var(--chat-bubble-sent-text))/0.08]" : "bg-surface-overlay",
          className,
        )}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">{fileName}</p>
          <p className="text-xs text-text-muted">
            {t("chat:filePreview.scanning", { defaultValue: "Scanning..." })}
          </p>
        </div>
      </div>
    );
  }

  const textColor = isOwn ? "text-[hsl(var(--chat-bubble-sent-text))]" : "text-text-primary";
  const secondaryTextColor = isOwn
    ? "text-[hsl(var(--chat-bubble-sent-text))/0.7]"
    : "text-text-muted";

  return (
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
        {/* File Type Badge */}
        <div className="shrink-0">
          <FileTypeIconV2
            mimeType={attachment.mimeType}
            fileName={attachment.fileName}
            size="lg"
          />
        </div>

        {/* File Info */}
        <div className="min-w-0 flex-1">
          {/* File name - truncated in middle */}
          <p
            className={clsx(
              "truncate text-sm font-medium",
              textColor,
            )}
            title={fileName}
          >
            {truncateFilename(fileName, 32)}
          </p>

          {/* File size + type */}
          <p className={clsx("text-xs", secondaryTextColor)}>
            {fileSize}
            {fileExtension && ` · ${fileExtension}`}
          </p>

          {/* Progress bar (only when loading) */}
          {(isUploading || isDownloadingFile) && (
            <div className="mt-2">
              <FileProgress
                progress={isUploading ? uploadProgress! : effectiveDownloadProgress}
                isLoading={true}
              />
            </div>
          )}

          {/* Status indicator */}
          {displayStatus !== "cloud" && displayStatus !== "ready" && !isUploading && !isDownloadingFile && displayStatus !== "downloaded" && (
            <div className="mt-1">
              <FileStatus
                status={displayStatus === "failed" ? "failed" : displayStatus === "loading" ? "loading" : "ready"}
                isOwn={isOwn}
                onRetry={displayStatus === "failed" ? handleRetry : undefined}
              />
            </div>
          )}
          {displayStatus === "downloaded" && (
            <div className="mt-1">
              <FileStatus
                status="downloaded"
                isOwn={isOwn}
              />
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          {/* Preview button */}
          {isPreviewable && onPreview && (
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
          )}

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
  );
};

export default DocumentAttachment;
