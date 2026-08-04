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
  SearchIcon,
  XIcon,
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
    syncSelectedSources,
  } = usePersonalDocuments();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const activeCount = selectedDocumentIds.length;
  const totalCount = documents.length;
  const allSelected = totalCount > 0 && activeCount === totalCount;

  const filteredDocuments = searchQuery.trim()
    ? documents.filter((d) =>
        d.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : documents;

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
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#1565C0] to-[#1976D2]">
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
                  className="flex items-center gap-1 rounded-full bg-[#1565C0]/10 px-2 py-1"
                >
                  <ZapIcon size={10} strokeWidth={2.5} className="text-[#1565C0]" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#1565C0]">
                    RAG
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Add document button */}
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#1565C0]/30 bg-[#1565C0]/4 px-3 py-2.5 text-sm font-medium text-[#1565C0] transition-all hover:border-[#1565C0]/50 hover:bg-[#1565C0]/8 active:scale-[0.98]"
          >
            <PlusIcon size={16} strokeWidth={2.5} />
            Thêm tài liệu
          </button>

          {/* Search input */}
          {totalCount > 0 && (
            <div className="mt-2 relative">
              <SearchIcon
                size={14}
                strokeWidth={2}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tài liệu…"
                className="w-full rounded-xl border border-border bg-surface py-2 pl-8 pr-8 text-xs text-text-primary placeholder:text-text-muted focus:border-[#1565C0]/40 focus:outline-none focus:ring-1 focus:ring-[#1565C0]/20 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                  aria-label="Xóa tìm kiếm"
                >
                  <XIcon size={13} strokeWidth={2.5} />
                </button>
              )}
            </div>
          )}
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
              onClick={() =>
                syncSelectedSources(allSelected ? [] : documents.filter((d) => d.status !== "uploading" && d.status !== "error").map((d) => d.id))
              }
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary"
              title={allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
            >
              {allSelected ? (
                <>
                  <CheckSquare2Icon size={12} strokeWidth={2} className="text-[#1565C0]" />
                  <span className="text-[#1565C0]">Bỏ tất cả</span>
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
                  Thêm tài liệu để AI có thể trả lời dựa trên nội dung của bạn
                </p>
              </div>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <SearchIcon size={20} strokeWidth={1.5} className="text-text-muted" />
              <p className="text-xs text-text-muted">
                Không tìm thấy tài liệu nào khớp với <span className="font-medium text-text-secondary">"{searchQuery}"</span>
              </p>
            </div>
          ) : (
            <div className="space-y-2 pt-1">
              <AnimatePresence initial={false}>
                {filteredDocuments.map((doc) => (
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
              ? "bg-gradient-to-br from-[#1565C0]/8 to-[#1976D2]/6 border border-[#1976D2]/20"
              : "bg-surface-hover",
          )}
        >
          <div className="flex items-start gap-2.5">
            <div
              className={clsx(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
                isRagMode
                  ? "bg-[#1565C0]/15 text-[#1565C0]"
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
