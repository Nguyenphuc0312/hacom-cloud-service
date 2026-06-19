import React, { useEffect, useRef, useState } from "react";
import {
  FileTextIcon,
  FileSpreadsheetIcon,
  FileIcon,
  DownloadIcon,
  Loader2Icon,
  ChevronDownIcon,
} from "lucide-react";
import clsx from "clsx";
import {
  parseMarkdownTable,
  exportTableToXlsx,
  exportTableToDocx,
  exportTableToPdf,
} from "../../services/tableExport";
import { logger } from "../../../../utils/logger";
import { toast } from "../../../../utils/toast";

interface TableExportMenuProps {
  /** Nội dung markdown của tin nhắn (chứa bảng để parse). */
  content: string;
  /** Tiêu đề dùng cho file/bản in. */
  title: string;
}

type ItemKey = "pdf" | "excel" | "word";

export const TableExportMenu: React.FC<TableExportMenuProps> = ({
  content,
  title,
}) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ItemKey | null>(null);
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

  const FORMAT_LABEL: Record<ItemKey, string> = {
    pdf: "PDF",
    excel: "Excel",
    word: "Word",
  };

  const handleExport = async (key: ItemKey) => {
    setOpen(false);
    const table = parseMarkdownTable(content);
    if (!table || table.headers.length === 0) {
      logger.warn("TableExportMenu", "no-table-found");
      toast.error("Không tìm thấy bảng để xuất file.");
      return;
    }
    try {
      setBusy(key);
      let saved = false;
      if (key === "excel") {
        saved = await exportTableToXlsx(fileBase, table);
      } else if (key === "word") {
        saved = await exportTableToDocx(fileBase, title, table);
      } else {
        saved = await exportTableToPdf(fileBase, title, table);
      }
      // Chỉ báo thành công khi file đã thật sự được lưu (không báo nếu người
      // dùng bấm Hủy ở hộp thoại "Save as").
      if (saved) {
        toast.success(`Xuất file ${FORMAT_LABEL[key]} thành công.`);
      }
    } catch (err) {
      logger.error("TableExportMenu", "export-failed", { key, err });
      toast.error(`Xuất file ${FORMAT_LABEL[key]} thất bại. Vui lòng thử lại.`);
    } finally {
      setBusy(null);
    }
  };

  const items: { key: ItemKey; label: string; icon: React.ReactNode }[] = [
    { key: "pdf", label: "Xuất PDF (.pdf)", icon: <FileTextIcon size={14} /> },
    {
      key: "excel",
      label: "Xuất Excel (.xlsx)",
      icon: <FileSpreadsheetIcon size={14} />,
    },
    { key: "word", label: "Xuất Word (.docx)", icon: <FileIcon size={14} /> },
  ];

  const anyBusy = busy !== null;

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={anyBusy}
        className="flex items-center gap-1 rounded-lg border border-border bg-surface/95 px-2 py-1 text-[11px] font-medium text-text-secondary shadow-sm backdrop-blur-sm transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
        title="In / Xuất file"
      >
        {anyBusy ? (
          <Loader2Icon size={13} className="animate-spin" />
        ) : (
          <DownloadIcon size={13} />
        )}
        Xuất File
        <ChevronDownIcon
          size={12}
          className={clsx("transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 min-w-[180px] overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg">
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              onClick={() => void handleExport(it.key)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-text-primary transition-colors hover:bg-[#1976D2]/8"
            >
              <span className="text-text-muted">{it.icon}</span>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
