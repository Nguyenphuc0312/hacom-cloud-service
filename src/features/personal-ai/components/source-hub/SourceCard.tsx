import React, { useCallback, useState } from "react";
import { motion } from "framer-motion";
import {
  Trash2Icon,
  Loader2Icon,
  CheckIcon,
  DownloadIcon,
} from "lucide-react";
import clsx from "clsx";
import { ConfirmDialog } from "../../../../components/ui";
import type { PersonalDocument } from "../../types";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { getFileIconTypeByName } from "../../../../utils/formatFileSize";
import { FileTypeIcon } from "../../../../components/message/FileTypeIcon";

interface SourceCardProps {
  document: PersonalDocument;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onDownload: (id: string) => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUploadTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: vi });
  } catch {
    return "";
  }
}

export const SourceCard: React.FC<SourceCardProps> = ({
  document,
  isSelected,
  onToggle,
  onDelete,
  onDownload,
}) => {
  const isUploading = document.status === "uploading";
  const isError = document.status === "error";
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleToggle = useCallback(() => {
    if (!isUploading && !isError) onToggle(document.id);
  }, [document.id, isUploading, isError, onToggle]);

  // Mở hộp xác nhận thay vì xoá ngay — tránh xoá nhầm.
  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isUploading) setConfirmOpen(true);
    },
    [isUploading],
  );

  const confirmDelete = useCallback(() => {
    setConfirmOpen(false);
    onDelete(document.id);
  }, [document.id, onDelete]);

  // stopPropagation: nút tải KHÔNG được đổi trạng thái tick nguồn (contract §F).
  const handleDownload = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isUploading && !isError) onDownload(document.id);
    },
    [document.id, isUploading, isError, onDownload],
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      onClick={handleToggle}
      role="checkbox"
      aria-checked={isSelected}
      tabIndex={isUploading ? -1 : 0}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") handleToggle();
      }}
      className={clsx(
        "group relative flex cursor-pointer select-none items-start gap-3 rounded-xl border p-4 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2]/40",
        isUploading && "cursor-default opacity-60",
        isError && "cursor-default border-danger/30 bg-danger/5",
        isSelected && !isError && !isUploading
          ? "border-[#1976D2]/40 bg-[#1976D2]/6 shadow-sm shadow-[#1976D2]/8"
          : !isError && !isUploading
            ? "border-border bg-surface hover:border-border-strong hover:shadow-sm"
            : "",
      )}
    >
      {/* File icon */}
      <div
        className={clsx(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
          isSelected
            ? "bg-[#1565C0]/10"
            : isError
              ? "bg-danger/10 text-danger"
              : "bg-surface-hover group-hover:bg-surface-active",
        )}
      >
        {isUploading ? (
          <Loader2Icon size={18} strokeWidth={2} className="animate-spin text-text-muted" />
        ) : isError ? (
          <FileTypeIcon type={getFileIconTypeByName(document.name)} className="h-[18px] w-[18px] text-danger" />
        ) : (
          <FileTypeIcon type={getFileIconTypeByName(document.name)} className="h-[18px] w-[18px]" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-medium leading-snug text-text-primary"
          title={document.name}
        >
          {document.name}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-text-muted">
          {isUploading ? (
            <span className="text-[#1976D2]">Đang tải lên…</span>
          ) : isError ? (
            <span className="text-danger">Lỗi xử lý</span>
          ) : (
            <>
              {document.page_count != null && (
                <span>{document.page_count} trang</span>
              )}
              {document.page_count != null && document.uploaded_at && (
                <span className="text-text-disabled">·</span>
              )}
              {document.uploaded_at && (
                <span>{formatUploadTime(document.uploaded_at)}</span>
              )}
              {document.size_bytes != null && (
                <>
                  <span className="text-text-disabled">·</span>
                  <span>{formatBytes(document.size_bytes)}</span>
                </>
              )}
            </>
          )}
        </div>

        {/* "Used in conversation" tag */}
        {isSelected && !isUploading && !isError && (
          <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[#1565C0]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#1565C0]" />
            Đang sử dụng
          </div>
        )}
      </div>

      {/* Right side: checkbox trên, hàng nút tải/xóa dưới */}
      <div className="flex shrink-0 flex-col items-end justify-between self-stretch">
        {/* Checkbox */}
        {!isUploading && !isError ? (
          <div
            className={clsx(
              "flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all duration-150",
              isSelected
                ? "border-[#1565C0] bg-gradient-to-br from-[#1565C0] to-[#1976D2]"
                : "border-border group-hover:border-border-strong",
            )}
          >
            {isSelected && (
              <CheckIcon size={12} strokeWidth={3} className="text-white" />
            )}
          </div>
        ) : (
          <span />
        )}

        {/* Hàng nút: tải + xóa. Luôn hiện, cùng hàng, cách xa nhau (gap-3 +
            divider) để không bấm nhầm. Nút xóa tô đỏ. */}
        {!isUploading && (
          <div className="flex items-center gap-3">
            {!isError && (
              <button
                type="button"
                onClick={handleDownload}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-[#1565C0]/10 hover:text-[#1565C0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1565C0]/40"
                aria-label={`Tải xuống ${document.name}`}
                title="Tải file gốc"
              >
                <DownloadIcon size={15} strokeWidth={2} />
              </button>
            )}

            <span className="h-4 w-px bg-border" aria-hidden />

            <button
              type="button"
              onClick={handleDeleteClick}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-danger transition-colors hover:bg-danger/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
              aria-label={`Xóa ${document.name}`}
              title="Xóa tài liệu"
            >
              <Trash2Icon size={15} strokeWidth={2} />
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmDelete}
        title="Xóa tài liệu?"
        message={`Bạn có chắc muốn xóa "${document.name}"? Hành động này không thể hoàn tác.`}
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
      />
    </motion.div>
  );
};
