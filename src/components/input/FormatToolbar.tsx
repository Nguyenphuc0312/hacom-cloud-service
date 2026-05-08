import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ArrowsPointingInIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  ListBulletIcon,
  QueueListIcon,
} from "@heroicons/react/24/outline";

interface FormatToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (nextValue: string) => void;
  onToggleExpand: () => void;
  disabled?: boolean;
}

export const FormatToolbar: React.FC<FormatToolbarProps> = ({
  textareaRef,
  value,
  onChange,
  onToggleExpand,
  disabled,
}) => {
  const { t } = useTranslation();

  const insertMarkdown = (prefix: string, suffix: string = "") => {
    if (!textareaRef.current || disabled) return;
    const textarea = textareaRef.current;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);

    const nextValue = value.substring(0, start) + prefix + selectedText + suffix + value.substring(end);
    onChange(nextValue);

    // Maintain selection
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    });
  };

  const handleFormat = (type: string) => {
    switch (type) {
      case "bold":
        insertMarkdown("**", "**");
        break;
      case "italic":
        insertMarkdown("*", "*");
        break;
      case "underline":
        insertMarkdown("__", "__"); // Markdown doesn't standardly support underline, but using __ as a placeholder
        break;
      case "strikethrough":
        insertMarkdown("~~", "~~");
        break;
      case "list-ul":
        insertMarkdown("- ");
        break;
      case "list-ol":
        insertMarkdown("1. ");
        break;
      default:
        break;
    }
  };

  const buttonClass =
    "inline-flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-surface-hover text-text-secondary disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="flex items-center justify-between border-t border-border/50 pt-2 pb-1 mt-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => handleFormat("bold")}
          className={clsx(buttonClass, "font-bold font-serif")}
          disabled={disabled}
          title="In đậm"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => handleFormat("italic")}
          className={clsx(buttonClass, "italic font-serif")}
          disabled={disabled}
          title="In nghiêng"
        >
          I
        </button>
        <button
          type="button"
          onClick={() => handleFormat("underline")}
          className={clsx(buttonClass, "underline font-serif")}
          disabled={disabled}
          title="Gạch chân"
        >
          U
        </button>
        <button
          type="button"
          onClick={() => handleFormat("strikethrough")}
          className={clsx(buttonClass, "line-through font-serif")}
          disabled={disabled}
          title="Gạch ngang"
        >
          S
        </button>
        <div className="w-px h-4 bg-border/50 mx-1" />
        <button
          type="button"
          onClick={() => handleFormat("list-ul")}
          className={buttonClass}
          disabled={disabled}
          title="Danh sách"
        >
          <ListBulletIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => handleFormat("list-ol")}
          className={buttonClass}
          disabled={disabled}
          title="Danh sách số"
        >
          <QueueListIcon className="h-4 w-4" />
        </button>
        <div className="w-px h-4 bg-border/50 mx-1" />
        <button
          type="button"
          className={buttonClass}
          disabled={disabled}
          title="Hoàn tác"
          onClick={() => document.execCommand("undo")}
        >
          <ArrowUturnLeftIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={disabled}
          title="Làm lại"
          onClick={() => document.execCommand("redo")}
        >
          <ArrowUturnRightIcon className="h-4 w-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={onToggleExpand}
        className={buttonClass}
        title="Thu gọn"
      >
        <ArrowsPointingInIcon className="h-4 w-4" />
      </button>
    </div>
  );
};
