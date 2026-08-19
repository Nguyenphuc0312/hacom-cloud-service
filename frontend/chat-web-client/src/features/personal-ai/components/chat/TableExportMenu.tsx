import React, { useEffect, useRef, useState } from "react";
import {
  DownloadIcon,
  CopyIcon,
  CheckIcon,
  Loader2Icon,
  TableIcon,
  ChevronDownIcon,
} from "lucide-react";
import clsx from "clsx";
import {
  parseMarkdownTable,
  exportTableToXlsx,
  tableToPlainText,
  ExportExpiredError,
} from "../../services/tableExport";
import { useWorkReportScopeStore } from "../../stores/workReportScopeStore";
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
  /**
   * Epoch phạm vi lúc tạo bảng (§5). Khác epoch hiện tại = user đã đổi scope →
   * snapshot cũ không khớp token mới → vô hiệu Xuất Excel. undefined = bảng
   * không thuộc phạm vi báo cáo → luôn cho xuất.
   */
  scopeEpoch?: number;
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
  scopeEpoch,
}) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // §5: bảng thuộc phạm vi báo cáo bị "hết hạn" khi user đổi scope (epoch đổi).
  const currentEpoch = useWorkReportScopeStore((s) => s.dataEpoch);
  const scopeStale = scopeEpoch !== undefined && scopeEpoch !== currentEpoch;

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
    // §5: đổi scope → snapshot cũ không khớp token mới. Chặn xuất, yêu cầu hỏi lại.
    if (scopeStale) {
      toast.error(
        "Bạn đã đổi phạm vi báo cáo. Vui lòng hỏi lại báo cáo để xuất theo phạm vi mới.",
      );
      return;
    }
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
        aria-haspopup="menu"
        aria-expanded={open ? "true" : "false"}
        className={clsx(
          "flex items-center gap-1.5 rounded-lg border border-transparent px-2 py-1 text-[12px] font-medium text-text-muted transition-colors",
          "hover:border-border hover:bg-surface-hover hover:text-text-secondary disabled:opacity-50",
          open && "border-border bg-surface-hover text-text-secondary",
        )}
        title="Tùy chọn bảng"
      >
        {busy ? (
          <Loader2Icon size={14} className="animate-spin" />
        ) : (
          <TableIcon size={13} strokeWidth={2} />
        )}
        <span>Bảng</span>
        <ChevronDownIcon
          size={13}
          strokeWidth={2}
          className={clsx("transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute right-0 bottom-full z-10 mb-1 min-w-[180px] overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg">
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
            disabled={scopeStale}
            title={
              scopeStale
                ? "Đã đổi phạm vi báo cáo — hỏi lại báo cáo để xuất theo phạm vi mới."
                : undefined
            }
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-text-primary transition-colors hover:bg-[#1976D2]/8 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
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
