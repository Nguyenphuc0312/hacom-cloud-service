import React, { forwardRef, useCallback, useRef } from "react";
import clsx from "clsx";
import { ArrowUpIcon, SquareIcon, PaperclipIcon } from "lucide-react";
import { useChatUiStore } from "../../../features/chat/state/chatUiStore";
import { toast } from "../../../utils/toast";

interface AiPromptBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop?: () => void;
  isLoading?: boolean;
}

const LINE_HEIGHT = 24;
const MAX_LINES = 8;
const MAX_HEIGHT = LINE_HEIGHT * MAX_LINES;

/**
 * Thanh nhập liệu kiểu ChatGPT – bo tròn capsule, auto resize,
 * nút gửi tròn đen ở góc phải, nút attach file bên trái.
 */
export const AiPromptBox = forwardRef<HTMLTextAreaElement, AiPromptBoxProps>(
  ({ value, onChange, onSubmit, onStop, isLoading = false }, ref) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    /** Tự điều chỉnh chiều cao textarea */
    const adjustHeight = useCallback((textarea: HTMLTextAreaElement) => {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, MAX_HEIGHT);
      textarea.style.height = `${newHeight}px`;
    }, []);

    const handleAttachClick = useCallback(() => {
      if (isLoading) return;
      fileInputRef.current?.click();
    }, [isLoading]);

    const handleFileChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        // Tạm thời AI service chưa hỗ trợ đính kèm file, thông báo cho user
        const fileName = files[0].name;
        const more = files.length > 1 ? ` (+${files.length - 1})` : "";
        toast.info(
          `Đã chọn "${fileName}"${more}. Tính năng đính kèm tài liệu cho trợ lý AI sẽ sớm có mặt.`,
        );

        // Reset để có thể chọn lại cùng file lần sau
        e.target.value = "";
      },
      [],
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
        if (value.trim() && !isLoading) {
          onSubmit(value.trim());
          if (ref && "current" in ref && ref.current) {
            ref.current.style.height = "52px";
          }
        }
      }
    };

    const hasText = value.trim().length > 0;
    const { selectedEndpoint } = useChatUiStore();
    const isCompany = selectedEndpoint === "company";

    return (
      <div className="relative w-full">
        <div className="relative flex items-end rounded-3xl border border-border bg-surface shadow-sm transition-all focus-within:border-[#FFC857]/60 focus-within:ring-2 focus-within:ring-[#FFC857]/15 focus-within:shadow-md">
          {/* Attach button */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.txt,.md,.csv,.xls,.xlsx,.ppt,.pptx,image/*"
            className="hidden"
            onChange={handleFileChange}
            aria-hidden="true"
            tabIndex={-1}
          />
          <button
            type="button"
            onClick={handleAttachClick}
            disabled={isLoading}
            className={clsx(
              "flex h-10 w-10 shrink-0 items-center justify-center ml-2 mb-1.5 rounded-full text-text-muted transition-colors",
              isLoading
                ? "cursor-not-allowed opacity-50"
                : "hover:text-text-secondary hover:bg-surface-hover cursor-pointer",
            )}
            aria-label="Tải lên tài liệu"
            title="Tải lên tài liệu"
          >
            <PaperclipIcon size={18} strokeWidth={2} />
          </button>

          {/* Textarea */}
          <textarea
            ref={ref}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={
              isCompany
                ? "Hỏi về quy trình & tài liệu công ty..."
                : "Hỏi bất cứ điều gì..."
            }
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none bg-transparent py-4 px-2 text-base text-text-primary placeholder:text-text-muted focus:outline-none"
            style={{ minHeight: "52px", maxHeight: `${MAX_HEIGHT}px` }}
          />

          {/* Send / Stop button */}
          <div className="flex items-center pr-2 pb-1.5">
            {isLoading ? (
              <button
                type="button"
                onClick={onStop}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors hover:brightness-105"
                style={{ background: "linear-gradient(135deg, #C41E3A 0%, #D32F2F 100%)" }}
                aria-label="Dừng phản hồi"
              >
                <SquareIcon size={14} fill="white" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (value.trim()) {
                    onSubmit(value.trim());
                    if (ref && "current" in ref && ref.current) {
                      ref.current.style.height = "52px";
                    }
                  }
                }}
                disabled={!hasText}
                className={clsx(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all",
                  hasText
                    ? "text-white hover:brightness-105 cursor-pointer"
                    : "bg-surface-active text-text-disabled cursor-not-allowed",
                )}
                style={hasText ? {
                  background: "linear-gradient(to right, #C41E3A, #D32F2F, #FFC857)",
                  boxShadow: "0 2px 8px rgba(196,30,58,0.3)",
                } : undefined}
                aria-label="Gửi tin nhắn"
              >
                <ArrowUpIcon size={18} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  },
);

AiPromptBox.displayName = "AiPromptBox";
