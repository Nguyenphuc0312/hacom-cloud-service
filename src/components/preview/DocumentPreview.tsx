/**
 * @fileoverview DocumentPreview - In-browser preview for office documents.
 *
 * Word / Excel / PowerPoint are rendered with the Microsoft Office Online
 * viewer (iframe) when the file is served from a publicly reachable URL —
 * Microsoft's servers fetch the file directly, so the signed/public storage
 * URL must be absolute http(s) and not a localhost address.
 *
 * When the file is not publicly reachable (e.g. local dev) we fall back to a
 * download / open-in-new-tab card.
 */

import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import type { PreviewType } from "../../utils/mimeRegistry";
import { formatFileSize, getFileExtension } from "../../utils/filePreviewUtils";
import { FileTypeIcon } from "../message/FileTypeIcon";
import {
  downloadResourceWithName,
  openResourceInNewTab,
} from "../../utils/downloadFile";

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

/**
 * Whether a URL can be fetched by Microsoft's Office Online viewer:
 * must be an absolute http(s) URL that isn't a localhost / private address.
 */
const isPubliclyViewableUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host.endsWith(".local")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

const buildOfficeViewerUrl = (fileUrl: string): string =>
  `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(fileUrl)}`;

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
  const [iframeFailed, setIframeFailed] = useState(false);

  const handleDownload = useCallback(async () => {
    await downloadResourceWithName(url, fileName || "document");
  }, [fileName, url]);

  // Office docs không render trực tiếp trong tab trình duyệt → mở tab mới chỉ tải
  // về với tên sai; thay bằng tải về giữ đúng tên gốc.
  const handleOpenInNewTab = useCallback(() => {
    openResourceInNewTab(url, fileName, false);
  }, [fileName, url]);

  const extension = getFileExtension(fileName);
  const docDescription = getDocumentDescription(mimeType);
  const iconType = getDocumentIconType(previewType);
  const colorClass = getDocumentColorClass(previewType);

  const canEmbed = useMemo(
    () => Boolean(url) && isPubliclyViewableUrl(url),
    [url],
  );
  const viewerUrl = useMemo(
    () => (canEmbed ? buildOfficeViewerUrl(url) : null),
    [canEmbed, url],
  );

  // ── In-browser viewer (Microsoft Office Online) ──────────────────────
  if (viewerUrl && !iframeFailed) {
    return (
      <div
        className={clsx(
          "flex h-[calc(85vh/var(--app-zoom,1))] w-[min(72rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-text-inverse/12 bg-surface",
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-surface-overlay px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className={clsx("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", colorClass)}>
              <FileTypeIcon type={iconType} className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text-primary" title={fileName}>
                {fileName}
              </p>
              <p className="truncate text-xs text-text-muted">
                {[extension?.toUpperCase(), formatFileSize(fileSize), docDescription]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void handleDownload()}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              {t("chat:file.download")}
            </button>
            <button
              type="button"
              onClick={handleOpenInNewTab}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover"
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              {t("chat:filePreview.openInNewTab", { defaultValue: "Open in new tab" })}
            </button>
          </div>
        </div>

        {/* Viewer */}
        <iframe
          src={viewerUrl}
          title={fileName || "document preview"}
          className="min-h-0 w-full flex-1 border-0 bg-white"
          onError={() => setIframeFailed(true)}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads"
        />
      </div>
    );
  }

  // ── Fallback card (not publicly reachable / viewer unavailable) ───────
  return (
    <div
      className={clsx(
        "w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-border/70 bg-surface p-5",
        isOwn && "border-[hsl(var(--chat-bubble-sent-text))/0.15] bg-[hsl(var(--chat-bubble-sent-text))/0.08]",
        className,
      )}
      onClick={(event) => event.stopPropagation()}
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
    </div>
  );
};

export default DocumentPreview;
