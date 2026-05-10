/**
 * EmojiReactionPicker
 *
 * A Zalo-style floating emoji quick-picker that appears when the user taps
 * the react button on a message. Shows 6 common reactions + a "+" button
 * that expands to a larger grid.
 */

import React from "react";
import clsx from "clsx";
import { Plus } from "lucide-react";

const QUICK_EMOJIS = ["👍", "❤️", "😆", "😮", "😢", "😡"] as const;

const EXTENDED_EMOJIS = [
  "👍", "👎", "❤️", "🔥", "🎉", "😆", "😮", "😢", "😡", "🤩",
  "🥹", "😍", "🤔", "👏", "💯", "✅", "🙏", "😭", "🫡", "💪",
  "😴", "🤣", "😅", "😬", "🥲", "😤", "😩", "🤯", "🤗", "😎",
] as const;

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

  const emojisToShow = showMore ? EXTENDED_EMOJIS : QUICK_EMOJIS;

  return (
    <div
      ref={rootRef}
      className={clsx(
        // Floating pill above the message
        "absolute bottom-full z-30 mb-1",
        isOwn ? "right-0" : "left-0",
      )}
    >
      <div
        className={clsx(
          "flex flex-wrap items-center gap-0.5 rounded-full",
          "bg-white px-2 py-1.5",
          "shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.06)]",
          "dark:bg-[#23262f] dark:shadow-[0_8px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.08)]",
          // Animate in
          "animate-scale-in-emoji",
          showMore && "rounded-2xl",
        )}
        style={
          showMore
            ? { maxWidth: 256, flexWrap: "wrap" }
            : undefined
        }
      >
        {emojisToShow.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={`React with ${emoji}`}
            onClick={() => handleSelect(emoji)}
            className={clsx(
              "flex h-9 w-9 items-center justify-center rounded-full text-xl",
              "transition-all duration-100",
              "hover:scale-125 hover:bg-black/5 dark:hover:bg-white/8",
              "active:scale-110",
            )}
          >
            {emoji}
          </button>
        ))}

        {/* More / collapse toggle */}
        <button
          type="button"
          aria-label={showMore ? "Thu gọn" : "Thêm biểu cảm"}
          onClick={() => setShowMore((v) => !v)}
          className={clsx(
            "flex h-9 w-9 items-center justify-center rounded-full",
            "bg-[#f0f1f5] text-[#52556a] ring-1 ring-[#e3e5ec]",
            "transition-all duration-100 hover:scale-110 hover:bg-[#e6e8f0]",
            "dark:bg-white/10 dark:text-white/60 dark:ring-white/12",
          )}
        >
          <Plus
            size={14}
            strokeWidth={2.2}
            className={clsx(
              "transition-transform duration-200",
              showMore && "rotate-45",
            )}
          />
        </button>
      </div>
    </div>
  );
};

export default EmojiReactionPicker;
