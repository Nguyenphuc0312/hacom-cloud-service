/**
 * @fileoverview WordPreview — render .docx NGAY TRONG TRÌNH DUYỆT (client-side,
 * không cần Office Online / URL công khai → chạy được trên localhost).
 *
 * Dùng `docx-preview`: fetch file → renderAsync(blob) vào 1 div. Chỉ hỗ trợ
 * .docx (OOXML); .doc cũ (binary) không đọc được → parent tự fallback.
 *
 * Thanh công cụ đặt DƯỚI đáy như Zalo/Word Online: trái là icon W + số trang,
 * phải là mức thu phóng.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  ExclamationTriangleIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from "@heroicons/react/24/outline";
import { FileTypeIcon } from "../message/FileTypeIcon";

interface WordPreviewProps {
  url: string;
  fileName: string;
  className?: string;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.1;

// docx-preview nặng → lazy import.
async function loadDocxPreview(): Promise<typeof import("docx-preview")> {
  return import("docx-preview");
}

export const WordPreview: React.FC<WordPreviewProps> = ({
  url,
  fileName,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [scale, setScale] = useState(1);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";

    (async () => {
      // setState trong async (không đồng bộ trong effect body) — tránh cascading render.
      setStatus("loading");
      setPageCount(0);
      try {
        const [docx, res] = await Promise.all([loadDocxPreview(), fetch(url)]);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (cancelled || !containerRef.current) return;

        await docx.renderAsync(blob, containerRef.current, undefined, {
          className: "docx",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
        });
        if (cancelled) return;
        // docx-preview không trả số trang; đếm phần tử trang nó vừa dựng.
        setPageCount(
          containerRef.current?.querySelectorAll(".docx-wrapper > section")
            .length ?? 0,
        );
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  const zoomIn = useCallback(
    () => setScale((s) => Math.min(MAX_SCALE, s + SCALE_STEP)),
    [],
  );
  const zoomOut = useCallback(
    () => setScale((s) => Math.max(MIN_SCALE, s - SCALE_STEP)),
    [],
  );
  const resetZoom = useCallback(() => setScale(1), []);

  return (
    <div
      className={clsx(
        "flex h-[70vh] w-[min(72rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface",
        className,
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="relative min-h-0 flex-1 overflow-auto bg-[#f5f5f5] p-4">
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-text-muted">
            Đang tải tài liệu…
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-text-muted">
            <ExclamationTriangleIcon className="h-8 w-8" />
            <span className="text-sm">Không xem trước được file này</span>
          </div>
        )}
        {/* docx-preview render vào đây; ẩn khi lỗi để không hiện khung trống.
            Thu phóng bằng transform để không phải dựng lại tài liệu. */}
        <div
          className={clsx(
            "mx-auto docx-preview-host w-fit origin-top transition-transform duration-150",
            status !== "ready" && "invisible",
          )}
          style={{ transform: `scale(${scale})` }}
          ref={containerRef}
          aria-label={fileName}
        />
      </div>

      {/* Thanh công cụ dưới đáy — kiểu Zalo/Word Online */}
      {status === "ready" && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <FileTypeIcon type="document" fileName={fileName} className="h-4 w-4" />
            {pageCount > 0 && (
              <span className="truncate text-xs text-text-muted">
                {pageCount} trang
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={zoomOut}
              disabled={scale <= MIN_SCALE}
              className="rounded-md p-1 text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-40"
              aria-label="Thu nhỏ"
            >
              <MagnifyingGlassMinusIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={resetZoom}
              className="min-w-[3rem] rounded-md px-1.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover"
              aria-label="Đặt lại thu phóng"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              type="button"
              onClick={zoomIn}
              disabled={scale >= MAX_SCALE}
              className="rounded-md p-1 text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-40"
              aria-label="Phóng to"
            >
              <MagnifyingGlassPlusIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WordPreview;
