import React, { forwardRef, useCallback, useRef } from "react";
import clsx from "clsx";
import {
  ArrowUpIcon,
  SquareIcon,
  PaperclipIcon,
  Loader2Icon,
  FileTextIcon,
  XIcon,
} from "lucide-react";
import { useChatUiStore } from "../../../features/chat/state/chatUiStore";
import { toast } from "../../../utils/toast";

interface AiPromptBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop?: () => void;
  isLoading?: boolean;
  /**
   * Khi truyền vào, nút đính kèm sẽ mở file picker và gọi callback này.
   * Nếu không truyền, nút sẽ hiển thị thông báo "chưa hỗ trợ".
   */
  onAttachFiles?: (files: File[]) => void | Promise<void>;
  /** Loại file được chấp nhận (mặc định cho tài liệu/ảnh phổ biến). */
  attachAccept?: string;
  /** Cho phép chọn nhiều file một lúc (mặc định true). */
  attachMultiple?: boolean;
  /** Đang upload — disable nút và đổi icon. */
  isUploading?: boolean;
  /** File đang được "stage" để gửi kèm câu hỏi. */
  pendingAttachment?: { file: File } | null;
  /** Xoá file đã stage. */
  onRemoveAttachment?: () => void;
  /** Placeholder gợi ý câu hỏi khi đã có file pending. */
  attachmentHint?: string;
}

const LINE_HEIGHT = 24;
const MAX_LINES = 8;
const MAX_HEIGHT = LINE_HEIGHT * MAX_LINES;

/**
 * Thanh nhập liệu kiểu ChatGPT – bo tròn capsule, auto resize,
 * nút gửi tròn đen ở góc phải, nút attach file bên trái.
 */
function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const AiPromptBox = forwardRef<HTMLTextAreaElement, AiPromptBoxProps>(
  (
    {
      value,
      onChange,
      onSubmit,
      onStop,
      isLoading = false,
      onAttachFiles,
      attachAccept = ".pdf,.doc,.docx,.txt,.md,.csv,.xls,.xlsx,.ppt,.pptx,image/*",
      attachMultiple = true,
      isUploading = false,
      pendingAttachment = null,
      onRemoveAttachment,
      attachmentHint,
    },
    ref,
  ) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const attachDisabled = isLoading || isUploading || !!pendingAttachment;

    /** Tự điều chỉnh chiều cao textarea */
    const adjustHeight = useCallback((textarea: HTMLTextAreaElement) => {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, MAX_HEIGHT);
      textarea.style.height = `${newHeight}px`;
    }, []);

    const handleAttachClick = useCallback(() => {
      if (attachDisabled) return;
      fileInputRef.current?.click();
    }, [attachDisabled]);

    const handleFileChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList || fileList.length === 0) return;

        const files = Array.from(fileList);
        // Reset trước để có thể chọn lại cùng file lần sau (kể cả khi callback throw)
        e.target.value = "";

        if (onAttachFiles) {
          void onAttachFiles(files);
          return;
        }

        const fileName = files[0].name;
        const more = files.length > 1 ? ` (+${files.length - 1})` : "";
        toast.info(
          `Đã chọn "${fileName}"${more}. Tính năng đính kèm tài liệu cho trợ lý AI sẽ sớm có mặt.`,
        );
      },
      [onAttachFiles],
    );

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
        if (value.trim() && !isLoading && !isUploading) {
          onSubmit(value.trim());
          if (ref && "current" in ref && ref.current) {
            ref.current.style.height = "52px";
          }
        }
      }
    };

    const hasText = value.trim().length > 0;
    const canSend = hasText && !isLoading && !isUploading;
    const { selectedEndpoint } = useChatUiStore();
    const isCompany = selectedEndpoint === "company";
    const textareaDisabled = isLoading || isUploading;

    const placeholder = pendingAttachment
      ? attachmentHint || "Đặt câu hỏi về tệp đã đính kèm..."
      : isCompany
        ? "Hỏi về quy trình & tài liệu công ty..."
        : "Hỏi bất cứ điều gì...";

    return (
      <div className="relative w-full">
        <div className="relative flex flex-col rounded-3xl border border-border bg-surface shadow-sm transition-all focus-within:border-border-strong focus-within:shadow-md">
          {/* Attachment chip (above textarea) */}
          {pendingAttachment && (
            <div className="px-3 pt-3">
              <div className="inline-flex max-w-full items-center gap-2 rounded-2xl border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {isUploading ? (
                    <Loader2Icon
                      size={16}
                      strokeWidth={2}
                      className="animate-spin"
                    />
                  ) : (
                    <FileTextIcon size={16} strokeWidth={2} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {pendingAttachment.file.name}
                  </div>
                  <div className="text-xs text-text-muted">
                    {isUploading
                      ? "Đang tải lên..."
                      : formatFileSize(pendingAttachment.file.size) ||
                        "Đã đính kèm"}
                  </div>
                </div>
                {onRemoveAttachment && !isUploading && (
                  <button
                    type="button"
                    onClick={onRemoveAttachment}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-active hover:text-text-secondary transition-colors"
                    aria-label="Xoá tệp đính kèm"
                    title="Xoá tệp đính kèm"
                  >
                    <XIcon size={14} strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="relative flex items-end">
            {/* Attach button */}
            <input
              ref={fileInputRef}
              type="file"
              multiple={attachMultiple}
              accept={attachAccept}
              className="hidden"
              onChange={handleFileChange}
              aria-hidden="true"
              tabIndex={-1}
            />
            <button
              type="button"
              onClick={handleAttachClick}
              disabled={attachDisabled}
              className={clsx(
                "flex h-10 w-10 shrink-0 items-center justify-center ml-2 mb-1.5 rounded-full text-text-muted transition-colors",
                attachDisabled
                  ? "cursor-not-allowed opacity-50"
                  : "hover:text-text-secondary hover:bg-surface-hover cursor-pointer",
              )}
              aria-label={
                pendingAttachment
                  ? "Đã đính kèm tệp"
                  : isUploading
                    ? "Đang tải lên..."
                    : "Tải lên tài liệu"
              }
              title={
                pendingAttachment
                  ? "Đã đính kèm tệp — xoá trước khi đính kèm tệp khác"
                  : isUploading
                    ? "Đang tải lên..."
                    : "Tải lên tài liệu"
              }
            >
              {isUploading ? (
                <Loader2Icon
                  size={18}
                  strokeWidth={2}
                  className="animate-spin"
                />
              ) : (
                <PaperclipIcon size={18} strokeWidth={2} />
              )}
            </button>

            {/* Textarea */}
            <textarea
              ref={ref}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={1}
              disabled={textareaDisabled}
              className="flex-1 resize-none bg-transparent py-4 px-2 text-base text-text-primary placeholder:text-text-muted focus:outline-none disabled:opacity-70"
              style={{ minHeight: "52px", maxHeight: `${MAX_HEIGHT}px` }}
            />

            {/* Send / Stop button */}
            <div className="flex items-center pr-2 pb-1.5">
              {isLoading ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white hover:bg-primary-hover transition-colors"
                  aria-label="Dừng phản hồi"
                >
                  <SquareIcon size={14} fill="white" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (canSend) {
                      onSubmit(value.trim());
                      if (ref && "current" in ref && ref.current) {
                        ref.current.style.height = "52px";
                      }
                    }
                  }}
                  disabled={!canSend}
                  className={clsx(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all",
                    canSend
                      ? "bg-primary text-white hover:bg-primary-hover cursor-pointer"
                      : "bg-surface-active text-text-disabled cursor-not-allowed",
                  )}
                  aria-label={
                    pendingAttachment
                      ? "Gửi câu hỏi kèm tệp"
                      : "Gửi tin nhắn"
                  }
                >
                  {isUploading ? (
                    <Loader2Icon
                      size={16}
                      strokeWidth={2.5}
                      className="animate-spin"
                    />
                  ) : (
                    <ArrowUpIcon size={18} strokeWidth={2.5} />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  },
);

AiPromptBox.displayName = "AiPromptBox";
