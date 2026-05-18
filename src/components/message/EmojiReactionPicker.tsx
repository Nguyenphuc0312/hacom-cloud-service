/**
 * EmojiReactionPicker
 *
 * A floating emoji quick-picker that appears when the user taps
 * the react button on a message. Shows 6 common reactions in a Zalo-style
 * pill + a floating "MoreReactionPicker" grid panel when "+" is tapped.
 * Never expands to a tall vertical column.
 */

import React from "react";
import { clsx } from "clsx";
import { Plus, X } from "lucide-react";
import { QUICK_REACTIONS } from "../../constants/emojis";
import { MoreReactionPicker } from "./MoreReactionPicker";

interface EmojiReactionPickerProps {
  /** Called when user picks an emoji */
  onSelect: (emoji: string) => void;
  /** Called when picker should close (click-outside, escape, selection) */
  onClose: () => void;
  /** Position — picker renders above the trigger by default */
  isOwn?: boolean;
}

export const EmojiReactionPicker: React.FC<EmojiReactionPickerProps> = ({
  onSelect,
  onClose,
  isOwn = false,
}) => {
  const [showMore, setShowMore] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  React.useEffect(() => {
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
  }, [onClose]);

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    onClose();
  };

  return (
    <div
      ref={rootRef}
      className={clsx(
        "absolute bottom-full z-30 mb-1",
        isOwn ? "right-0" : "left-0",
      )}
    >
      {/* Quick reaction pill — Zalo-style */}
      <div
        className={clsx(
          "flex items-center gap-0.5 rounded-full border border-border bg-surface px-1.5 py-1.5 shadow-elev2",
          "animate-scale-in-emoji",
        )}
      >
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={`Thả reaction ${emoji}`}
            title={`Thả reaction ${emoji}`}
            onClick={() => handleSelect(emoji)}
            className={clsx(
              "flex h-9 w-9 items-center justify-center rounded-full text-xl",
              "transition-all duration-100",
              "hover:scale-125 hover:bg-surface-hover active:scale-110",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            )}
          >
            {emoji}
          </button>
        ))}

        {/* "+" opens the more picker; when open show "×" */}
        <button
          type="button"
          aria-label={showMore ? "Đóng" : "Thêm biểu cảm"}
          aria-expanded={showMore}
          onClick={() => setShowMore((v) => !v)}
          className={clsx(
            "flex h-9 w-9 items-center justify-center rounded-full",
            "bg-surface-overlay text-text-secondary ring-1 ring-border",
            "transition-all duration-100 hover:scale-110 hover:bg-surface-hover",
          )}
        >
          {showMore ? (
            <X size={14} strokeWidth={2} />
          ) : (
            <Plus size={14} strokeWidth={2.2} />
          )}
        </button>
      </div>

      {/* MoreReactionPicker — floating panel below pill, 6-col grid with internal scroll */}
      {showMore && (
        <div className="mt-1">
          <MoreReactionPicker
            onSelect={handleSelect}
            onClose={() => setShowMore(false)}
            isOpen={showMore}
          />
        </div>
      )}
    </div>
  );
};

export default EmojiReactionPicker;
