import React, { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  XIcon,
  UploadCloudIcon,
  FileTextIcon,
  Loader2Icon,
  CheckCircle2Icon,
  AlertCircleIcon,
} from "lucide-react";
import clsx from "clsx";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (
    file: File,
    options?: { onProgress?: (pct: number) => void },
  ) => Promise<boolean>;
}

type UploadState =
  | { phase: "idle" }
  | { phase: "dragging" }
  | { phase: "uploading"; file: File; progress: number }
  | { phase: "success"; fileName: string }
  | { phase: "error"; message: string };

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx"];
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const ACCEPT_LIST = ALLOWED_EXTENSIONS.join(",");

const isAllowedFile = (file: File): boolean => {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (ALLOWED_EXTENSIONS.includes(ext)) return true;
  if (file.type && ALLOWED_MIME_TYPES.has(file.type)) return true;
  return false;
};

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUpload,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const dragCountRef = useRef(0);

  const handleFile = useCallback(
    async (file: File) => {
      setState({ phase: "uploading", file, progress: 0 });
      const ok = await onUpload(file, {
        onProgress: (pct) =>
          setState((s) =>
            s.phase === "uploading" ? { ...s, progress: pct } : s,
          ),
      });
      if (ok) {
        setState({ phase: "success", fileName: file.name });
        setTimeout(() => {
          onClose();
          setState({ phase: "idle" });
        }, 1200);
      } else {
        setState({ phase: "error", message: "Tải lên thất bại." });
      }
    },
    [onUpload, onClose],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCountRef.current = 0;
      setState({ phase: "idle" });
      const file = Array.from(e.dataTransfer.files).find((f) => isAllowedFile(f));
      if (!file) {
        setState({
          phase: "error",
          message: "Chỉ hỗ trợ PDF/DOC/DOCX/XLS/XLSX. Vui lòng thả tệp hợp lệ.",
        });
        return;
      }
      void handleFile(file);
    },
    [handleFile],
  );

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current += 1;
    if (state.phase !== "uploading")
      setState({ phase: "dragging" });
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current -= 1;
    if (dragCountRef.current === 0 && state.phase === "dragging")
      setState({ phase: "idle" });
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleClose = () => {
    if (state.phase === "uploading") return;
    onClose();
    setState({ phase: "idle" });
  };

  const isUploading = state.phase === "uploading";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-md -translate-y-1/2 overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <div>
                <h2 className="text-base font-bold text-text-primary">
                  Thêm tài liệu
                </h2>
                <p className="mt-0.5 text-xs text-text-muted">
                  Hỗ trợ PDF, DOC/DOCX, XLS/XLSX
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={isUploading}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary disabled:opacity-40"
                aria-label="Đóng"
              >
                <XIcon size={18} strokeWidth={2} />
              </button>
            </div>

            {/* Drop zone */}
            <div className="px-6 pb-6">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_LIST}
                className="hidden"
                onChange={handleFileInput}
                aria-hidden="true"
              />

              <AnimatePresence mode="wait">
                {state.phase === "success" ? (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-3 py-10"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10">
                      <CheckCircle2Icon
                        size={28}
                        strokeWidth={1.8}
                        className="text-green-600"
                      />
                    </div>
                    <p className="text-center text-sm font-medium text-text-primary">
                      Tải lên thành công
                    </p>
                    <p className="max-w-[260px] truncate text-center text-xs text-text-muted">
                      {state.fileName}
                    </p>
                  </motion.div>
                ) : state.phase === "uploading" ? (
                  <motion.div
                    key="uploading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center gap-4 py-10"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#C41E3A]/10">
                      <Loader2Icon
                        size={28}
                        strokeWidth={1.8}
                        className="animate-spin text-[#C41E3A]"
                      />
                    </div>
                    <div className="w-full">
                      <div className="mb-1.5 flex items-center justify-between text-xs text-text-muted">
                        <span className="truncate max-w-[200px]">
                          {state.file.name}
                        </span>
                        <span className="shrink-0 font-medium text-[#C41E3A]">
                          {state.progress}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-[#C41E3A] to-[#FFC857]"
                          initial={{ width: 0 }}
                          animate={{ width: `${state.progress}%` }}
                          transition={{ ease: "linear" }}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-text-muted">
                      Đang xử lý và lập chỉ mục tài liệu…
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onDrop={handleDrop}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onClick={() => fileInputRef.current?.click()}
                    className={clsx(
                      "flex cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all duration-150",
                      state.phase === "dragging"
                        ? "border-[#C41E3A]/60 bg-[#C41E3A]/5 scale-[1.01]"
                        : state.phase === "error"
                          ? "border-danger/40 bg-danger/5"
                          : "border-border hover:border-[#FFC857]/50 hover:bg-[#FFC857]/4",
                    )}
                  >
                    <motion.div
                      animate={
                        state.phase === "dragging"
                          ? { scale: 1.1, y: -4 }
                          : { scale: 1, y: 0 }
                      }
                      transition={{ type: "spring", damping: 18 }}
                      className={clsx(
                        "flex h-14 w-14 items-center justify-center rounded-2xl",
                        state.phase === "dragging"
                          ? "bg-[#C41E3A]/15 text-[#C41E3A]"
                          : state.phase === "error"
                            ? "bg-danger/10 text-danger"
                            : "bg-surface-hover text-text-muted",
                      )}
                    >
                      {state.phase === "error" ? (
                        <AlertCircleIcon size={28} strokeWidth={1.6} />
                      ) : state.phase === "dragging" ? (
                        <UploadCloudIcon size={28} strokeWidth={1.6} />
                      ) : (
                        <FileTextIcon size={28} strokeWidth={1.6} />
                      )}
                    </motion.div>

                    {state.phase === "error" ? (
                      <>
                        <p className="text-sm font-semibold text-danger">
                          {state.message}
                        </p>
                        <p className="text-xs text-text-muted">
                          Nhấn để thử lại
                        </p>
                      </>
                    ) : (
                      <>
                        <div>
                          <p className="text-sm font-semibold text-text-primary">
                            {state.phase === "dragging"
                              ? "Thả tệp vào đây"
                              : "Kéo thả tệp vào đây"}
                          </p>
                          <p className="mt-1 text-xs text-text-muted">
                            hoặc{" "}
                            <span className="font-medium text-[#C41E3A]">
                              nhấn để chọn tệp
                            </span>
                          </p>
                        </div>
                        <p className="text-[11px] text-text-disabled">
                          Hỗ trợ PDF/DOC/DOCX/XLS/XLSX · Tối đa 50 MB
                        </p>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
