import React, { useEffect, useRef, useState } from "react";
import {
  MoreHorizontalIcon,
  DownloadIcon,
  CopyIcon,
  CheckIcon,
  Loader2Icon,
} from "lucide-react";
import {
  parseMarkdownTable,
  exportTableToXlsx,
  tableToPlainText,
  ExportExpiredError,
} from "../../services/tableExport";
import { logger } from "../../../../utils/logger";
import { toast } from "../../../../utils/toast";

interface TableExportMenuProps {
  /** Nội dung markdown của tin nhắn (chứa bảng để parse). */
  content: string;
  /** Tiêu đề dùng cho file. */
  title: string;
  /** session_id + exportId → Excel xuất từ snapshot dữ liệu gốc (đủ cột đã ẩn). */
  sessionId?: string;
  exportId?: string;
}

/**
 * Menu `...` cho BẢNG trong câu trả lời AI (kiểu Gemini): Sao chép bảng + Tải
 * Excel. Copy toàn bộ câu trả lời nằm ở nút riêng ngoài menu này.
 */
export const TableExportMenu: React.FC<TableExportMenuProps> = ({
  content,
  title,
  sessionId,
  exportId,
}) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const fileBase = title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "bao-cao";

  const handleCopyTable = async () => {
    setOpen(false);
    const table = parseMarkdownTable(content);
    if (!table || table.headers.length === 0) {
      toast.error("Không tìm thấy bảng để sao chép.");
      return;
    }
    try {
      await navigator.clipboard.writeText(tableToPlainText(table));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error("TableExportMenu", "copy-table-failed", { err });
      toast.error("Không thể sao chép bảng.");
    }
  };

  const handleDownloadExcel = async () => {
    setOpen(false);
    const table = parseMarkdownTable(content);
    try {
      setBusy(true);
      const saved = await exportTableToXlsx(
        fileBase,
        table ?? { headers: [], rows: [] },
        content,
        title,
        sessionId,
        exportId,
      );
      if (saved) toast.success("Xuất file Excel thành công.");
    } catch (err) {
      logger.error("TableExportMenu", "export-failed", { err });
      if (err instanceof ExportExpiredError) {
        toast.error(err.message);
      } else {
        toast.error("Xuất file Excel thất bại. Vui lòng thử lại.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="flex items-center justify-center rounded-lg px-2 py-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary disabled:opacity-50"
        title="Tùy chọn bảng"
      >
        {busy ? (
          <Loader2Icon size={14} className="animate-spin" />
        ) : (
          <MoreHorizontalIcon size={15} />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg">
          <button
            type="button"
            onClick={() => void handleCopyTable()}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-text-primary transition-colors hover:bg-[#1976D2]/8"
          >
            <span className="text-text-muted">
              {copied ? (
                <CheckIcon size={14} className="text-green-600" />
              ) : (
                <CopyIcon size={14} />
              )}
            </span>
            Sao chép bảng
          </button>
          <button
            type="button"
            onClick={() => void handleDownloadExcel()}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-text-primary transition-colors hover:bg-[#1976D2]/8"
          >
            <span className="text-text-muted">
              <DownloadIcon size={14} />
            </span>
            Tải Excel (.xlsx)
          </button>
        </div>
      )}
    </div>
  );
};
