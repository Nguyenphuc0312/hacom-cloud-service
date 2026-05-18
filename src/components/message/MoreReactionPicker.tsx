/**
 * MoreReactionPicker
 *
 * A floating grid panel that appears when the user taps "+" in the quick reaction picker.
 * Shows a compact 6-column emoji grid with internal scroll — never a tall vertical column.
 * Zalo-style: grid compact, scrollable, does not stretch the parent.
 */

import React from "react";
import { clsx } from "clsx";
import { X } from "lucide-react";
import { EXTENDED_REACTIONS } from "../../constants/emojis";

interface MoreReactionPickerProps {
  /** Called when user picks an emoji */
  onSelect: (emoji: string) => void;
  /** Called when picker should close */
  onClose: () => void;
  /** Control open/close from parent (e.g. from QuickReactionPicker "+" button) */
  isOpen?: boolean;
}

export const MoreReactionPicker: React.FC<MoreReactionPickerProps> = ({
  onSelect,
  onClose,
  isOpen = true,
}) => {
  const rootRef = React.useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handlePointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    onClose();
  };

  return (
    <div
      ref={rootRef}
      className={clsx(
        "rounded-2xl border border-border bg-surface p-2 shadow-elev3",
        "animate-scale-in-emoji",
        // Fixed panel size — never expands parent
        "w-[272px]",
      )}
      role="dialog"
      aria-label="Chọn reaction"
    >
      {/* Header */}
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-medium text-text-muted">
          Biểu cảm
        </span>
        <button
          type="button"
          aria-label="Đóng"
          onClick={onClose}
          className={clsx(
            "flex items-center justify-center rounded-full p-1",
            "text-text-muted transition-colors",
            "hover:bg-surface-hover hover:text-text-primary",
          )}
        >
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      {/* Emoji grid — 6 columns, internal scroll, never tall vertical column */}
      <div
        className={clsx(
          "grid grid-cols-6 gap-1",
          // Cap height so it never grows beyond ~260px
          "max-h-[260px] overflow-y-auto overscroll-contain",
          // Custom thin scrollbar
          "[&::-webkit-scrollbar]:w-1.5",
          "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/50",
        )}
      >
        {EXTENDED_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={`Thả reaction ${emoji}`}
            title={`Thả reaction ${emoji}`}
            onClick={() => handleSelect(emoji)}
            className={clsx(
              "flex h-9 w-full items-center justify-center rounded-xl text-xl",
              "transition-all duration-100",
              "hover:scale-110 hover:bg-surface-hover active:scale-95",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            )}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
};

export default MoreReactionPicker;
