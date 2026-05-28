import React, {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
} from "react";
import clsx from "clsx";
import {
  ArrowUpIcon,
  FileTextIcon,
  Loader2Icon,
  PaperclipIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { ActiveSourcePills } from "./ActiveSourcePills";
import { usePersonalDocuments } from "../../hooks/usePersonalDocuments";

const WEEKLY_REPORT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv";

interface PersonalChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  isRagMode?: boolean;
  /** File đang stage để gửi kèm câu hỏi. */
  pendingFile?: File | null;
  /** Callback khi user chọn file. */
  onAttachFile?: (file: File) => void;
  /** Callback xoá file đã stage. */
  onRemoveFile?: () => void;
  /** Đang upload (disable gửi và textarea). */
  isUploading?: boolean;
}

const LINE_HEIGHT = 24;
const MAX_LINES = 6;
const MAX_HEIGHT = LINE_HEIGHT * MAX_LINES;

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const PersonalChatInput = forwardRef<
  HTMLTextAreaElement,
  PersonalChatInputProps
>(
  (
    {
      value,
      onChange,
      onSubmit,
      onStop,
      isStreaming = false,
      pendingFile = null,
      onAttachFile,
      onRemoveFile,
      isUploading = false,
    },
    ref,
  ) => {
    const { activeDocuments, isRagMode, handleToggleSource } =
      usePersonalDocuments();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const adjustHeight = useCallback((el: HTMLTextAreaElement) => {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
    }, []);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value);
        adjustHeight(e.target);
      },
      [onChange, adjustHeight],
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const trimmed = value.trim();
        if (trimmed && !isStreaming && !isUploading) {
          onSubmit(trimmed);
          if (ref && "current" in ref && ref.current) {
            ref.current.style.height = "52px";
          }
        }
      }
    };

    // Reset height on submit (when value cleared externally)
    useEffect(() => {
      if (!value && ref && "current" in ref && ref.current) {
        ref.current.style.height = "52px";
      }
    }, [value, ref]);

    const handleFileChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file && onAttachFile) {
          onAttachFile(file);
        }
      },
      [onAttachFile],
    );

    const canSend =
      value.trim().length > 0 && !isStreaming && !isUploading;
    const attachDisabled = isStreaming || isUploading || !!pendingFile;

    const placeholder = pendingFile
      ? "Đặt câu hỏi về tệp đã đính kèm..."
      : isRagMode
        ? `Hỏi AI về ${
            activeDocuments.length > 1
              ? `${activeDocuments.length} tài liệu`
              : activeDocuments[0]?.name.replace(/\.(pdf|doc|docx|xls|xlsx)$/i, "") ??
                "tài liệu"
          }…`
        : "Hỏi bất cứ điều gì…";

    return (
      <div className="w-full">
        {/* Source pills row */}
        <div className="mb-2">
          <ActiveSourcePills
            activeDocuments={activeDocuments}
            onRemoveSource={handleToggleSource}
            isRagMode={isRagMode}
          />
        </div>

        {/* Input surface */}
        <div
          className={clsx(
            "relative flex flex-col rounded-2xl border bg-surface shadow-sm transition-all duration-150",
            isRagMode
              ? "border-[#FFC857]/30 focus-within:border-[#FFC857]/60 focus-within:ring-2 focus-within:ring-[#FFC857]/15 focus-within:shadow-md"
              : "border-border focus-within:border-border-strong focus-within:ring-2 focus-within:ring-border/20 focus-within:shadow-md",
          )}
        >
          {/* Pending file chip */}
          {pendingFile && (
            <div className="px-3 pt-3">
              <div className="inline-flex max-w-full items-center gap-2 rounded-2xl border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1976D2]/10 text-[#1565C0]">
                  {isUploading ? (
                    <Loader2Icon size={16} strokeWidth={2} className="animate-spin" />
                  ) : (
                    <FileTextIcon size={16} strokeWidth={2} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{pendingFile.name}</div>
                  <div className="text-xs text-text-muted">
                    {isUploading
                      ? "Đang tải lên..."
                      : formatFileSize(pendingFile.size) || "Đã đính kèm"}
                  </div>
                </div>
                {onRemoveFile && !isUploading && (
                  <button
                    type="button"
                    onClick={onRemoveFile}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-active hover:text-text-secondary transition-colors"
                    aria-label="Xoá tệp đính kèm"
                  >
                    <XIcon size={14} strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex items-end">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept={WEEKLY_REPORT_ACCEPT}
              className="hidden"
              onChange={handleFileChange}
              aria-hidden="true"
              tabIndex={-1}
            />
            {/* Attach button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={attachDisabled}
              className={clsx(
                "flex h-10 w-10 shrink-0 ml-2 mb-1.5 items-center justify-center rounded-full text-text-muted transition-colors",
                attachDisabled
                  ? "cursor-not-allowed opacity-50"
                  : "hover:text-text-secondary hover:bg-surface-hover cursor-pointer",
              )}
              aria-label={pendingFile ? "Đã đính kèm tệp — xoá trước khi chọn tệp khác" : "Đính kèm tệp"}
              title={pendingFile ? "Đã đính kèm tệp — xoá trước khi chọn tệp khác" : "Đính kèm tệp báo cáo (PDF, DOC, DOCX, XLS, XLSX…)"}
            >
              <PaperclipIcon size={18} strokeWidth={2} />
            </button>

            {/* Textarea */}
            <textarea
              ref={ref}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={1}
              disabled={isStreaming || isUploading}
              className="flex-1 resize-none bg-transparent px-2 py-3.5 text-[15px] leading-6 text-text-primary placeholder:text-text-muted focus:outline-none disabled:opacity-70"
              style={{ minHeight: "52px", maxHeight: `${MAX_HEIGHT}px` }}
              aria-label="Nhập câu hỏi"
            />

            {/* Send / Stop */}
            <div className="flex items-center pr-3 pb-2">
              {isStreaming ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white transition-all hover:brightness-110 active:scale-95"
                  style={{
                    background:
                      "linear-gradient(135deg, #C41E3A 0%, #D32F2F 100%)",
                    boxShadow: "0 2px 8px rgba(196,30,58,0.35)",
                  }}
                  aria-label="Dừng"
                >
                  <SquareIcon size={13} fill="white" strokeWidth={0} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = value.trim();
                    if (canSend) {
                      onSubmit(trimmed);
                      if (ref && "current" in ref && ref.current) {
                        ref.current.style.height = "52px";
                      }
                    }
                  }}
                  disabled={!canSend}
                  className={clsx(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-150",
                    canSend
                      ? "text-white hover:brightness-110 active:scale-95"
                      : "bg-surface-active text-text-disabled cursor-not-allowed",
                  )}
                  style={
                    canSend
                      ? {
                          background: isRagMode
                            ? "linear-gradient(135deg, #C41E3A 0%, #D32F2F 60%, #FFC857 100%)"
                            : "linear-gradient(135deg, #1565C0 0%, #1976D2 100%)",
                          boxShadow: isRagMode
                            ? "0 2px 8px rgba(196,30,58,0.3)"
                            : "0 2px 8px rgba(21,101,192,0.25)",
                        }
                      : undefined
                  }
                  aria-label={pendingFile ? "Gửi câu hỏi kèm tệp" : "Gửi"}
                >
                  {isUploading ? (
                    <Loader2Icon size={16} strokeWidth={2.5} className="animate-spin" />
                  ) : (
                    <ArrowUpIcon size={17} strokeWidth={2.5} />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="mt-1.5 text-center text-[10px] text-text-disabled">
          AI có thể đưa ra thông tin không chính xác. Hãy kiểm chứng thông tin
          quan trọng.
        </p>
      </div>
    );
  },
);

PersonalChatInput.displayName = "PersonalChatInput";
