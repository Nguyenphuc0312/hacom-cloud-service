import React from "react";
import clsx from "clsx";
import {
  ArrowsPointingInIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  ListBulletIcon,
  QueueListIcon,
} from "@heroicons/react/24/outline";
import type { Editor } from "@tiptap/react";

interface RichTextToolbarProps {
  editor: Editor | null;
  onToggleExpand: () => void;
  disabled?: boolean;
}

const buttonBase =
  "inline-flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-surface-hover text-text-secondary disabled:opacity-50 disabled:cursor-not-allowed";

const activeClass = "bg-surface-hover text-primary";

export const RichTextToolbar: React.FC<RichTextToolbarProps> = ({
  editor,
  onToggleExpand,
  disabled,
}) => {
  if (!editor) return null;

  const btn = (
    label: string,
    onClick: () => void,
    isActive: boolean,
    extraClass?: string,
    title?: string,
    icon?: React.ReactNode,
  ) => (
    <button
      type="button"
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
      className={clsx(buttonBase, isActive && activeClass, extraClass)}
      aria-pressed={isActive}
    >
      {icon ?? label}
    </button>
  );

  return (
    <div className="flex items-center justify-between border-t border-border/50 pt-2 pb-1 mt-1">
      <div className="flex items-center gap-1">
        {btn(
          "B",
          () => editor.chain().focus().toggleBold().run(),
          editor.isActive("bold"),
          "font-bold font-serif",
          "In đậm (Ctrl+B)",
        )}
        {btn(
          "I",
          () => editor.chain().focus().toggleItalic().run(),
          editor.isActive("italic"),
          "italic font-serif",
          "In nghiêng (Ctrl+I)",
        )}
        {btn(
          "U",
          () => editor.chain().focus().toggleUnderline().run(),
          editor.isActive("underline"),
          "underline font-serif",
          "Gạch chân (Ctrl+U)",
        )}
        {btn(
          "S",
          () => editor.chain().focus().toggleStrike().run(),
          editor.isActive("strike"),
          "line-through font-serif",
          "Gạch ngang",
        )}

        <div className="mx-1 h-4 w-px bg-border/50" />

        {btn(
          "BulletList",
          () => editor.chain().focus().toggleBulletList().run(),
          editor.isActive("bulletList"),
          undefined,
          "Danh sách gạch đầu dòng",
          <ListBulletIcon className="h-4 w-4" />,
        )}
        {btn(
          "OrderedList",
          () => editor.chain().focus().toggleOrderedList().run(),
          editor.isActive("orderedList"),
          undefined,
          "Danh sách đánh số",
          <QueueListIcon className="h-4 w-4" />,
        )}

        <div className="mx-1 h-4 w-px bg-border/50" />

        {btn(
          "Undo",
          () => editor.chain().focus().undo().run(),
          false,
          undefined,
          "Hoàn tác (Ctrl+Z)",
          <ArrowUturnLeftIcon className="h-4 w-4" />,
        )}
        {btn(
          "Redo",
          () => editor.chain().focus().redo().run(),
          false,
          undefined,
          "Làm lại (Ctrl+Shift+Z)",
          <ArrowUturnRightIcon className="h-4 w-4" />,
        )}
      </div>

      <button
        type="button"
        onClick={onToggleExpand}
        className={buttonBase}
        title="Thu gọn toolbar"
      >
        <ArrowsPointingInIcon className="h-4 w-4" />
      </button>
    </div>
  );
};
