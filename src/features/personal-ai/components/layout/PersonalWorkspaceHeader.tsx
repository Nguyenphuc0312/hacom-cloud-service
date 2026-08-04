import React from "react";
import { SparklesIcon, BookMarkedIcon, PanelRightIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { usePersonalAiStore } from "../../stores/personalAiStore";
import { usePersonalDocuments } from "../../hooks/usePersonalDocuments";

export const PersonalWorkspaceHeader: React.FC = () => {
  const { isRagMode, activeDocuments } = usePersonalDocuments();
  const { isSourcePanelOpen, toggleSourcePanel } = usePersonalAiStore();

  return (
    <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-4 sticky top-0 z-20">
      {/* Left — brand */}
      <div className="flex items-center gap-2">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-md"
          style={{
            background:
              "linear-gradient(135deg, #1565C0 0%, #1976D2 100%)",
          }}
        >
          <SparklesIcon size={13} strokeWidth={2.5} className="text-white" />
        </div>
        <span className="text-sm font-bold text-text-primary">
          Trợ lý ảo cá nhân
        </span>

        {/* RAG badge */}
        <AnimatePresence>
          {isRagMode && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-1 rounded-full bg-[#1565C0]/10 px-2 py-0.5">
                <BookMarkedIcon size={10} strokeWidth={2} className="text-[#1565C0]" />
                <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-[#1565C0]">
                  {activeDocuments.length} nguồn
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right — source panel toggle */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => toggleSourcePanel()}
          className={clsx(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-all",
            isSourcePanelOpen
              ? "bg-surface-active text-text-secondary"
              : "text-text-muted hover:bg-surface-hover hover:text-text-secondary",
          )}
          title="Tài liệu tham chiếu"
          aria-label="Toggle source panel"
        >
          <PanelRightIcon size={18} strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
};
