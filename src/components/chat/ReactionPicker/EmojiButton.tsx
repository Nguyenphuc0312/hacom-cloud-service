/**
 * EmojiButton - A single emoji button in the ReactionPicker.
 * Features:
 * - 36x36px size
 * - Hover effect with background
 * - Click animation (scale down then up)
 * - Tooltip with emoji name
 */

import React, { useCallback } from "react";
import { clsx } from "clsx";
import { getEmojiName } from "./emoji-data";

interface EmojiButtonProps {
  emoji: string;
  onClick: (emoji: string) => void;
  isHighlighted?: boolean;
  className?: string;
}

export const EmojiButton: React.FC<EmojiButtonProps> = ({
  emoji,
  onClick,
  isHighlighted = false,
  className,
}) => {
  const handleClick = useCallback(() => {
    onClick(emoji);
  }, [emoji, onClick]);

  const emojiName = getEmojiName(emoji);

  return (
    <button
      type="button"
      onClick={handleClick}
      title={emojiName}
      aria-label={emojiName}
      className={clsx(
        "flex h-9 w-9 items-center justify-center rounded-lg",
        "text-xl",
        "transition-all duration-100",
        "hover:bg-[hsl(var(--surface-hover))]",
        "active:scale-90",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        isHighlighted && "bg-primary/10",
        className,
      )}
    >
      <span className="select-none">{emoji}</span>
    </button>
  );
};

export default EmojiButton;
