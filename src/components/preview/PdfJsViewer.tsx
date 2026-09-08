/**
 * PDF.js renderer for the in-app file preview.
 *
 * It proves that byte ranges are usable before asking PDF.js to stream a
 * document, renders only nearby pages, and tears every PDF.js task down when
 * the modal closes or a signed view URL changes.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { MAX_PREVIEW_SIZE } from "../../utils/filePreviewUtils";
import { logger } from "../../utils/logger";

interface PdfJsViewerProps {
  url: string;
  fileName: string;
  fileSize?: number;
  className?: string;
  /** Kept for callers that mount the viewer inside the file-preview shell. */
  embedded?: boolean;
  /** Controlled by FilePreviewModal's existing zoom control when supplied. */
  scale?: number;
  onPageCount?: (count: number) => void;
  onCurrentPageChange?: (page: number) => void;
}

interface PDFDocumentWrapper {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (options: { scale: number }) => { width: number; height: number };
    render: (options: {
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
    }) => { promise: Promise<void>; cancel: () => void };
  }>;
  destroy?: () => Promise<void> | void;
}

interface PDFLoadingTask {
  promise: Promise<PDFDocumentWrapper>;
  destroy?: () => Promise<void> | void;
}

const PRELOAD_MARGIN = "100% 0px";
const RANGE_CHUNK_SIZE = 65_536;
const PDF_SECURITY_OPTIONS = {
  enableXfa: false,
  useSystemFonts: false,
} as const;

let pdfjsLib: typeof import("pdfjs-dist") | null = null;

async function loadPdfJs(): Promise<typeof import("pdfjs-dist")> {
  if (pdfjsLib) return pdfjsLib;

  const [pdfjs, { default: PdfWorker }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?worker"),
  ]);
  pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
  pdfjsLib = pdfjs;
  return pdfjs;
}

function hasExpectedProbeRange(response: Response): boolean {
  const contentRange = response.headers.get("Content-Range");
  return response.status === 206 && /^bytes\s+0-1\/\d+$/i.test(contentRange ?? "");
}

async function supportsRangeRequests(url: string, signal: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: { Range: "bytes=0-1" },
      signal,
    });
    return hasExpectedProbeRange(response);
  } catch {
    return false;
  }
}

async function fetchWholeFile(
  url: string,
  signal: AbortSignal,
  expectedBytes?: number,
): Promise<ArrayBuffer> {
  if (expectedBytes && expectedBytes > MAX_PREVIEW_SIZE) {
    throw new Error("PDF is too large to load without byte-range support");
  }

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);

  const contentLength = Number.parseInt(response.headers.get("Content-Length") ?? "", 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_PREVIEW_SIZE) {
    throw new Error("PDF is too large to load without byte-range support");
  }

  const data = await response.arrayBuffer();
  if (data.byteLength > MAX_PREVIEW_SIZE) {
    throw new Error("PDF is too large to load without byte-range support");
  }
  return data;
}

function destroyQuietly(resource: { destroy?: () => Promise<void> | void } | null): void {
  if (!resource?.destroy) return;
  try {
    void Promise.resolve(resource.destroy()).catch(() => undefined);
  } catch {
    // A cancelled/settled PDF.js task may reject destruction; it is already detached.
  }
}

function getSafePdfErrorKind(error: unknown): "abort" | "error" | "unknown" {
  if (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    error.name === "AbortError"
  ) {
    return "abort";
  }
  return error instanceof Error ? "error" : "unknown";
}

const PdfPage = React.memo(function PdfPage({
  pageNumber,
  totalPages,
  scale,
  pdfDocument,
  placeholder,
  onVisible,
}: {
  pageNumber: number;
  totalPages: number;
  scale: number;
  pdfDocument: PDFDocumentWrapper;
  placeholder: { width: number; height: number };
  onVisible: (page: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [isNear, setIsNear] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const nearObserver = new IntersectionObserver(
      ([entry]) => setIsNear(entry.isIntersecting),
      { rootMargin: PRELOAD_MARGIN },
    );
    const activeObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onVisible(pageNumber);
      },
      { threshold: 0.5 },
    );

    nearObserver.observe(host);
    activeObserver.observe(host);
    return () => {
      nearObserver.disconnect();
      activeObserver.disconnect();
    };
  }, [onVisible, pageNumber]);

  useEffect(() => {
    if (!isNear) return;
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let renderTask: { promise: Promise<void>; cancel: () => void } | null = null;

    void (async () => {
      try {
        const page = await pdfDocument.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.className = "block";

        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
        if (cancelled) return;

        host.style.width = `${canvas.width}px`;
        host.style.height = `${canvas.height}px`;
        host.replaceChildren(canvas);
      } catch (error) {
        if (!cancelled) {
          logger.warn("pdf-viewer", "page_render_failed", {
            pageNumber,
            errorKind: getSafePdfErrorKind(error),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfDocument, isNear, pageNumber, scale]);

  useEffect(() => {
    if (!isNear) hostRef.current?.replaceChildren();
  }, [isNear]);

  return (
    <div data-page={pageNumber} className="relative bg-white shadow-lg">
      <div ref={hostRef} style={placeholder} className="flex items-center justify-center" />
      <div className="absolute bottom-2 right-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
        {pageNumber} / {totalPages}
      </div>
    </div>
  );
});

export const PdfJsViewer: React.FC<PdfJsViewerProps> = ({
  url,
  fileName,
  fileSize,
  className,
  scale = 1,
  onPageCount,
  onCurrentPageChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const loadingTaskRef = useRef<PDFLoadingTask | null>(null);
  const documentRef = useRef<PDFDocumentWrapper | null>(null);
  const onPageCountRef = useRef(onPageCount);
  const onCurrentPageChangeRef = useRef(onCurrentPageChange);
  const [document, setDocument] = useState<PDFDocumentWrapper | null>(null);
  const [pageSize, setPageSize] = useState({ width: 600, height: 800 });
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    onPageCountRef.current = onPageCount;
    onCurrentPageChangeRef.current = onCurrentPageChange;
  }, [onCurrentPageChange, onPageCount]);

  const placeholder = useMemo(
    () => ({
      width: Math.floor(pageSize.width * scale),
      height: Math.floor(pageSize.height * scale),
    }),
    [pageSize.height, pageSize.width, scale],
  );

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let loadingTask: PDFLoadingTask | null = null;
    let loadedDocument: PDFDocumentWrapper | null = null;

    setDocument(null);
    setTotalPages(0);
    setCurrentPage(1);
    setIsLoading(true);
    setLoadError(null);

    void (async () => {
      try {
        const pdfjs = await loadPdfJs();
        if (cancelled) return;

        const hasRanges = await supportsRangeRequests(url, controller.signal);
        if (cancelled) return;

        loadingTask = (hasRanges
          ? pdfjs.getDocument({
              url,
              disableAutoFetch: true,
              disableStream: false,
              rangeChunkSize: RANGE_CHUNK_SIZE,
              ...PDF_SECURITY_OPTIONS,
            })
          : pdfjs.getDocument({
              data: await fetchWholeFile(url, controller.signal, fileSize),
              ...PDF_SECURITY_OPTIONS,
            })) as unknown as PDFLoadingTask;
        loadingTaskRef.current = loadingTask;

        const pdf = await loadingTask.promise;
        loadedDocument = pdf;
        if (cancelled) {
          destroyQuietly(pdf);
          return;
        }

        const firstPage = await pdf.getPage(1);
        if (cancelled) {
          destroyQuietly(pdf);
          return;
        }
        const viewport = firstPage.getViewport({ scale: 1 });

        documentRef.current = pdf;
        setPageSize({ width: Math.floor(viewport.width), height: Math.floor(viewport.height) });
        setDocument(pdf);
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
        onPageCountRef.current?.(pdf.numPages);
        setIsLoading(false);
      } catch {
        if (cancelled) return;
        destroyQuietly(loadedDocument);
        setLoadError("Không thể tải nội dung xem trước của PDF.");
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (loadingTaskRef.current === loadingTask) loadingTaskRef.current = null;
      if (documentRef.current === loadedDocument) documentRef.current = null;
      if (loadedDocument) {
        destroyQuietly(loadedDocument);
      } else {
        destroyQuietly(loadingTask);
      }
    };
  }, [fileSize, url]);

  useEffect(() => {
    if (totalPages > 0) onCurrentPageChangeRef.current?.(currentPage);
  }, [currentPage, totalPages]);

  const handleVisiblePage = useCallback((page: number) => {
    setCurrentPage((previous) => (previous === page ? previous : page));
  }, []);

  if (isLoading) {
    return (
      <div className={clsx("flex h-full w-full items-center justify-center text-center", className)} role="status">
        <span className="text-[13px] text-text-muted">Đang tải tài liệu PDF…</span>
      </div>
    );
  }

  if (loadError || !document) {
    return (
      <div className={clsx("flex h-full w-full items-center justify-center px-6 text-center", className)} role="alert">
        <div>
          <p className="text-[13px] font-medium text-danger">Không thể xem trước PDF</p>
          <p className="mt-1 text-[12px] text-text-muted">
            {loadError || "Tải bản gốc về để mở bằng ứng dụng phù hợp."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={clsx("h-full w-full overflow-auto bg-neutral-100 px-4 py-4", className)}
      aria-label={`Xem PDF ${fileName}`}
    >
      <span className="sr-only" aria-live="polite">
        Trang {currentPage} trên {totalPages}
      </span>
      <div className="mx-auto flex w-fit flex-col items-center gap-4">
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
          <PdfPage
            key={pageNumber}
            pageNumber={pageNumber}
            totalPages={totalPages}
            scale={scale}
            pdfDocument={document}
            placeholder={placeholder}
            onVisible={handleVisiblePage}
          />
        ))}
      </div>
    </div>
  );
};

export default PdfJsViewer;
