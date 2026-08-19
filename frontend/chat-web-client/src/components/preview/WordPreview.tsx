/**
 * @fileoverview WordPreview — render .docx NGAY TRONG TRÌNH DUYỆT (client-side,
 * không cần Office Online / URL công khai → chạy được trên localhost).
 *
 * Dùng `docx-preview`: fetch file → renderAsync(blob) vào 1 div. Chỉ hỗ trợ
 * .docx (OOXML); .doc cũ (binary) không đọc được → parent tự fallback.
 */

import React, { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

interface WordPreviewProps {
  url: string;
  fileName: string;
  className?: string;
}

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

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";

    (async () => {
      // setState trong async (không đồng bộ trong effect body) — tránh cascading render.
      setStatus("loading");
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
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

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
        {/* docx-preview render vào đây; ẩn khi lỗi để không hiện khung trống. */}
        <div
          ref={containerRef}
          className={clsx(
            "mx-auto docx-preview-host",
            status !== "ready" && "invisible",
          )}
          aria-label={fileName}
        />
      </div>
    </div>
  );
};

export default WordPreview;
