import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookMarkedIcon,
  PlusIcon,
  Loader2Icon,
  LibraryIcon,
  CheckSquare2Icon,
  Square,
  ZapIcon,
  BrainIcon,
} from "lucide-react";
import clsx from "clsx";
import { SourceCard } from "./SourceCard";
import { UploadModal } from "./UploadModal";
import { usePersonalDocuments } from "../../hooks/usePersonalDocuments";

export const SourceHubPanel: React.FC = () => {
  const {
    documents,
    selectedDocumentIds,
    isRagMode,
    documentsLoaded,
    uploadDocument,
    deleteDocument,
    handleToggleSource,
    selectAllDocuments,
    deselectAllDocuments,
  } = usePersonalDocuments();

  const [uploadOpen, setUploadOpen] = useState(false);

  const activeCount = selectedDocumentIds.length;
  const totalCount = documents.length;
  const allSelected = totalCount > 0 && activeCount === totalCount;

  return (
    <>
      <UploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUpload={uploadDocument}
      />

      <div className="flex h-full w-[340px] flex-col border-l border-border bg-surface-overlay/60 backdrop-blur-sm">
        {/* Header */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#C41E3A] to-[#D32F2F]">
                <BookMarkedIcon size={14} strokeWidth={2} className="text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-text-primary">Sources</h2>
                <p className="text-[10px] text-text-muted leading-none mt-0.5">
                  Nguồn kiến thức AI
                </p>
              </div>
            </div>

            {/* RAG mode indicator */}
            <AnimatePresence>
              {isRagMode && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-1 rounded-full bg-[#C41E3A]/10 px-2 py-1"
                >
                  <ZapIcon size={10} strokeWidth={2.5} className="text-[#C41E3A]" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#C41E3A]">
                    RAG
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Add PDF button */}
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#C41E3A]/30 bg-[#C41E3A]/4 px-3 py-2.5 text-sm font-medium text-[#C41E3A] transition-all hover:border-[#C41E3A]/50 hover:bg-[#C41E3A]/8 active:scale-[0.98]"
          >
            <PlusIcon size={16} strokeWidth={2.5} />
            Thêm PDF
          </button>
        </div>

        {/* Divider + status bar */}
        {totalCount > 0 && (
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-t border-border">
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <LibraryIcon size={12} strokeWidth={2} />
              <span>
                <span className="font-semibold text-text-primary">{activeCount}</span>
                {" / "}{totalCount} nguồn đang dùng
              </span>
            </div>

            <button
              type="button"
              onClick={allSelected ? deselectAllDocuments : selectAllDocuments}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary"
              title={allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
            >
              {allSelected ? (
                <>
                  <CheckSquare2Icon size={12} strokeWidth={2} className="text-[#C41E3A]" />
                  <span className="text-[#C41E3A]">Bỏ tất cả</span>
                </>
              ) : (
                <>
                  <Square size={12} strokeWidth={2} />
                  <span>Chọn tất cả</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Source list */}
        <div className="flex-1 overflow-y-auto px-3 pb-4 ai-scrollbar">
          {!documentsLoaded ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2Icon
                size={24}
                strokeWidth={1.8}
                className="animate-spin text-text-muted"
              />
              <p className="text-xs text-text-muted">Đang tải tài liệu…</p>
            </div>
          ) : totalCount === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-hover">
                <LibraryIcon size={24} strokeWidth={1.4} className="text-text-muted" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  Chưa có tài liệu
                </p>
                <p className="mt-1 max-w-[200px] text-xs leading-relaxed text-text-muted">
                  Thêm tệp PDF để AI có thể trả lời dựa trên nội dung của bạn
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 pt-1">
              <AnimatePresence initial={false}>
                {documents.map((doc) => (
                  <SourceCard
                    key={doc.id}
                    document={doc}
                    isSelected={selectedDocumentIds.includes(doc.id)}
                    onToggle={handleToggleSource}
                    onDelete={deleteDocument}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Footer — knowledge mode explanation */}
        <div
          className={clsx(
            "flex-shrink-0 mx-3 mb-3 rounded-2xl p-3 transition-all duration-300",
            isRagMode
              ? "bg-gradient-to-br from-[#C41E3A]/8 to-[#FFC857]/6 border border-[#FFC857]/20"
              : "bg-surface-hover",
          )}
        >
          <div className="flex items-start gap-2.5">
            <div
              className={clsx(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
                isRagMode
                  ? "bg-[#C41E3A]/15 text-[#C41E3A]"
                  : "bg-surface-active text-text-muted",
              )}
            >
              <BrainIcon size={12} strokeWidth={2} />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-text-primary">
                {isRagMode ? "Chế độ Kiến Thức" : "Chế độ Thông Thường"}
              </p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-text-muted">
                {isRagMode
                  ? `AI đang dùng ${activeCount} nguồn tài liệu để trả lời.`
                  : "Chọn tài liệu để AI trả lời dựa trên nội dung của bạn."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
