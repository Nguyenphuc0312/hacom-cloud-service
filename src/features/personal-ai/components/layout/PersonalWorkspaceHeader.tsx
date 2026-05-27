import React from "react";
import { SparklesIcon, PlusIcon, BookMarkedIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { usePersonalAiStore } from "../../stores/personalAiStore";
import { usePersonalDocuments } from "../../hooks/usePersonalDocuments";

export const PersonalWorkspaceHeader: React.FC = () => {
  const { createConversation } = usePersonalAiStore();
  const { isRagMode, activeDocuments } = usePersonalDocuments();

  return (
    <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-4 sticky top-0 z-20">
      {/* Left — brand */}
      <div className="flex items-center gap-2">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-md"
          style={{
            background:
              "linear-gradient(135deg, #C41E3A 0%, #D32F2F 50%, #FFC857 100%)",
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
              <div className="flex items-center gap-1 rounded-full bg-[#C41E3A]/10 px-2 py-0.5">
                <BookMarkedIcon size={10} strokeWidth={2} className="text-[#C41E3A]" />
                <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-[#C41E3A]">
                  {activeDocuments.length} nguồn
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right — new conversation */}
      <button
        type="button"
        onClick={() => createConversation()}
        className={clsx(
          "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
          "text-text-muted hover:bg-surface-hover hover:text-text-secondary",
        )}
        title="Cuộc trò chuyện mới"
      >
        <PlusIcon size={14} strokeWidth={2.5} />
        Mới
      </button>
    </header>
  );
};
