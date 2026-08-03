import React from "react";
import clsx from "clsx";
import {
  ArrowsPointingInIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  BoldIcon,
  ItalicIcon,
  ListBulletIcon,
  NumberedListIcon,
  StrikethroughIcon,
  UnderlineIcon,
} from "@heroicons/react/24/outline";
import type { Editor } from "@tiptap/react";

interface RichTextToolbarProps {
  editor: Editor | null;
  onToggleExpand: () => void;
  disabled?: boolean;
}

// Same control-height token family as ComposerActionBar's icon buttons, one
// step down (sm not md) since this row is secondary to the composer's main
// action row.
const buttonBase =
  "inline-flex h-[var(--control-height-sm)] w-[var(--control-height-sm)] items-center justify-center rounded-md transition-colors text-text-muted hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30";

const activeClass = "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary";

export const RichTextToolbar: React.FC<RichTextToolbarProps> = ({
  editor,
  onToggleExpand,
  disabled,
}) => {
  if (!editor) return null;

  const btn = (
    onClick: () => void,
    isActive: boolean,
    title: string,
    icon: React.ReactNode,
  ) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={clsx(buttonBase, isActive && activeClass)}
      aria-pressed={isActive}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex items-center justify-between border-t border-border/50 pt-2 pb-1 mt-1">
      <div className="flex items-center gap-0.5">
        {btn(
          () => editor.chain().focus().toggleBold().run(),
          editor.isActive("bold"),
          "In đậm (Ctrl+B)",
          <BoldIcon className="h-4 w-4" />,
        )}
        {btn(
          () => editor.chain().focus().toggleItalic().run(),
          editor.isActive("italic"),
          "In nghiêng (Ctrl+I)",
          <ItalicIcon className="h-4 w-4" />,
        )}
        {btn(
          () => editor.chain().focus().toggleUnderline().run(),
          editor.isActive("underline"),
          "Gạch chân (Ctrl+U)",
          <UnderlineIcon className="h-4 w-4" />,
        )}
        {btn(
          () => editor.chain().focus().toggleStrike().run(),
          editor.isActive("strike"),
          "Gạch ngang",
          <StrikethroughIcon className="h-4 w-4" />,
        )}

        <div className="mx-1 h-4 w-px bg-border/50" />

        {btn(
          () => editor.chain().focus().toggleBulletList().run(),
          editor.isActive("bulletList"),
          "Danh sách gạch đầu dòng",
          <ListBulletIcon className="h-4 w-4" />,
        )}
        {btn(
          () => editor.chain().focus().toggleOrderedList().run(),
          editor.isActive("orderedList"),
          "Danh sách đánh số",
          <NumberedListIcon className="h-4 w-4" />,
        )}

        <div className="mx-1 h-4 w-px bg-border/50" />

        {btn(
          () => editor.chain().focus().undo().run(),
          false,
          "Hoàn tác (Ctrl+Z)",
          <ArrowUturnLeftIcon className="h-4 w-4" />,
        )}
        {btn(
          () => editor.chain().focus().redo().run(),
          false,
          "Làm lại (Ctrl+Shift+Z)",
          <ArrowUturnRightIcon className="h-4 w-4" />,
        )}
      </div>

      <button
        type="button"
        onClick={onToggleExpand}
        className={buttonBase}
        title="Thu gọn toolbar"
        aria-label="Thu gọn toolbar"
      >
        <ArrowsPointingInIcon className="h-4 w-4" />
      </button>
    </div>
  );
};
