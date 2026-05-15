/**
 * @fileoverview DocumentPreview - Fallback preview for office documents.
 * Shows document info with icon, metadata, and download option.
 * Designed to be extensible for future backend document-to-PDF conversion.
 */

import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import type { PreviewType } from "../../utils/mimeRegistry";
import { formatFileSize, getFileExtension } from "../../utils/filePreviewUtils";
import { FileTypeIcon } from "../message/FileTypeIcon";

interface DocumentPreviewProps {
  url: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  previewType: PreviewType;
  isOwn?: boolean;
  className?: string;
}

const getDocumentIconType = (previewType: PreviewType): "document" | "spreadsheet" | "presentation" => {
  switch (previewType) {
    case "spreadsheet":
      return "spreadsheet";
    case "presentation":
      return "presentation";
    case "document":
    default:
      return "document";
  }
};

const getDocumentColorClass = (previewType: PreviewType): string => {
  switch (previewType) {
    case "spreadsheet":
      return "text-green-600 bg-green-500/10";
    case "presentation":
      return "text-orange-500 bg-orange-500/10";
    case "document":
    default:
      return "text-blue-500 bg-blue-500/10";
  }
};

const getDocumentDescription = (mimeType?: string): string => {
  if (!mimeType) return "";

  if (mimeType.includes("wordprocessingml")) return "Microsoft Word";
  if (mimeType.includes("spreadsheetml")) return "Microsoft Excel";
  if (mimeType.includes("presentationml")) return "Microsoft PowerPoint";
  if (mimeType.includes("msword")) return "Microsoft Word";
  if (mimeType.includes("msexcel")) return "Microsoft Excel";
  if (mimeType.includes("mspowerpoint")) return "Microsoft PowerPoint";
  if (mimeType.includes("opendocument.text")) return "OpenDocument Text";
  if (mimeType.includes("opendocument.spreadsheet")) return "OpenDocument Spreadsheet";
  if (mimeType.includes("opendocument.presentation")) return "OpenDocument Presentation";

  return "";
};

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({
  url,
  fileName,
  fileSize,
  mimeType,
  previewType,
  isOwn,
  className,
}) => {
  const { t } = useTranslation();

  const handleDownload = useCallback(async () => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName || "document";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, [fileName, url]);

  const handleOpenInNewTab = useCallback(() => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, [url]);

  const extension = getFileExtension(fileName);
  const docDescription = getDocumentDescription(mimeType);
  const iconType = getDocumentIconType(previewType);
  const colorClass = getDocumentColorClass(previewType);

  return (
    <div
      className={clsx(
        "w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-border/70 bg-surface p-5",
        isOwn && "border-[hsl(var(--chat-bubble-sent-text))/0.15] bg-[hsl(var(--chat-bubble-sent-text))/0.08]",
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <div className={clsx("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", colorClass)}>
          <FileTypeIcon type={iconType} className="h-6 w-6" />
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
            {docDescription && <span>{docDescription}</span>}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-surface-overlay p-3">
        <p className="text-sm text-text-secondary">
          {t("chat:filePreview.documentNotice", {
            defaultValue: "Preview is not available for this file type.",
          })}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          {t("chat:filePreview.documentSuggestion", {
            defaultValue: "Download the file to open it in your preferred application.",
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

      {/* Future: Integration point for document preview service */}
      {/* <div className="mt-4 border-t border-border pt-4"> */}
      {/*   <p className="text-xs text-text-muted"> */}
      {/*     {t("chat:filePreview.comingSoon", { defaultValue: "Document preview coming soon" })} */}
      {/*   </p> */}
      {/* </div> */}
    </div>
  );
};

export default DocumentPreview;
