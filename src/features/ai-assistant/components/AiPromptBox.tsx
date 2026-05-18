import React, { forwardRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";

interface AiPromptBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  isLoading?: boolean;
}

const LINE_HEIGHT = 24; // approx line-height in px
const MAX_LINES = 6;
const MAX_HEIGHT = LINE_HEIGHT * MAX_LINES;

export const AiPromptBox = forwardRef<HTMLTextAreaElement, AiPromptBoxProps>(
  ({ value, onChange, onSubmit, isLoading = false }, ref) => {
    const { t } = useTranslation("aiAssistant");

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
        if (value.trim()) {
          onSubmit(value.trim());
          // Reset height after submit
          if (ref && "current" in ref && ref.current) {
            ref.current.style.height = "auto";
          }
        }
      }
    };

    const hasText = value.trim().length > 0;

    return (
      <div className="relative w-full">
        <textarea
          ref={ref}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={t("prompt.placeholder")}
          rows={1}
          disabled={isLoading}
          className="focus:border-primary/60 focus:shadow-[0_0_0_2px_hsl(var(--color-primary)/0.15)] w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 pr-12 text-body text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-0"
          style={{ minHeight: "56px", maxHeight: `${MAX_HEIGHT}px` }}
          onLoad={(e) => adjustHeight(e.currentTarget)}
        />

        {/* Send button — only visible when there's text */}
        <button
          type="button"
          onClick={() => {
            if (value.trim()) {
              onSubmit(value.trim());
              if (ref && "current" in ref && ref.current) {
                ref.current.style.height = "auto";
              }
            }
          }}
          disabled={!hasText || isLoading}
          className={`
            absolute bottom-2.5 right-2.5 flex h-9 w-9 shrink-0 items-center justify-center
            rounded-xl bg-primary text-text-inverse
            transition-all duration-150
            ${hasText && !isLoading
              ? "opacity-100 hover:bg-primary-hover cursor-pointer"
              : "opacity-0 pointer-events-none"
            }
          `}
          aria-label={t("prompt.send")}
        >
          <PaperAirplaneIcon className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    );
  },
);

AiPromptBox.displayName = "AiPromptBox";
