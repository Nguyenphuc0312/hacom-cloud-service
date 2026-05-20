import React, { forwardRef, useCallback } from "react";
import clsx from "clsx";
import { 
  MicIcon, 
  SendHorizonalIcon, 
  PaperclipIcon,
  SquareIcon,
  KeyboardIcon
} from "lucide-react";
import { useChatUiStore } from "../../../features/chat/state/chatUiStore";

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

export const AiPromptBox = forwardRef<HTMLTextAreaElement, AiPromptBoxProps>(
  ({ value, onChange, onSubmit, onStop, isLoading = false }, ref) => {

    const adjustHeight = useCallback((textarea: HTMLTextAreaElement) => {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, MAX_HEIGHT);
      textarea.style.height = `${newHeight}px`;
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
        if (value.trim() && !isLoading) {
          onSubmit(value.trim());
          if (ref && "current" in ref && ref.current) {
            ref.current.style.height = "64px";
          }
        }
      }
    };

    const hasText = value.trim().length > 0;
    const { selectedEndpoint } = useChatUiStore();
    const isCompany = selectedEndpoint === "company";

    return (
      <div className="relative w-full">
        {/* Input Wrapper */}
        <div className="relative flex items-end">
          <textarea
            ref={ref}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={isCompany ? "Hỏi bất cứ điều gì về quy trình & tài liệu công ty..." : "Chat tự do với AI..."}
            rows={1}
            disabled={isLoading}
            className={clsx(
              "w-full resize-none rounded-[36px] border bg-white border-border/80 pl-8 pr-36 py-5 text-base font-medium text-text-primary placeholder:text-text-muted/60 transition-all shadow-xl shadow-black/5",
              "focus:border-primary/60 focus:ring-1 focus:ring-primary/20 focus:outline-none"
            )}
            style={{ minHeight: "64px", maxHeight: `${MAX_HEIGHT}px` }}
          />

          {/* Right Actions Cluster */}
          <div className="absolute right-3 bottom-3 flex items-center gap-1.5">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted hover:bg-surface-active transition-colors"
              title="Tải lên tài liệu"
            >
              <PaperclipIcon size={18} strokeWidth={2.5} />
            </button>

            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted hover:bg-surface-active transition-colors"
              title="Nhập bằng giọng nói"
            >
              <MicIcon size={18} strokeWidth={2.5} />
            </button>

            {isLoading ? (
               <button
                  type="button"
                  onClick={onStop}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white hover:bg-neutral-800 transition-all shadow-lg shadow-black/10"
                  aria-label="Dừng phản hồi"
               >
                  <SquareIcon size={16} fill="white" />
               </button>
            ) : (
               <button
                  type="button"
                  onClick={() => {
                    if (value.trim()) {
                      onSubmit(value.trim());
                      if (ref && "current" in ref && ref.current) {
                        ref.current.style.height = "64px";
                      }
                    }
                  }}
                  disabled={!hasText}
                  className={clsx(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-300",
                    hasText
                      ? "bg-black text-white hover:bg-neutral-800 shadow-xl shadow-black/20 scale-100 cursor-pointer"
                      : "bg-surface-active text-text-disabled scale-95 cursor-not-allowed"
                  )}
                  aria-label="Gửi tin nhắn"
               >
                  <SendHorizonalIcon size={20} strokeWidth={2.5} />
               </button>
            )}
          </div>
        </div>
        
        {/* Keyboard Shortcut Hint */}
        <div className="absolute -bottom-6 left-6 flex items-center gap-1.5 opacity-0 group-hover:opacity-40 transition-opacity pointer-events-none">
           <KeyboardIcon size={10} className="text-text-muted" />
           <span className="text-[9px] font-black uppercase tracking-widest text-text-muted">Press Enter to send</span>
        </div>
      </div>
    );
  },
);

AiPromptBox.displayName = "AiPromptBox";
