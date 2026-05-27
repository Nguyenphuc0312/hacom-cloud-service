import React, {
  forwardRef,
  useCallback,
  useEffect,
} from "react";
import clsx from "clsx";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { ActiveSourcePills } from "./ActiveSourcePills";
import { usePersonalDocuments } from "../../hooks/usePersonalDocuments";

interface PersonalChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  isRagMode?: boolean;
}

const LINE_HEIGHT = 24;
const MAX_LINES = 6;
const MAX_HEIGHT = LINE_HEIGHT * MAX_LINES;

export const PersonalChatInput = forwardRef<
  HTMLTextAreaElement,
  PersonalChatInputProps
>(({ value, onChange, onSubmit, onStop, isStreaming = false }, ref) => {
  const { activeDocuments, isRagMode, handleToggleSource } =
    usePersonalDocuments();

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
      if (trimmed && !isStreaming) {
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

  const canSend = value.trim().length > 0 && !isStreaming;

  const placeholder = isRagMode
    ? `Hỏi AI về ${activeDocuments.length > 1 ? `${activeDocuments.length} tài liệu` : activeDocuments[0]?.name.replace(/\.pdf$/i, "") ?? "tài liệu"}…`
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
        <div className="flex items-end">
          {/* Textarea */}
          <textarea
            ref={ref}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={isStreaming}
            className="flex-1 resize-none bg-transparent px-4 py-3.5 text-[15px] leading-6 text-text-primary placeholder:text-text-muted focus:outline-none disabled:opacity-70"
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
                aria-label="Gửi"
              >
                <ArrowUpIcon size={17} strokeWidth={2.5} />
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
});

PersonalChatInput.displayName = "PersonalChatInput";
