import React, { useEffect, useRef, useState } from "react";
import {
  PrinterIcon,
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
  printTablePdf,
} from "../../services/tableExport";
import { logger } from "../../../../utils/logger";

interface TableExportMenuProps {
  /** Nội dung markdown của tin nhắn (chứa bảng để parse). */
  content: string;
  /** Tiêu đề dùng cho file/bản in. */
  title: string;
}

type ItemKey = "print" | "pdf" | "excel" | "word";

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

  const handleExport = async (key: ItemKey) => {
    setOpen(false);
    const table = parseMarkdownTable(content);
    if (!table || table.headers.length === 0) {
      logger.warn("TableExportMenu", "no-table-found");
      return;
    }
    try {
      setBusy(key);
      if (key === "print") {
        await printTablePdf(title, table);
      } else if (key === "excel") {
        exportTableToXlsx(fileBase, table);
      } else if (key === "word") {
        await exportTableToDocx(fileBase, title, table);
      } else {
        await exportTableToPdf(fileBase, title, table);
      }
    } catch (err) {
      logger.error("TableExportMenu", "export-failed", { key, err });
    } finally {
      setBusy(null);
    }
  };

  const items: { key: ItemKey; label: string; icon: React.ReactNode }[] = [
    { key: "print", label: "In", icon: <PrinterIcon size={14} /> },
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
    <div ref={rootRef} className="absolute right-2.5 top-2.5 z-10">
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
        Xuất & In
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
