import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ArrowPathIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  VideoCameraIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

interface AttachmentPreviewProps {
  selectedFile: File;
  previewUrl: string | null;
  uploadProgress: number;
  uploadError: string | null;
  isUploading: boolean;
  maxFileSizeBytes: number;
  onCancelUpload: () => void;
  onRetryUpload: () => void;
  onSendNow: () => void;
  onRemove: () => void;
}

const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / 1024 ** exponent;
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[exponent]}`;
};

export const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({
  selectedFile,
  previewUrl,
  uploadProgress,
  uploadError,
  isUploading,
  maxFileSizeBytes,
  onCancelUpload,
  onRetryUpload,
  onSendNow,
  onRemove,
}) => {
  const { t } = useTranslation();

  return (
    <div className="border-b border-border bg-surface-overlay px-4 py-2">
      <div className="flex items-start gap-2">
        {previewUrl && selectedFile.type.startsWith("image/") ? (
          <img
            src={previewUrl}
            alt={t("chat:composer.filePreviewAlt")}
            className="h-12 w-12 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-surface">
            {selectedFile.type.startsWith("video/") ? (
              <VideoCameraIcon className="h-5 w-5 text-text-muted" />
            ) : (
              <DocumentTextIcon className="h-5 w-5 text-text-muted" />
            )}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">{selectedFile.name}</p>
          <p className="text-xs text-text-muted">
            {formatFileSize(selectedFile.size)} -{" "}
            {t("chat:composer.fileSizeLimit", { size: formatFileSize(maxFileSizeBytes) })}
          </p>

          {isUploading ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-text-muted">
                {t("chat:composer.uploading")} {uploadProgress}%
              </span>
              <progress value={uploadProgress} max={100} className="h-1.5 w-24" />
              <button
                type="button"
                onClick={onCancelUpload}
                className="text-xs text-text-secondary underline transition-colors hover:text-text-primary"
              >
                {t("chat:composer.cancelUpload")}
              </button>
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              {uploadError ? (
                <>
                  <span
                    className={clsx(
                      "inline-flex items-center gap-1 text-xs text-danger",
                      "max-w-full truncate",
                    )}
                    role="alert"
                  >
                    <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0" />
                    {uploadError}
                  </span>
                  <button
                    type="button"
                    onClick={onRetryUpload}
                    className="inline-flex items-center gap-1 text-xs text-danger underline transition-colors hover:text-danger-hover"
                  >
                    <ArrowPathIcon className="h-3.5 w-3.5" />
                    {t("chat:composer.retryUpload")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={onSendNow}
                  className="text-xs text-primary underline transition-colors hover:text-primary-hover"
                >
                  {t("chat:composer.sendFile")}
                </button>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onRemove}
          className={clsx(
            "rounded-full p-1 transition-colors hover:bg-surface-active",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
          )}
          aria-label={t("chat:composer.removeFile")}
        >
          <XMarkIcon className="h-4 w-4 text-text-muted" />
        </button>
      </div>
    </div>
  );
};

export default AttachmentPreview;
