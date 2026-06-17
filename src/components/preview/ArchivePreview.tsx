/**
 * @fileoverview ArchivePreview - Fallback preview for archive files.
 * Shows archive info with icon, metadata, and download option.
 * Does NOT attempt to extract or preview archive contents for security.
 */

import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { formatFileSize, getFileExtension } from "../../utils/filePreviewUtils";
import {
  downloadResourceWithName,
  openResourceInNewTab,
} from "../../utils/downloadFile";
import { FileTypeIcon } from "../message/FileTypeIcon";

interface ArchivePreviewProps {
  url: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  isOwn?: boolean;
  className?: string;
}

const ARCHIVE_LARGE_SIZE_THRESHOLD = 50 * 1024 * 1024; // 50MB

const getArchiveDescription = (mimeType?: string): string => {
  if (!mimeType) return "Archive";

  if (mimeType.includes("zip")) return "ZIP Archive";
  if (mimeType.includes("7z") || mimeType.includes("x-7z")) return "7-Zip Archive";
  if (mimeType.includes("rar")) return "RAR Archive";

  return "Archive";
};

const isLargeArchive = (fileSize?: number): boolean => {
  if (!fileSize) return false;
  return fileSize > ARCHIVE_LARGE_SIZE_THRESHOLD;
};

export const ArchivePreview: React.FC<ArchivePreviewProps> = ({
  url,
  fileName,
  fileSize,
  mimeType,
  isOwn,
  className,
}) => {
  const { t } = useTranslation();

  const handleDownload = useCallback(async () => {
    await downloadResourceWithName(url, fileName || "archive");
  }, [fileName, url]);

  const handleOpenInNewTab = useCallback(() => {
    openResourceInNewTab(url, fileName, false);
  }, [fileName, url]);

  const extension = getFileExtension(fileName);
  const archiveDescription = getArchiveDescription(mimeType);
  const largeArchive = isLargeArchive(fileSize);

  return (
    <div
      className={clsx(
        "w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-border/70 bg-surface p-5",
        isOwn && "border-[hsl(var(--chat-bubble-sent-text))/0.15] bg-[hsl(var(--chat-bubble-sent-text))/0.08]",
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-yellow-500/10">
          <FileTypeIcon type="archive" className="h-6 w-6 text-yellow-600" />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium text-text-primary" title={fileName}>
            {fileName}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
            {extension && (
              <span className="rounded-full border border-border px-2 py-0.5 uppercase">
                {extension}
              </span>
            )}
            <span>{formatFileSize(fileSize)}</span>
            <span>{archiveDescription}</span>
          </div>
        </div>
      </div>

      {/* Large file warning */}
      {largeArchive && (
        <div className="mt-4 flex items-start gap-3 rounded-lg bg-warning/10 p-3">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-medium text-warning">
              {t("chat:filePreview.largeArchive", { defaultValue: "Large archive file" })}
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              {t("chat:filePreview.largeArchiveNotice", {
                defaultValue: "Download may take some time depending on your connection speed.",
              })}
            </p>
          </div>
        </div>
      )}

      {/* Security notice */}
      <div className="mt-4 rounded-lg bg-surface-overlay p-3">
        <p className="text-sm text-text-secondary">
          {t("chat:filePreview.archiveNotice", {
            defaultValue: "Archive contents cannot be previewed for security reasons.",
          })}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          {t("chat:filePreview.archiveSuggestion", {
            defaultValue: "Download and extract using your preferred archive tool.",
          })}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleDownload()}
          className={clsx(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            "bg-primary text-text-inverse hover:bg-primary-hover",
          )}
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          {t("chat:file.download")}
        </button>
        <button
          type="button"
          onClick={handleOpenInNewTab}
          className={clsx(
            "flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors",
            "text-text-secondary hover:bg-surface-hover",
          )}
        >
          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          {t("chat:filePreview.openInNewTab", { defaultValue: "Open in new tab" })}
        </button>
      </div>
    </div>
  );
};

export default ArchivePreview;
