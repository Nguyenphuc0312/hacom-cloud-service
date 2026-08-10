/**
 * @fileoverview ExcelPreview — render .xlsx/.xls/.csv NGAY TRONG TRÌNH DUYỆT
 * (client-side, không cần Office Online / URL công khai → chạy được trên localhost).
 *
 * Dùng SheetJS (`xlsx`, đã cài sẵn): fetch file → parse workbook → sheet đầu tiên
 * → HTML table. Có tab chọn sheet nếu file nhiều sheet.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  ExclamationTriangleIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from "@heroicons/react/24/outline";
import { sanitizeTableHtml } from "../../utils/sanitizeTableHtml";

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.1;

interface ExcelPreviewProps {
  url: string;
  fileName: string;
  className?: string;
}

interface ParsedWorkbook {
  sheetNames: string[];
  /** HTML table string cho từng sheet (index khớp sheetNames). */
  htmlBySheet: string[];
}

// xlsx nặng (~1MB) → lazy import để không phình bundle chính.
async function loadXlsx(): Promise<typeof import("xlsx")> {
  return import("xlsx");
}

/**
 * Đóng băng Object.prototype trước khi parse file người dùng gửi.
 *
 * Bối cảnh: 0.18.5 (bản duy nhất trên npm) dính GHSA-4r6h-8v6p-xvw6 (prototype
 * pollution) + GHSA-5pgg-2g8v-p4x9 (ReDoS). Từ 05-08-26 đã nâng lên 0.20.3 lấy
 * thẳng từ cdn.sheetjs.com — nơi duy nhất phát hành bản vá — nên cả hai CVE
 * không còn.
 *
 * Vẫn GIỮ lớp freeze này: XLSX.read() chạy trên file do người dùng KHÁC gửi,
 * và ta không muốn an toàn phụ thuộc hoàn toàn vào một version cụ thể. Chi phí
 * gần như bằng 0.
 *
 * Freeze là vĩnh viễn và app không bao giờ ghi lên Object.prototype trong luồng
 * bình thường, nên không cần khôi phục.
 */
let prototypeFrozen = false;
function freezeObjectPrototypeOnce(): void {
  if (prototypeFrozen) return;
  Object.freeze(Object.prototype);
  prototypeFrozen = true;
}

export const ExcelPreview: React.FC<ExcelPreviewProps> = ({
  url,
  fileName,
  className,
}) => {
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Reset trong async (không đồng bộ trong effect body) — tránh cascading render.
      setParsed(null);
      setError(null);
      setActiveSheet(0);
      try {
        const [XLSX, res] = await Promise.all([loadXlsx(), fetch(url)]);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;

        freezeObjectPrototypeOnce();
        const wb = XLSX.read(buf, { type: "array" });
        const htmlBySheet = wb.SheetNames.map((name) =>
          // sheet_to_html KHÔNG escape nội dung ô → bắt buộc lọc trước khi render.
          sanitizeTableHtml(
            XLSX.utils.sheet_to_html(wb.Sheets[name], { editable: false }),
          ),
        );
        if (cancelled) return;
        setParsed({ sheetNames: wb.SheetNames, htmlBySheet });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Không đọc được file");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  const activeHtml = useMemo(
    () => parsed?.htmlBySheet[activeSheet] ?? "",
    [parsed, activeSheet],
  );

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
      aria-label={fileName}
    >
      {/* Nội dung */}
      <div className="min-h-0 flex-1 overflow-auto bg-white p-3">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-text-muted">
            <ExclamationTriangleIcon className="h-8 w-8" />
            <span className="text-sm">Không xem trước được: {error}</span>
          </div>
        ) : !parsed ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            Đang tải bảng tính…
          </div>
        ) : (
          // sheet_to_html trả bảng có sẵn style tối thiểu; bọc class để căn đẹp.
          // Thu phóng bằng transform để không phải dựng lại bảng.
          <div
            className="excel-preview-table w-fit origin-top-left text-sm text-gray-900 transition-transform duration-150"
            style={{ transform: `scale(${scale})` }}
            dangerouslySetInnerHTML={{ __html: activeHtml }}
          />
        )}
      </div>

      {/* Thanh dưới: tab sheet bên trái + thu phóng bên phải (như Excel/Zalo) */}
      {parsed && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface-overlay px-2 py-1.5">
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto scrollbar-hide">
            {parsed.sheetNames.map((name, i) => (
              <button
                key={name}
                type="button"
                onClick={() => setActiveSheet(i)}
                className={clsx(
                  "shrink-0 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  i === activeSheet
                    ? "bg-[#1565C0] text-white"
                    : "text-text-secondary hover:bg-surface-hover",
                )}
              >
                {name}
              </button>
            ))}
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

export default ExcelPreview;
