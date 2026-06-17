/**
 * @fileoverview PdfPreview - PDF file preview component with page navigation.
 * Uses iframe/object for rendering with navigation controls.
 */

import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { IconButton } from "../ui";
import { DocumentTextIcon } from "@heroicons/react/24/outline";
import { formatFileSize, getFileExtension } from "../../utils/filePreviewUtils";
import { downloadResourceWithName } from "../../utils/downloadFile";
import { FileTypeIcon } from "../message/FileTypeIcon";

interface PdfPreviewProps {
  url: string;
  fileName: string;
  fileSize?: number;
  className?: string;
}

export const PdfPreview: React.FC<PdfPreviewProps> = ({
  url,
  fileName,
  fileSize,
  className,
}) => {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const handleDownload = useCallback(async () => {
    await downloadResourceWithName(url, fileName || "document.pdf");
  }, [fileName, url]);

  const handleOpenInNewTab = useCallback(() => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, [url]);

  const handlePrevPage = useCallback(() => {
    if (currentPage > 1) {
      setCurrentPage((p) => p - 1);
      setIsLoading(true);
    }
  }, [currentPage]);

  const handleNextPage = useCallback(() => {
    if (totalPages === null || currentPage < totalPages) {
      setCurrentPage((p) => p + 1);
      setIsLoading(true);
    }
  }, [currentPage, totalPages]);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
  }, []);

  const handleError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
  }, []);

  const handlePageCount = useCallback((event: React.SyntheticEvent<HTMLIFrameElement>) => {
    const iframe = event.currentTarget;
    try {
      if (typeof iframe.contentWindow?.document !== "undefined") {
        const pageCount = iframe.contentWindow.document.body.dataset.pageCount;
        if (pageCount) {
          setTotalPages(parseInt(pageCount, 10));
        }
      }
    } catch {
      // Cross-origin access denied, can't read page count
    }
  }, []);

  const extension = getFileExtension(fileName);

  const pdfUrl = totalPages
    ? `${url}#page=${currentPage}`
    : url;

  return (
    <div
      className={clsx(
        "flex h-[85vh] w-[92vw] max-w-5xl flex-col rounded-xl bg-surface",
        className,
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
            <FileTypeIcon type="pdf" className="h-5 w-5 text-red-500" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary" title={fileName}>
              {fileName}
            </p>
            <p className="text-xs text-text-muted">
              {formatFileSize(fileSize)} · {extension}
              {totalPages && ` · ${totalPages} pages`}
            </p>
          </div>
        </div>

        {/* Page navigation */}
        {totalPages !== null && totalPages > 1 && (
          <div className="flex items-center gap-2">
            <IconButton
              icon={<ChevronLeftIcon className="h-5 w-5" />}
              onClick={handlePrevPage}
              disabled={currentPage <= 1}
              variant="ghost"
              aria-label={t("chat:filePreview.previousPage")}
            />
            <span className="min-w-[60px] text-center text-sm text-text-secondary">
              {currentPage} / {totalPages}
            </span>
            <IconButton
              icon={<ChevronRightIcon className="h-5 w-5" />}
              onClick={handleNextPage}
              disabled={currentPage >= totalPages}
              variant="ghost"
              aria-label={t("chat:filePreview.nextPage")}
            />
          </div>
        )}
      </div>

      {/* PDF Viewer */}
      <div className="relative flex-1 overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-overlay">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-text-muted">
                {t("chat:filePreview.loading", { defaultValue: "Loading preview..." })}
              </p>
            </div>
          </div>
        )}

        {hasError ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center">
              <DocumentTextIcon className="h-16 w-16 text-text-muted" />
              <p className="text-sm text-text-secondary">
                {t("chat:filePreview.pdfRenderError", {
                  defaultValue: "Failed to render PDF. Please open in a new tab.",
                })}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleOpenInNewTab}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary-hover"
                >
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  {t("chat:filePreview.openInNewTab", { defaultValue: "Open in new tab" })}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  {t("chat:file.download")}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <iframe
            key={pdfUrl}
            src={pdfUrl}
            className="h-full w-full border-0 bg-white"
            title={fileName || "PDF Preview"}
            sandbox="allow-same-origin allow-popups"
            onLoad={(e) => {
              handleLoad();
              handlePageCount(e);
            }}
            onError={handleError}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between border-t border-border px-4 py-2">
        <p className="text-xs text-text-muted">
          {t("chat:filePreview.pdfFooter", {
            defaultValue: "Use browser controls to zoom or scroll",
          })}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            {t("chat:file.download")}
          </button>
          <button
            type="button"
            onClick={handleOpenInNewTab}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover"
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            {t("chat:filePreview.openInNewTab", { defaultValue: "Open in new tab" })}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PdfPreview;
