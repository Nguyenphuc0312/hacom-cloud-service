import React from "react";
import { clsx } from "clsx";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "😡"] as const;

interface QuickReactBarProps {
  isMine?: boolean;
  currentUserReaction?: string | null;
  visible: boolean;
  onReact: (emoji: string) => void;
  onClose?: () => void;
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
}

export const QuickReactBar: React.FC<QuickReactBarProps> = ({
  isMine,
  currentUserReaction,
  visible,
  onReact,
  onClose,
  onMouseEnter,
  onMouseLeave,
}) => {
  const barRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!visible || !onClose) return;

    const handleClick = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClick, true);
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("mousedown", handleClick, true);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, [visible, onClose]);

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Chọn cảm xúc"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => e.stopPropagation()}
      className={clsx(
        "absolute bottom-full z-30 mb-2",
        "flex items-center gap-0.5 rounded-full",
        "bg-surface border border-border shadow-elev3",
        "px-1.5 py-1",
        "transition-all duration-150 ease-out",
        visible
          ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
          : "pointer-events-none translate-y-1 scale-95 opacity-0",
        isMine ? "right-0" : "left-0",
      )}
    >
      {QUICK_EMOJIS.map((emoji) => {
        const isActive = currentUserReaction === emoji;
        return (
          <button
            key={emoji}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReact(emoji);
            }}
            aria-label={`Cảm xúc ${emoji}`}
            aria-pressed={isActive}
            className={clsx(
              "flex h-9 w-9 items-center justify-center rounded-full text-[22px]",
              "border border-transparent",
              "transition-all duration-100",
              "hover:scale-125 hover:bg-surface-hover",
              isActive && "scale-110 border-primary/40 bg-primary/10",
            )}
          >
            {emoji}
          </button>
        );
      })}
    </div>
  );
};

export default QuickReactBar;
