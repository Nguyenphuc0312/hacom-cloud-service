/**
 * @fileoverview PDF.js viewer component for rendering PDFs in the browser.
 * Fetches PDF via XHR to bypass cross-origin iframe restrictions.
 * Renders pages on canvas for full control over the viewing experience.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { IconButton } from "../ui";
import { formatFileSize, getFileExtension } from "../../utils/filePreviewUtils";
import { FileTypeIcon } from "../message/FileTypeIcon";

interface PdfJsViewerProps {
  url: string;
  fileName: string;
  fileSize?: number;
  className?: string;
}

interface PDFDocumentWrapper {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (opts: { scale: number }) => { width: number; height: number };
    render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
  }>;
}

interface RenderedPage {
  pageNumber: number;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

const SCALE_STEP = 0.25;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;
const PAGE_PRELOAD_AHEAD = 2;
const PAGE_PRELOAD_BEHIND = 1;

// PDF.js worker configuration - loaded dynamically
let pdfjsLib: typeof import("pdfjs-dist") | null = null;

async function loadPdfJs(): Promise<typeof import("pdfjs-dist")> {
  if (pdfjsLib) return pdfjsLib;

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();
  pdfjsLib = pdfjs;
  return pdfjs;
}

export const PdfJsViewer: React.FC<PdfJsViewerProps> = ({
  url,
  fileName,
  fileSize,
  className,
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const renderQueueRef = useRef<Set<number>>(new Set());

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentWrapper | null>(null);
  const [renderedPages, setRenderedPages] = useState<Map<number, RenderedPage>>(new Map());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const extension = getFileExtension(fileName);

  // Render a single page
  // Uses queueMicrotask to defer state updates, satisfying React Compiler's effect rules
  const renderPage = useCallback((pageNumber: number, pageScale: number, doc: PDFDocumentWrapper) => {
    if (renderQueueRef.current.has(pageNumber)) return;
    renderQueueRef.current.add(pageNumber);

    queueMicrotask(async () => {
      try {
        await loadPdfJs();
        const page = await doc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: pageScale });

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas context unavailable");

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        await page.render({ canvasContext: context, viewport }).promise;

        setRenderedPages((prev) => {
          const next = new Map(prev);
          next.set(pageNumber, {
            pageNumber,
            canvas,
            width: canvas.width,
            height: canvas.height,
          });
          return next;
        });
      } catch (err) {
        console.error(`Failed to render page ${pageNumber}:`, err);
      } finally {
        renderQueueRef.current.delete(pageNumber);
      }
    });
  }, []);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;

    const loadDocument = async () => {
      setIsLoading(true);
      setLoadError(null);
      setRenderedPages(new Map());

      try {
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();

        const pdfjs = await loadPdfJs();
        if (cancelled) return;

        const response = await fetch(url, { signal: abortControllerRef.current.signal });
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;

        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        setPdfDoc(pdf as unknown as PDFDocumentWrapper);
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load PDF";
        setLoadError(message);
        setIsLoading(false);
      }
    };

    void loadDocument();

    return () => {
      cancelled = true;
      abortControllerRef.current?.abort();
    };
  }, [url]);

  // Trigger page rendering when page/scale/doc changes
  // Note: This intentionally fires renderPage which updates state for renderedPages map
  // No lint disable needed - renderPage is designed to update state
  useEffect(() => {
    if (!pdfDoc || totalPages === 0) return;

    const pagesToRender = [
      currentPage,
      ...Array.from({ length: PAGE_PRELOAD_AHEAD }, (_, i) => currentPage + i + 1),
      ...Array.from({ length: PAGE_PRELOAD_BEHIND }, (_, i) => currentPage - i - 1),
    ].filter((p) => p >= 1 && p <= totalPages && !renderedPages.has(p));

    for (const pageNum of pagesToRender) {
      renderPage(pageNum, scale, pdfDoc);
    }
  }, [pdfDoc, currentPage, scale, totalPages, renderedPages, renderPage]);

  // Scroll current page into view
  useEffect(() => {
    if (renderedPages.has(currentPage) && containerRef.current) {
      const pageElement = containerRef.current.querySelector(`[data-page="${currentPage}"]`);
      pageElement?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [currentPage, renderedPages]);

  // Handlers
  const handleDownload = useCallback(async () => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName || "document.pdf";
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

  const handlePrevPage = useCallback(() => {
    setCurrentPage((p) => Math.max(1, p - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((p) => Math.min(totalPages, p + 1));
  }, [totalPages]);

  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(MAX_SCALE, s + SCALE_STEP));
    setRenderedPages(new Map()); // Clear cache on zoom change
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(MIN_SCALE, s - SCALE_STEP));
    setRenderedPages(new Map()); // Clear cache on zoom change
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className={clsx("flex h-[85vh] w-[92vw] max-w-5xl flex-col rounded-xl bg-surface", className)}>
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
              <FileTypeIcon type="pdf" className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary" title={fileName}>{fileName}</p>
              <p className="text-xs text-text-muted">{formatFileSize(fileSize)} · {extension}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            <p className="text-sm text-text-muted">{t("chat:filePreview.loading", { defaultValue: "Loading PDF..." })}</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (loadError) {
    return (
      <div className={clsx("flex h-[85vh] w-[92vw] max-w-5xl flex-col rounded-xl bg-surface", className)}>
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
              <FileTypeIcon type="pdf" className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary" title={fileName}>{fileName}</p>
              <p className="text-xs text-text-muted">{formatFileSize(fileSize)} · {extension}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center">
            <DocumentTextIcon className="h-16 w-16 text-text-muted" />
            <div>
              <p className="text-sm text-danger font-medium">{t("chat:filePreview.pdfRenderError", { defaultValue: "Failed to load PDF" })}</p>
              <p className="mt-1 text-xs text-text-muted">{loadError}</p>
            </div>
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
      </div>
    );
  }

  return (
    <div className={clsx("flex flex-col", className)}>
      <div className="flex h-[85vh] w-[92vw] max-w-5xl flex-col rounded-xl bg-surface">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
              <FileTypeIcon type="pdf" className="h-5 w-5 text-red-500" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text-primary" title={fileName}>{fileName}</p>
              <p className="text-xs text-text-muted">
                {formatFileSize(fileSize)} · {extension}
                {totalPages > 0 && ` · ${totalPages} pages`}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {totalPages > 1 && (
              <div className="flex items-center gap-1 mr-2">
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

            <div className="flex items-center gap-1 border-l border-border pl-2">
              <IconButton
                icon={<span className="text-xs">−</span>}
                onClick={handleZoomOut}
                disabled={scale <= MIN_SCALE}
                variant="ghost"
                aria-label={t("chat:filePreview.zoomOut")}
              />
              <span className="min-w-[50px] text-center text-sm text-text-secondary">
                {Math.round(scale * 100)}%
              </span>
              <IconButton
                icon={<span className="text-xs">+</span>}
                onClick={handleZoomIn}
                disabled={scale >= MAX_SCALE}
                variant="ghost"
                aria-label={t("chat:filePreview.zoomIn")}
              />
            </div>
          </div>
        </div>

        {/* PDF Content */}
        <div ref={containerRef} className="flex-1 overflow-auto bg-neutral-100 p-4">
          <div className="mx-auto flex flex-col items-center gap-4">
            {totalPages > 0 ? (
              Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                const pageData = renderedPages.get(pageNum);
                const isCurrentPage = pageNum === currentPage;

                return (
                  <div
                    key={pageNum}
                    data-page={pageNum}
                    className={clsx(
                      "relative bg-white shadow-lg",
                      isCurrentPage && "ring-2 ring-primary",
                    )}
                  >
                    {pageData?.canvas ? (
                      <div
                        ref={(el) => {
                          if (el && pageData.canvas) {
                            el.innerHTML = "";
                            el.appendChild(pageData.canvas);
                          }
                        }}
                      />
                    ) : (
                      <div
                        className="flex items-center justify-center bg-white shadow-lg"
                        style={{ width: 600, height: 400, minHeight: 400 }}
                      >
                        <div className="flex flex-col items-center gap-2">
                          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          <span className="text-xs text-text-muted">
                            {t("chat:filePreview.loading", { defaultValue: "Loading page" })} {pageNum}...
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-2 right-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
                      {pageNum} / {totalPages}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex items-center justify-center" style={{ width: 600, height: 400 }}>
                <p className="text-sm text-text-muted">No pages to display</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-border px-4 py-2">
          <p className="text-xs text-text-muted">
            {t("chat:filePreview.pdfRenderedWithJs", {
              defaultValue: "Rendered using PDF.js viewer",
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
    </div>
  );
};

export default PdfJsViewer;
