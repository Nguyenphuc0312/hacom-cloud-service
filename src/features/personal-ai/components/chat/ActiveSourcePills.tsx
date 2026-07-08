import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileTextIcon, XIcon, ZapOffIcon, ZapIcon } from "lucide-react";
import clsx from "clsx";
import type { PersonalDocument } from "../../types";

interface ActiveSourcePillsProps {
  activeDocuments: PersonalDocument[];
  onRemoveSource: (id: string) => void;
  isRagMode: boolean;
}

export const ActiveSourcePills: React.FC<ActiveSourcePillsProps> = ({
  activeDocuments,
  onRemoveSource,
  isRagMode,
}) => {
  return (
    <div
      className={clsx(
        "flex min-h-[32px] flex-wrap items-center gap-1.5 px-1 transition-all duration-300",
      )}
    >
      {isRagMode ? (
        <>
          {/* Mode badge */}
          <div className="flex items-center gap-1 rounded-full bg-[#1565C0]/10 px-2 py-1">
            <ZapIcon size={10} strokeWidth={2.5} className="text-[#1565C0]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#1565C0]">
              Nguồn:
            </span>
          </div>

          {/* Source pills */}
          <AnimatePresence initial={false}>
            {activeDocuments.map((doc) => (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, scale: 0.85, x: -8 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ type: "spring", damping: 20, stiffness: 300 }}
                className="flex items-center gap-1.5 rounded-full border border-[#1976D2]/30 bg-[#1976D2]/10 pl-2 pr-1 py-1"
              >
                <FileTextIcon size={11} strokeWidth={2} className="text-[#1565C0] shrink-0" />
                <span
                  className="max-w-[120px] truncate text-[11px] font-medium text-[#1565C0]"
                  title={doc.name}
                >
                  {doc.name.replace(/\.pdf$/i, "")}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveSource(doc.id)}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-[#1565C0]/60 transition-colors hover:bg-[#1565C0]/15 hover:text-[#1565C0]"
                  aria-label={`Bỏ nguồn ${doc.name}`}
                >
                  <XIcon size={9} strokeWidth={2.5} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </>
      ) : (
        <div className="flex items-center gap-1.5 text-[11px] text-text-disabled">
          <ZapOffIcon size={11} strokeWidth={2} />
          <span>Không có nguồn — AI trả lời từ kiến thức chung</span>
        </div>
      )}
    </div>
  );
};
