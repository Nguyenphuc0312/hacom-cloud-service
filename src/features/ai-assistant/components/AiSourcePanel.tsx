import React from "react";
import {
  FileTextIcon,
  XIcon,
  ExternalLinkIcon,
  BookOpenIcon,
} from "lucide-react";
import { useAiAssistantStore } from "../state/aiAssistantStore";
import { motion } from "framer-motion";
import type { AiSource } from "../types";
import { isSafeSourceUrl, getSourceLabel, getSourceMeta } from "../utils/sourceUtils";

/**
 * Panel bên phải hiển thị danh sách nguồn tham khảo.
 * Được mở thông qua toggleSourcePanel / setSelectedSources trong store.
 */
export const AiSourcePanel: React.FC = () => {
  const { selectedSources, toggleSourcePanel } = useAiAssistantStore();

  if (!selectedSources || selectedSources.length === 0) return null;

  const sources = selectedSources as AiSource[];

  return (
    <motion.div
      initial={{ x: 380, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 380, opacity: 0 }}
      transition={{ type: "spring", damping: 28, stiffness: 220 }}
      className="flex h-full w-[380px] flex-col bg-surface border-l border-border z-40 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <BookOpenIcon size={18} className="text-text-secondary" strokeWidth={2} />
          <h2 className="text-sm font-semibold text-text-primary">Nguồn tham khảo</h2>
          <span className="bg-surface-hover text-text-secondary text-[11px] px-2 py-0.5 rounded-full font-medium">
            {sources.length}
          </span>
        </div>
        <button
          onClick={() => toggleSourcePanel(false)}
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-secondary transition-colors"
          aria-label="Đóng panel"
        >
          <XIcon size={18} strokeWidth={2} />
        </button>
      </div>

      {/* Source list */}
      <div className="flex-1 overflow-y-auto ai-scrollbar p-4 space-y-3">
        {sources.map((source, index) => {
          const label = getSourceLabel(source);
          const meta = getSourceMeta(source);
          const safe = isSafeSourceUrl(source.open_url);

          const card = (
            <div className="flex items-start gap-3 mb-2">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-surface-hover flex items-center justify-center text-text-muted group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                <FileTextIcon size={20} strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  className="text-sm font-medium text-text-primary group-hover:text-primary transition-colors leading-snug line-clamp-2"
                  title={label}
                >
                  {source.citation_index != null && (
                    <span className="text-primary font-bold mr-1">[{source.citation_index}]</span>
                  )}
                  {label}
                </h3>
                {meta && (
                  <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">{meta}</p>
                )}
              </div>
              {safe && (
                <ExternalLinkIcon
                  size={14}
                  className="text-text-disabled group-hover:text-primary transition-colors shrink-0 mt-0.5"
                />
              )}
            </div>
          );

          if (safe) {
            return (
              <a
                key={`${source.citation_index ?? index}-${index}`}
                href={source.open_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block p-4 rounded-xl border border-border bg-surface hover:border-border-strong hover:shadow-sm transition-all"
              >
                {card}
              </a>
            );
          }

          return (
            <div
              key={`${source.citation_index ?? index}-${index}`}
              className="group p-4 rounded-xl border border-border bg-surface opacity-70 cursor-not-allowed"
              title="Không có liên kết tài liệu"
            >
              {card}
            </div>
          );
        })}
      </div>

      {/* Footer disclaimer */}
      <div className="px-5 py-3 border-t border-border">
        <p className="text-[11px] text-text-muted leading-relaxed">
          Các nguồn tham khảo được truy xuất từ cơ sở dữ liệu nội bộ HACOM.
          Hãy kiểm chứng các thông tin quan trọng.
        </p>
      </div>
    </motion.div>
  );
};
