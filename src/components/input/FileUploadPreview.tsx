/**
 * @fileoverview FileUploadPreview - Multi-file upload preview component.
 *
 * Features:
 * - Preview multiple files before sending
 * - Show thumbnail for images, icon for other files
 * - File name + size display
 * - Progress bar during upload
 * - Remove individual files
 * - Caption input
 * - Send button
 */

import React, { useCallback, useMemo } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  XMarkIcon,
  PaperAirplaneIcon,
  DocumentTextIcon,
  VideoCameraIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import { formatFileSize } from "../../utils/formatFileSize";
import { isImageFile } from "../../utils/fileCategoryUtils";

interface UploadFile {
  id: string;
  file: File;
  previewUrl?: string;
  uploadProgress?: number;
  uploadError?: string | null;
  isUploading?: boolean;
}

interface FileUploadPreviewProps {
  files: UploadFile[];
  caption?: string;
  onCaptionChange?: (caption: string) => void;
  onRemoveFile: (fileId: string) => void;
  onSend: () => void;
  onCancel: () => void;
  isSending?: boolean;
  className?: string;
}

export const FileUploadPreview: React.FC<FileUploadPreviewProps> = ({
  files,
  caption,
  onCaptionChange,
  onRemoveFile,
  onSend,
  onCancel,
  isSending = false,
  className,
}) => {
  const { t } = useTranslation();

  const hasFiles = files.length > 0;

  // Group files: images first, then others
  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      const aIsImage = isImageFile(a.file.type, a.file.name);
      const bIsImage = isImageFile(b.file.type, b.file.name);
      if (aIsImage && !bIsImage) return -1;
      if (!aIsImage && bIsImage) return 1;
      return 0;
    });
  }, [files]);

  // Any file is uploading
  const hasUploadingFiles = files.some(f => f.isUploading);
  // Any file has error
  const hasError = files.some(f => f.uploadError);

  // Can send: has files and none are currently uploading or have errors
  const canSend = hasFiles && !hasUploadingFiles && !hasError;

  const handleCaptionChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onCaptionChange?.(e.target.value);
    },
    [onCaptionChange],
  );

  const handleSend = useCallback(() => {
    if (canSend) {
      onSend();
    }
  }, [canSend, onSend]);

  // Keyboard shortcut: Enter to send
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && canSend) {
        e.preventDefault();
        handleSend();
      } else if (e.key === "Escape") {
        onCancel();
      }
    },
    [canSend, handleSend, onCancel],
  );

  if (!hasFiles) {
    return null;
  }

  return (
    <div
      className={clsx(
        "border-b border-border bg-surface-overlay",
        className,
      )}
      onKeyDown={handleKeyDown}
    >
      <div className="max-h-64 overflow-y-auto p-3">
        {/* File list */}
        <div className="space-y-2">
          {sortedFiles.map((file) => (
            <FileUploadItem
              key={file.id}
              file={file}
              onRemove={() => onRemoveFile(file.id)}
            />
          ))}
        </div>
      </div>

      {/* Caption + Send bar */}
      <div className="flex items-center gap-2 border-t border-border p-3">
        {/* Caption input */}
        <input
          type="text"
          value={caption || ""}
          onChange={handleCaptionChange}
          placeholder={t("chat:composer.addCaption", { defaultValue: "Thêm chú thích..." })}
          className={clsx(
            "min-w-0 flex-1 bg-transparent text-sm",
            "placeholder:text-text-muted",
            "focus:outline-none",
          )}
          disabled={isSending}
        />

        {/* Cancel button */}
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full p-2 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
          aria-label={t("common:actions.cancel")}
        >
          <XMarkIcon className="h-5 w-5" />
        </button>

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend || isSending}
          className={clsx(
            "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all",
            canSend && !isSending
              ? "bg-gradient-to-r from-[#C41E3A] via-[#D32F2F] to-[#FFC857] text-white hover:brightness-105 active:scale-95"
              : "bg-surface-overlay text-text-muted cursor-not-allowed",
          )}
          aria-label={t("chat:composer.send", { defaultValue: "Gửi" })}
        >
          {isSending ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              <span>{t("chat:composer.sending", { defaultValue: "Đang gửi..." })}</span>
            </>
          ) : (
            <>
              <PaperAirplaneIcon className="h-4 w-4" />
              <span>{t("chat:composer.send", { defaultValue: "Gửi" })}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

interface FileUploadItemProps {
  file: UploadFile;
  onRemove: () => void;
}

const FileUploadItem: React.FC<FileUploadItemProps> = ({ file, onRemove }) => {
  const { t } = useTranslation();
  const isImage = isImageFile(file.file.type, file.file.name);

  return (
    <div
      className={clsx(
        "group/file flex items-center gap-3 rounded-lg p-2 transition-colors",
        "hover:bg-surface-hover",
      )}
    >
      {/* Thumbnail or icon */}
      <div className="shrink-0">
        {isImage && file.previewUrl ? (
          <img
            src={file.previewUrl}
            alt={file.file.name}
            className="h-12 w-12 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface">
            {getFileIcon(file.file.type)}
          </div>
        )}
      </div>

      {/* File info */}
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-medium text-text-primary"
          title={file.file.name}
        >
          {file.file.name}
        </p>
        <p className="text-xs text-text-muted">
          {formatFileSize(file.file.size)}

          {file.uploadError && (
            <span className="ml-2 text-danger">— {file.uploadError}</span>
          )}
        </p>

        {/* Progress bar */}
        {file.isUploading && file.uploadProgress !== undefined && (
          <div className="mt-1.5">
            <div className="relative h-1 w-full overflow-hidden rounded-full bg-surface-overlay">
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-[#C41E3A] to-[#FFC857] transition-all duration-300"
                style={{ width: `${file.uploadProgress}%` }}
              />
            </div>
            <p className="mt-0.5 text-[10px] text-text-muted">
              {t("chat:file.uploading", { defaultValue: "Đang tải lên..." })}
              {" "}
              {Math.round(file.uploadProgress)}%
            </p>
          </div>
        )}
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        disabled={file.isUploading}
        className={clsx(
          "shrink-0 rounded-full p-1.5 transition-all",
          "opacity-0 group-hover/file:opacity-100 focus:opacity-100",
          "text-text-muted hover:bg-surface-active hover:text-danger",
          file.isUploading && "cursor-not-allowed opacity-50",
        )}
        aria-label={t("chat:composer.removeFile", { defaultValue: "Xóa file" })}
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  );
};

/**
 * Get icon for file type
 */
function getFileIcon(mimeType: string): React.ReactNode {
  if (mimeType.startsWith("video/")) {
    return <VideoCameraIcon className="h-5 w-5 text-text-muted" />;
  }
  if (mimeType.startsWith("image/")) {
    return <PhotoIcon className="h-5 w-5 text-text-muted" />;
  }
  return <DocumentTextIcon className="h-5 w-5 text-text-muted" />;
}

export default FileUploadPreview;
