/**
 * @fileoverview ExcelPreview — render .xlsx/.xls/.csv NGAY TRONG TRÌNH DUYỆT
 * (client-side, không cần Office Online / URL công khai → chạy được trên localhost).
 *
 * Dùng SheetJS (`xlsx`, đã cài sẵn): fetch file → parse workbook → sheet đầu tiên
 * → HTML table. Có tab chọn sheet nếu file nhiều sheet.
 */

import React, { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

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

export const ExcelPreview: React.FC<ExcelPreviewProps> = ({
  url,
  fileName,
  className,
}) => {
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [error, setError] = useState<string | null>(null);

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

        const wb = XLSX.read(buf, { type: "array" });
        const htmlBySheet = wb.SheetNames.map((name) =>
          XLSX.utils.sheet_to_html(wb.Sheets[name], { editable: false }),
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

  return (
    <div
      className={clsx(
        "flex h-[70vh] w-[min(72rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface",
        className,
      )}
      onClick={(event) => event.stopPropagation()}
      aria-label={fileName}
    >
      {/* Tab chọn sheet (chỉ hiện khi >1 sheet) */}
      {parsed && parsed.sheetNames.length > 1 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-surface-overlay px-2 py-1.5 scrollbar-hide">
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
      )}

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
          <div
            className="excel-preview-table text-sm text-gray-900"
            dangerouslySetInnerHTML={{ __html: activeHtml }}
          />
        )}
      </div>
    </div>
  );
};

export default ExcelPreview;
