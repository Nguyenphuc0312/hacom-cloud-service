/**
 * @fileoverview PDF.js viewer component for rendering PDFs in the browser.
 * Fetches PDF via XHR to bypass cross-origin iframe restrictions.
 * Renders pages on canvas for full control over the viewing experience.
 *
 * Hiệu năng: mỗi trang là 1 <PdfPage/> tự vẽ khi lọt vào viewport
 * (IntersectionObserver) và tự bỏ canvas khi cuộn ra xa, nên file 50+ trang
 * chỉ giữ vài canvas trong bộ nhớ thay vì dựng hết ngay từ đầu.
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
import { truncateFilename } from "../../utils/truncateFilename";
import { downloadResourceWithName } from "../../utils/downloadFile";
import { FileTypeIcon } from "../message/FileTypeIcon";
import {
  buildPdfKey,
  loadPdfPage,
  savePdfPage,
} from "../../utils/pdfReadingPosition";
import { logger } from "../../utils/logger";

interface PdfJsViewerProps {
  url: string;
  fileName: string;
  fileSize?: number;
  className?: string;
  embedded?: boolean;
  allowExport?: boolean;
}

interface PDFDocumentWrapper {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (opts: { scale: number }) => { width: number; height: number };
    render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void>; cancel: () => void };
  }>;
}

const SCALE_STEP = 0.25;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;
// Vẽ sẵn 1 màn hình trên/dưới viewport để cuộn không thấy khoảng trắng.
const PRELOAD_MARGIN = "100% 0px";
// Kích thước mỗi lần pdf.js xin thêm dữ liệu khi tải dần (mặc định của pdf.js).
const RANGE_CHUNK_SIZE = 65536;

/**
 * File PDF là nội dung người dùng gửi lên → coi như KHÔNG tin cậy.
 *
 * Hai tuỳ chọn dưới đúng bằng mặc định hiện tại của pdf.js; khai báo tường minh
 * để nâng version sau này không âm thầm nới lỏng chúng.
 *
 * KHÔNG có `enableScripting` ở đây: tuỳ chọn đó thuộc annotation layer, mà
 * viewer này chỉ vẽ canvas chứ không dựng annotation layer — nghĩa là
 * JavaScript nhúng trong PDF vốn đã không có đường chạy.
 *
 * Lớp phòng thủ chính vẫn là CSP ở nginx/security-headers.conf:
 * connect-src khoá đúng 3 backend, object-src 'none'.
 */
const PDF_SECURITY_OPTIONS = {
  // XFA form = một engine render riêng, bề mặt tấn công rộng và ta không dùng.
  enableXfa: false,
  // Chỉ dùng font nhúng trong file, không để file chỉ định font hệ thống.
  useSystemFonts: false,
} as const;

// PDF.js worker configuration - loaded dynamically.
// Use Vite's `?worker` import so the worker is bundled and instantiated by Vite
// (via workerPort) instead of being fetched at runtime as a dynamically-imported
// ES module. The runtime dynamic-import approach fails in production when the
// static server serves the `.mjs` chunk with the wrong MIME type ("Setting up
// fake worker failed: Failed to fetch dynamically imported module").
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

/**
 * Server có phục vụ range request không? Hỏi bằng 1 request 2 byte.
 *
 * Không dùng HEAD: S3/MinIO ký presigned URL theo đúng HTTP method, nên URL ký
 * cho GET sẽ trả 403 khi gọi HEAD. Phải hỏi bằng chính GET + header Range.
 *
 * Mọi trục trặc (CORS chặn header Range, mạng lỗi, server trả 200 thay vì 206)
 * đều quy về `false` → rơi xuống đường tải cả file, vẫn xem được.
 */
async function supportsRangeRequests(url: string, signal: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-1" }, signal });
    // 206 = server hiểu và cắt đúng đoạn. 200 nghĩa là nó phớt lờ Range và trả cả file.
    return res.status === 206;
  } catch {
    return false;
  }
}

async function fetchWholeFile(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status}`);
  return res.arrayBuffer();
}

/**
 * Một trang PDF tự quản vòng đời render của chính nó:
 * chỉ vẽ khi lọt vào viewport (IntersectionObserver), huỷ khi cuộn ra xa.
 * Nhờ vậy file 50+ trang chỉ giữ vài canvas trong bộ nhớ.
 */
const PdfPage: React.FC<{
  pageNumber: number;
  totalPages: number;
  scale: number;
  doc: PDFDocumentWrapper;
  /** Cỡ trang 1 — dùng làm chỗ trống cho trang chưa vẽ, để thanh cuộn đúng ngay từ đầu. */
  placeholder: { width: number; height: number };
  onVisible: (pageNumber: number) => void;
}> = React.memo(({ pageNumber, totalPages, scale, doc, placeholder, onVisible }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [isNear, setIsNear] = useState(false);

  // Theo dõi vị trí: gần viewport → cho phép vẽ; đúng giữa màn hình → báo lên header.
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
  }, [pageNumber, onVisible]);

  // Vẽ trang khi tới gần; đổi scale thì vẽ lại.
  useEffect(() => {
    if (!isNear) return;
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let task: { promise: Promise<void>; cancel: () => void } | null = null;

    void (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.className = "block";

        task = page.render({ canvasContext: context, viewport });
        await task.promise;
        if (cancelled) return;

        // Đặt kích thước qua ref, KHÔNG qua state: state → re-render → React
        // ghi đè node này và xoá mất canvas vừa gắn (trang trắng tinh).
        host.style.width = `${canvas.width}px`;
        host.style.height = `${canvas.height}px`;
        host.replaceChildren(canvas);
      } catch (err) {
        // Huỷ render khi cuộn nhanh là chuyện bình thường, không phải lỗi.
        if (!cancelled) {
          logger.warn("pdf-viewer", "page_render_failed", {
            pageNumber,
            error: err,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [isNear, pageNumber, scale, doc]);

  // Rời xa viewport thì bỏ canvas để giải phóng bộ nhớ. Giữ nguyên width/height
  // đã đặt ở trên nên chỗ trống vẫn đúng cỡ, cuộn lại không nhảy layout.
  useEffect(() => {
    if (isNear) return;
    hostRef.current?.replaceChildren();
  }, [isNear]);

  return (
    <div data-page={pageNumber} className="relative bg-white shadow-lg">
      {/* Nội dung div này do effect ở trên tự quản qua ref — React không render
          con nào vào đây, nếu không sẽ xoá mất canvas. */}
      <div
        ref={hostRef}
        style={placeholder}
        className="flex items-center justify-center"
      />
      <div className="absolute bottom-2 right-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
        {pageNumber} / {totalPages}
      </div>
    </div>
  );
});
PdfPage.displayName = "PdfPage";

export const PdfJsViewer: React.FC<PdfJsViewerProps> = ({
  url,
  fileName,
  fileSize,
  className,
  embedded = false,
  allowExport = true,
}) => {
  const { t } = useTranslation();
  const panelClass = embedded ? "flex h-[60vh] min-h-80 w-full min-w-0 flex-col bg-surface" : "flex h-[85vh] w-[92vw] max-w-5xl flex-col rounded-xl bg-surface";
  const containerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentWrapper | null>(null);
  const [pageSize, setPageSize] = useState({ width: 600, height: 800 });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Nhớ trang đang đọc. Khoá theo tên+cỡ file vì `url` là URL ký, đổi mỗi lần mở.
  const positionKey = React.useMemo(
    () => buildPdfKey(fileName, fileSize),
    [fileName, fileSize],
  );
  // Trong lúc cuộn về trang đã lưu, IntersectionObserver bắn `onVisible` cho các
  // trang lướt qua — nếu ghi luôn thì vị trí lưu bị đè bằng trang trung gian.
  const isRestoringRef = useRef(false);

  const extension = getFileExtension(fileName);

  // useMemo là bắt buộc, không phải tối ưu vặt: object mới mỗi lần render sẽ phá
  // React.memo của PdfPage → cả 200 trang re-render mỗi lần cuộn đổi currentPage.
  const placeholder = React.useMemo(
    () => ({
      width: Math.floor(pageSize.width * scale),
      height: Math.floor(pageSize.height * scale),
    }),
    [pageSize.width, pageSize.height, scale],
  );

  // Load PDF document
  useEffect(() => {
    let cancelled = false;

    const loadDocument = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();

        const pdfjs = await loadPdfJs();
        if (cancelled) return;

        const signal = abortControllerRef.current.signal;
        const ranged = await supportsRangeRequests(url, signal);
        if (cancelled) return;

        // Chọn đường nạp theo khả năng THẬT của server, không đoán:
        //  - Có range → giao URL cho pdf.js tải dần, file 200 trang mở gần như tức thì.
        //  - Không    → tự fetch cả file rồi đưa ArrayBuffer (chậm hơn nhưng luôn đúng).
        // Đưa { url } khi server KHÔNG phục vụ range sẽ ra trang trắng tinh mà vẫn
        // đọc được số trang — đã dính đúng lỗi này 05-08-26, xem PdfJsViewer.test.tsx.
        const loadingTask = ranged
          ? pdfjs.getDocument({
              url,
              disableAutoFetch: true,
              disableStream: false,
              rangeChunkSize: RANGE_CHUNK_SIZE,
              ...PDF_SECURITY_OPTIONS,
            })
          : pdfjs.getDocument({
              data: await fetchWholeFile(url, signal),
              ...PDF_SECURITY_OPTIONS,
            });

        const pdf = await loadingTask.promise;
        if (cancelled) return;

        // Đo trang 1 để mọi trang chưa vẽ có chỗ trống đúng tỉ lệ → thanh cuộn
        // chuẩn ngay lập tức, không nhảy giật khi từng trang vẽ xong.
        const firstPage = await pdf.getPage(1);
        if (cancelled) return;
        const { width, height } = firstPage.getViewport({ scale: 1 });

        setPageSize({ width: Math.floor(width), height: Math.floor(height) });
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

  // Nút ←/→ cuộn tới trang; KHÔNG tự cuộn theo trang đang render (gây giật khi đọc).
  const scrollToPage = useCallback((pageNumber: number) => {
    containerRef.current
      ?.querySelector(`[data-page="${pageNumber}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Mở lại file đang đọc dở → nhảy về đúng trang cũ.
  // Chạy sau khi tài liệu nạp xong (lúc đó các <PdfPage/> mới có trong DOM).
  useEffect(() => {
    if (isLoading || !pdfDoc || totalPages === 0) return;

    const saved = loadPdfPage(positionKey, totalPages);
    if (saved === null) return;

    isRestoringRef.current = true;

    // Đợi hết frame hiện tại: lúc đó các <PdfPage/> mới nằm trong DOM và có
    // chiều cao chỗ trống đúng, cuộn mới tới đúng trang. Đây là việc đồng bộ
    // với DOM nên không đặt setState thẳng trong thân effect.
    let timer = 0;
    const frame = window.requestAnimationFrame(() => {
      setCurrentPage(saved);
      // Nhảy thẳng, không cuộn mượt: cuộn mượt qua vài chục trang vừa chậm vừa
      // bắn hàng loạt onVisible trung gian.
      containerRef.current
        ?.querySelector(`[data-page="${saved}"]`)
        ?.scrollIntoView({ block: "start" });

      // Nhả cờ sau khi trình duyệt xử lý xong đợt scroll + observer callback.
      timer = window.setTimeout(() => {
        isRestoringRef.current = false;
      }, 600);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      isRestoringRef.current = false;
    };
  }, [isLoading, pdfDoc, totalPages, positionKey]);

  // Ghi lại vị trí khi người dùng cuộn sang trang khác.
  useEffect(() => {
    if (isLoading || isRestoringRef.current || totalPages === 0) return;
    savePdfPage(positionKey, currentPage, totalPages);
  }, [currentPage, isLoading, positionKey, totalPages]);

  // Handlers
  const handleDownload = useCallback(async () => {
    if (!allowExport) return;
    await downloadResourceWithName(url, fileName || "document.pdf");
  }, [allowExport, fileName, url]);

  const handleOpenInNewTab = useCallback(() => {
    if (!allowExport) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [allowExport, url]);

  const handlePrevPage = useCallback(() => {
    setCurrentPage((p) => {
      const next = Math.max(1, p - 1);
      scrollToPage(next);
      return next;
    });
  }, [scrollToPage]);

  const handleNextPage = useCallback(() => {
    setCurrentPage((p) => {
      const next = Math.min(totalPages, p + 1);
      scrollToPage(next);
      return next;
    });
  }, [totalPages, scrollToPage]);

  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(MAX_SCALE, s + SCALE_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(MIN_SCALE, s - SCALE_STEP));
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className={clsx(panelClass, className)}>
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
              <FileTypeIcon type="pdf" className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary" title={fileName}>{truncateFilename(fileName, 48)}</p>
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
      <div className={clsx(panelClass, className)}>
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
              <FileTypeIcon type="pdf" className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary" title={fileName}>{truncateFilename(fileName, 48)}</p>
              <p className="text-xs text-text-muted">{formatFileSize(fileSize)} · {extension}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center">
            <DocumentTextIcon className="h-16 w-16 text-text-muted" />
            <div>
              <p className="text-sm text-danger font-medium">{t("chat:filePreview.pdfRenderError", { defaultValue: "Failed to load PDF" })}</p>
              {allowExport && <p className="mt-1 text-xs text-text-muted">{loadError}</p>}
            </div>
            {allowExport && <div className="flex gap-2">
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
            </div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx("flex flex-col", className)}>
      <div className={panelClass}>
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
              <FileTypeIcon type="pdf" className="h-5 w-5 text-red-500" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text-primary" title={fileName}>{truncateFilename(fileName, 48)}</p>
              <p className="text-xs text-text-muted">
                {formatFileSize(fileSize)} · {extension}
                {totalPages > 0 && ` · ${totalPages} pages`}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
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
            {totalPages > 0 && pdfDoc ? (
              Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <PdfPage
                  key={pageNum}
                  pageNumber={pageNum}
                  totalPages={totalPages}
                  scale={scale}
                  doc={pdfDoc}
                  placeholder={placeholder}
                  onVisible={setCurrentPage}
                />
              ))
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
          {allowExport && <div className="flex items-center gap-2">
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
          </div>}
        </div>
      </div>
    </div>
  );
};

export default PdfJsViewer;
