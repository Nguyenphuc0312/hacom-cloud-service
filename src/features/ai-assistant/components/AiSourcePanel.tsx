import React from "react";
import {
  FileTextIcon,
  XIcon,
  ExternalLinkIcon,
  BookOpenIcon,
} from "lucide-react";
import { useAiAssistantStore } from "../state/aiAssistantStore";
import { motion } from "framer-motion";

/**
 * Panel bên phải hiển thị danh sách nguồn tham khảo đã dùng cho câu trả lời AI.
 */
export const AiSourcePanel: React.FC = () => {
  const { selectedSources, toggleSourcePanel } = useAiAssistantStore();

  if (!selectedSources || selectedSources.length === 0) return null;

  return (
    <motion.div
      initial={{ x: 380, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 380, opacity: 0 }}
      transition={{ type: "spring", damping: 28, stiffness: 220 }}
      className="flex h-full w-[380px] flex-col bg-white border-l border-gray-200 z-40 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <BookOpenIcon size={18} className="text-gray-600" strokeWidth={2} />
          <h2 className="text-sm font-semibold text-gray-800">
            Nguồn tham khảo
          </h2>
          <span className="bg-gray-100 text-gray-600 text-[11px] px-2 py-0.5 rounded-full font-medium">
            {selectedSources.length}
          </span>
        </div>
        <button
          onClick={() => toggleSourcePanel(false)}
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Đóng panel"
        >
          <XIcon size={18} strokeWidth={2} />
        </button>
      </div>

      {/* Source list */}
      <div className="flex-1 overflow-y-auto ai-scrollbar p-4 space-y-3">
        {selectedSources.map((source, index) => (
          <div
            key={`${source.document_id}-${index}`}
            className="group p-4 rounded-xl border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                <FileTextIcon size={20} strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  className="text-sm font-medium text-gray-800 group-hover:text-blue-600 transition-colors leading-snug line-clamp-2"
                  title={source.source_name}
                >
                  {source.source_name}
                </h3>
                <span className="text-xs text-gray-400 mt-0.5 block">
                  Trang {source.page_number}
                </span>
              </div>
              <ExternalLinkIcon
                size={14}
                className="text-gray-300 group-hover:text-blue-500 transition-colors shrink-0 mt-0.5"
              />
            </div>

            {/* Relevance score */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{
                    width: `${Math.round((source.final_score || 0) * 100)}%`,
                  }}
                />
              </div>
              <span className="text-[10px] text-gray-400 font-medium">
                {Math.round((source.final_score || 0) * 100)}%
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer disclaimer */}
      <div className="px-5 py-3 border-t border-gray-100">
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Các nguồn tham khảo được truy xuất từ cơ sở dữ liệu nội bộ HACOM.
          Hãy kiểm chứng các thông tin quan trọng.
        </p>
      </div>
    </motion.div>
  );
};
