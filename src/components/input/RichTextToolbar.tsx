import React from "react";
import clsx from "clsx";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowsPointingInIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  BoldIcon,
  ItalicIcon,
  ListBulletIcon,
  NoSymbolIcon,
  NumberedListIcon,
  StrikethroughIcon,
  UnderlineIcon,
} from "@heroicons/react/24/outline";
import type { Editor } from "@tiptap/react";
import { TextColorPicker } from "./TextColorPicker";
import { SpecialSymbolPicker } from "./SpecialSymbolPicker";

interface RichTextToolbarProps {
  editor: Editor | null;
  onToggleExpand: () => void;
  disabled?: boolean;
}

// Same control-height token family as ComposerActionBar's icon buttons, one
// step down (sm not md) since this row is secondary to the composer's main
// action row.
const buttonBase =
  "inline-flex h-[var(--control-height-sm)] w-[var(--control-height-sm)] shrink-0 items-center justify-center rounded-md transition-colors text-text-muted hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30";

const activeClass = "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary";

export const RichTextToolbar: React.FC<RichTextToolbarProps> = ({
  editor,
  onToggleExpand,
  disabled,
}) => {
  const [isColorPickerOpen, setIsColorPickerOpen] = React.useState(false);
  const colorButtonRef = React.useRef<HTMLButtonElement>(null);
  const [colorPickerAnchor, setColorPickerAnchor] = React.useState<{ bottom: number; left: number } | null>(null);
  const [isSymbolPickerOpen, setIsSymbolPickerOpen] = React.useState(false);
  const symbolButtonRef = React.useRef<HTMLButtonElement>(null);
  const [symbolPickerAnchor, setSymbolPickerAnchor] = React.useState<{ bottom: number; left: number } | null>(null);
  // disabled can flip true while the popover is open (e.g. composer sends
  // mid-pick) — gate the render directly instead of syncing state in an effect.
  const showColorPicker = isColorPickerOpen && !disabled;
  const showSymbolPicker = isSymbolPickerOpen && !disabled;

  const toggleColorPicker = () => {
    if (!isColorPickerOpen && colorButtonRef.current) {
      const rect = colorButtonRef.current.getBoundingClientRect();
      // Fixed positioning anchored to the button's own viewport coords — the
      // button lives inside the toolbar's overflow-x-auto row, so a plain
      // `absolute` popover would get clipped by that scroll container.
      setColorPickerAnchor({ bottom: window.innerHeight - rect.top + 8, left: rect.left });
    }
    // Hai bảng cùng bung một lúc thì che nhau — mở cái này đóng cái kia.
    setIsSymbolPickerOpen(false);
    setIsColorPickerOpen((prev) => !prev);
  };

  const toggleSymbolPicker = () => {
    if (!isSymbolPickerOpen && symbolButtonRef.current) {
      const rect = symbolButtonRef.current.getBoundingClientRect();
      // Bảng ký hiệu rộng 18rem (w-72). Neo mép trái theo nút nhưng kéo lùi vào
      // trong nếu sắp tràn khỏi màn hình, để không bị cắt mất cột bên phải.
      const width = 288;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      setSymbolPickerAnchor({ bottom: window.innerHeight - rect.top + 8, left });
    }
    setIsColorPickerOpen(false);
    setIsSymbolPickerOpen((prev) => !prev);
  };

  if (!editor) return null;

  const btn = (
    onClick: () => void,
    isActive: boolean,
    title: string,
    icon: React.ReactNode,
    isDisabled = disabled,
  ) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={isDisabled}
      onClick={onClick}
      className={clsx(buttonBase, isActive && activeClass)}
      aria-pressed={isActive}
    >
      {icon}
    </button>
  );

  const activeColor = (editor.getAttributes("textStyle").color as string | undefined) ?? null;
  const hasFormatting =
    editor.isActive("bold") ||
    editor.isActive("italic") ||
    editor.isActive("underline") ||
    editor.isActive("strike") ||
    activeColor !== null;

  return (
    <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2 pb-1 mt-1">
      <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
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

        <button
          ref={colorButtonRef}
          type="button"
          title="Màu chữ"
          aria-label="Màu chữ"
          aria-haspopup="menu"
          aria-expanded={showColorPicker}
          disabled={disabled}
          onClick={toggleColorPicker}
          className={clsx(buttonBase, showColorPicker && activeClass)}
        >
          <span className="relative flex h-4 w-4 items-center justify-center text-[13px] font-bold leading-none">
            A
            <span
              className="absolute -bottom-0.5 left-0 right-0 h-[2px] rounded-full"
              style={{ backgroundColor: activeColor ?? "currentColor" }}
            />
          </span>
        </button>

        {btn(
          () => editor.chain().focus().unsetAllMarks().clearNodes().run(),
          false,
          "Xóa định dạng",
          <NoSymbolIcon className="h-4 w-4" />,
          disabled || !hasFormatting,
        )}

        {/* Ký hiệu đặc biệt: ₫ % ° × → ✓ … — những ký tự không gõ thẳng được
            trên bàn phím tiếng Việt, trước đây phải sang Word/web khác copy về. */}
        <button
          ref={symbolButtonRef}
          type="button"
          title="Ký hiệu đặc biệt"
          aria-label="Ký hiệu đặc biệt"
          aria-haspopup="menu"
          aria-expanded={showSymbolPicker}
          disabled={disabled}
          onClick={toggleSymbolPicker}
          data-testid="composer-symbol-button"
          className={clsx(buttonBase, showSymbolPicker && activeClass)}
        >
          <span className="text-[13px] font-semibold leading-none">Ω</span>
        </button>

        <div className="mx-1 h-4 w-px shrink-0 bg-border/50" />

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
        {btn(
          () => editor.chain().focus().sinkListItem("listItem").run(),
          false,
          "Tăng thụt đầu dòng",
          <ArrowRightIcon className="h-4 w-4" />,
          disabled || !editor.can().sinkListItem("listItem"),
        )}
        {btn(
          () => editor.chain().focus().liftListItem("listItem").run(),
          false,
          "Giảm thụt đầu dòng",
          <ArrowLeftIcon className="h-4 w-4" />,
          disabled || !editor.can().liftListItem("listItem"),
        )}

        <div className="mx-1 h-4 w-px shrink-0 bg-border/50" />

        {btn(
          () => editor.chain().focus().undo().run(),
          false,
          "Hoàn tác (Ctrl+Z)",
          <ArrowUturnLeftIcon className="h-4 w-4" />,
          disabled || !editor.can().undo(),
        )}
        {btn(
          () => editor.chain().focus().redo().run(),
          false,
          "Làm lại (Ctrl+Shift+Z)",
          <ArrowUturnRightIcon className="h-4 w-4" />,
          disabled || !editor.can().redo(),
        )}
      </div>

      <button
        type="button"
        onClick={onToggleExpand}
        className={clsx(buttonBase, "shrink-0")}
        title="Thu gọn toolbar"
        aria-label="Thu gọn toolbar"
      >
        <ArrowsPointingInIcon className="h-4 w-4" />
      </button>

      {showSymbolPicker && symbolPickerAnchor && (
        <SpecialSymbolPicker
          onSelect={(symbol) => {
            // insertContent tại vị trí con trỏ hiện tại, giữ nguyên định dạng
            // đang bật — chèn xong vẫn ở trong ô nhập để gõ tiếp ngay.
            editor.chain().focus().insertContent(symbol).run();
          }}
          onClose={() => setIsSymbolPickerOpen(false)}
          className="fixed z-dropdown"
          style={{ bottom: symbolPickerAnchor.bottom, left: symbolPickerAnchor.left }}
        />
      )}

      {showColorPicker && colorPickerAnchor && (
        <TextColorPicker
          activeColor={activeColor}
          onSelect={(color) => {
            if (color) {
              editor.chain().focus().setColor(color).run();
            } else {
              editor.chain().focus().unsetColor().run();
            }
          }}
          onClose={() => setIsColorPickerOpen(false)}
          className="fixed z-dropdown"
          style={{ bottom: colorPickerAnchor.bottom, left: colorPickerAnchor.left }}
        />
      )}
    </div>
  );
};
