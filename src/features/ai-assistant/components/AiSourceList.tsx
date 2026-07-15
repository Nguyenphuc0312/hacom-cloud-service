import React, { useState } from "react";
import { BookOpenIcon, ExternalLinkIcon } from "lucide-react";
import type { AiSource } from "../types";
import { getSourceHref, getSourceLabel, getSourceMeta } from "../utils/sourceUtils";
import { useOpenAiSource } from "../hooks/useOpenAiSource";
import { getFileIconTypeByName } from "../../../utils/formatFileSize";
import { FileTypeIcon } from "../../../components/message/FileTypeIcon";

/** Chuỗi tên/label chứa phần mở rộng file để suy ra loại icon (pdf/word/excel…). */
function getSourceFileName(source: AiSource): string {
  return source.source_file || source.document_name || source.source_name || source.display_label || "";
}

interface AiSourceListProps {
  sources: AiSource[];
}

const INITIAL_VISIBLE = 3;

/**
 * Khu vực "Nguồn tham khảo" hiển thị bên dưới câu trả lời AI.
 * Mặc định hiển thị 3 nguồn đầu, có nút xem thêm.
 * Mỗi nguồn click để mở tài liệu gốc (auth-fetch) nếu có link hợp lệ (getSourceHref).
 */
export const AiSourceList: React.FC<AiSourceListProps> = ({ sources }) => {
  const [expanded, setExpanded] = useState(false);
  const { open, openingUrl, isOpening } = useOpenAiSource();

  if (!sources || sources.length === 0) return null;

  const sorted = [...sources].sort((a, b) => a.citation_index - b.citation_index);
  const visible = expanded ? sorted : sorted.slice(0, INITIAL_VISIBLE);
  const remaining = sorted.length - INITIAL_VISIBLE;

  return (
    <div className="mt-4 rounded-xl border border-border overflow-hidden text-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-surface-overlay/50">
        <BookOpenIcon size={13} className="text-text-secondary" strokeWidth={2} />
        <span className="text-xs font-semibold text-text-secondary">
          Nguồn tham khảo
        </span>
        <span className="ml-auto text-[10px] text-text-muted bg-surface-hover px-1.5 py-0.5 rounded-full font-medium">
          {sources.length}
        </span>
      </div>

      {/* Source items */}
      <div className="divide-y divide-border">
        {visible.map((source) => {
          const label = getSourceLabel(source);
          const meta = getSourceMeta(source);
          const href = getSourceHref(source);
          const safe = Boolean(href);

          const inner = (
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="shrink-0 flex items-center justify-center w-5 h-5 rounded bg-surface-hover mt-0.5">
                <FileTypeIcon
                  type={getFileIconTypeByName(getSourceFileName(source))}
                  className="h-3 w-3"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold text-primary mr-1">
                      [{source.citation_index}]
                    </span>
                    <span
                      className={`text-xs leading-snug break-words ${
                        safe
                          ? "text-text-primary group-hover:text-primary transition-colors"
                          : "text-text-secondary"
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                  {safe && (
                    <ExternalLinkIcon
                      size={11}
                      className="text-text-disabled group-hover:text-primary transition-colors shrink-0 mt-0.5"
                    />
                  )}
                </div>
                {meta && (
                  <p className="text-[10px] text-text-muted mt-0.5 leading-relaxed">
                    {meta}
                  </p>
                )}
              </div>
            </div>
          );

          if (safe) {
            return (
              <button
                key={source.citation_index}
                type="button"
                onClick={() => void open(href)}
                disabled={isOpening}
                aria-busy={openingUrl === href}
                className="group block w-full text-left hover:bg-surface-overlay/60 transition-colors disabled:cursor-wait"
              >
                {inner}
              </button>
            );
          }

          return (
            <div
              key={source.citation_index}
              className="opacity-60 cursor-not-allowed"
              title="Không có liên kết tài liệu"
            >
              {inner}
            </div>
          );
        })}
      </div>

      {/* Expand button */}
      {!expanded && remaining > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full py-2 text-[11px] text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors border-t border-border"
        >
          Xem thêm {remaining} nguồn
        </button>
      )}
    </div>
  );
};
