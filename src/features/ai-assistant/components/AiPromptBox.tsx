import React from "react";
import { useTranslation } from "react-i18next";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";

interface AiPromptBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  isLoading?: boolean;
}

export const AiPromptBox: React.FC<AiPromptBoxProps> = ({
  value,
  onChange,
  onSubmit,
  isLoading = false,
}) => {
  const { t } = useTranslation("aiAssistant");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) {
        onSubmit(value.trim());
      }
    }
  };

  return (
    <div className="relative flex w-full max-w-2xl items-end gap-3">
      <div className="relative flex-1">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("prompt.placeholder")}
          rows={3}
          className="focus:border-primary/60 focus:ring-primary/20 w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 pr-14 text-body text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 transition-colors"
          style={{ minHeight: "80px", maxHeight: "160px" }}
          disabled={isLoading}
        />
      </div>

      <button
        type="button"
        onClick={() => {
          if (value.trim()) {
            onSubmit(value.trim());
          }
        }}
        disabled={!value.trim() || isLoading}
        className="absolute bottom-3 right-3 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-text-inverse transition-all hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={t("prompt.placeholder")}
      >
        <PaperAirplaneIcon className="h-5 w-5" strokeWidth={1.5} />
      </button>
    </div>
  );
};
