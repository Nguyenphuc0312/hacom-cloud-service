import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { FaceSmileIcon } from "@heroicons/react/24/outline";
import { EmojiPicker } from "./EmojiPicker";

interface EmojiButtonProps {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** When provided, emoji insertion is delegated here instead of using textareaRef. */
  onEmojiSelect?: (emoji: string) => void;
  className?: string;
}

export const EmojiButton: React.FC<EmojiButtonProps> = ({
  value,
  disabled = false,
  onChange,
  textareaRef,
  onEmojiSelect,
  className,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);

  const handleToggle = React.useCallback(() => {
    setIsOpen((previous) => !previous);
  }, []);

  const handleClose = React.useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleSelect = React.useCallback(
    (emoji: string) => {
      if (onEmojiSelect) {
        onEmojiSelect(emoji);
        return;
      }
      const textarea = textareaRef?.current;
      const start = textarea?.selectionStart ?? value.length;
      const end = textarea?.selectionEnd ?? value.length;
      const nextValue = `${value.slice(0, start)}${emoji}${value.slice(end)}`;
      const nextCaret = start + emoji.length;

      onChange(nextValue);
      requestAnimationFrame(() => {
        const nextTextarea = textareaRef?.current;
        if (!nextTextarea) return;

        nextTextarea.focus();
        nextTextarea.setSelectionRange(nextCaret, nextCaret);
      });
    },
    [onChange, onEmojiSelect, textareaRef, value],
  );

  React.useEffect(() => {
    if (disabled) {
      setIsOpen(false);
    }
  }, [disabled]);

  return (
    <div className={clsx("relative", className)}>
      <button
        type="button"
        onClick={handleToggle}
        className={clsx(
          "inline-flex h-[var(--control-height-md)] w-[var(--control-height-md)] items-center justify-center rounded-md transition-colors",
          isOpen
            ? "bg-surface-active text-text-primary"
            : "text-text-muted hover:bg-surface-hover hover:text-text-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
          disabled && "cursor-not-allowed opacity-50",
        )}
        aria-label={t("chat:composer.openEmojiPicker")}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        disabled={disabled}
      >
        <FaceSmileIcon className="h-5 w-5" />
      </button>

      {isOpen && (
        <EmojiPicker
          onSelect={handleSelect}
          onClose={handleClose}
          className="absolute bottom-full left-0 z-dropdown mb-2"
        />
      )}
    </div>
  );
};

export default EmojiButton;
