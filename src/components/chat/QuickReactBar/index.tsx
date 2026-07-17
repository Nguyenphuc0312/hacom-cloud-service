import React from "react";
import { clsx } from "clsx";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "😡"] as const;

interface QuickReactBarProps {
  isMine?: boolean;
  /** Override horizontal alignment. Defaults to isMine ? "right" : "left" */
  align?: "left" | "right" | "center";
  currentUserReaction?: string | null;
  visible: boolean;
  onReact: (emoji: string) => void;
  onClose?: () => void;
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
}

export const QuickReactBar: React.FC<QuickReactBarProps> = ({
  isMine,
  align,
  currentUserReaction,
  visible,
  onReact,
  onClose,
  onMouseEnter,
  onMouseLeave,
}) => {
  const alignClass = align === "center"
    ? "left-1/2 -translate-x-1/2"
    : align === "right" || (!align && isMine)
      ? "right-0"
      : "left-0";
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
    // Outer div dùng padding-bottom (không phải margin) làm cầu hover liền mạch
    // giữa nút mở và thanh emoji — margin tạo khe chết khiến bar tự tắt khi
    // chuột đi lên để chọn icon.
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Chọn cảm xúc"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => e.stopPropagation()}
      className={clsx(
        "absolute bottom-full z-30 pb-2",
        "transition-all duration-150 ease-out",
        visible
          ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
          : "pointer-events-none translate-y-1 scale-95 opacity-0",
        alignClass,
      )}
    >
    <div
      className={clsx(
        "flex items-center gap-0.5 rounded-full",
        "bg-surface border border-border shadow-elev3",
        "px-1.5 py-1",
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
              isActive && "scale-110 border-[#1976D2]/50 bg-[#1976D2]/10",
            )}
          >
            {emoji}
          </button>
        );
      })}
    </div>
    </div>
  );
};

export default QuickReactBar;
