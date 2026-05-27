import React from "react";
import clsx from "clsx";
import { ArrowDown } from "lucide-react";

export interface ScrollToLatestButtonProps {
  /** Hiện nút khi user không ở bottom HOẶC có tin nhắn mới chưa đọc. */
  visible: boolean;
  /** Số tin nhắn mới chưa đọc — chuyển thành badge "1"…"9+". 0 = ẩn badge. */
  pendingCount: number;
  /** Scroll xuống tin nhắn mới nhất + clear badge. */
  onClick: () => void;
  /**
   * Chiều cao composer (px) khi composer overlay timeline. Bottom của nút sẽ
   * cách composer 16px. Bỏ qua nếu composer không overlay.
   */
  composerHeight?: number;
  className?: string;
}

const formatBadge = (count: number): string | null => {
  if (count <= 0) return null;
  if (count > 9) return "9+";
  return String(count);
};

const ScrollToLatestButtonComponent: React.FC<ScrollToLatestButtonProps> = ({
  visible,
  pendingCount,
  onClick,
  composerHeight,
  className,
}) => {
  if (!visible) return null;

  const badge = formatBadge(pendingCount);
  const ariaLabel =
    pendingCount > 0
      ? `Lướt xuống ${pendingCount} tin nhắn mới`
      : "Lướt xuống tin nhắn mới nhất";

  const bottomOffset =
    typeof composerHeight === "number" && composerHeight > 0
      ? composerHeight + 16
      : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      data-testid="scroll-to-latest-button"
      style={bottomOffset !== undefined ? { bottom: bottomOffset } : undefined}
      className={clsx(
        "absolute right-4 z-20",
        bottomOffset === undefined && "bottom-4",
        "flex h-10 min-w-10 items-center justify-center rounded-full",
        "border border-border bg-background/95 shadow-lg backdrop-blur",
        "transition hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <ArrowDown className="h-5 w-5" aria-hidden="true" />
      {badge && (
        <span
          data-testid="scroll-to-latest-badge"
          className={clsx(
            "absolute -right-1 -top-1",
            "flex h-5 min-w-5 items-center justify-center rounded-full",
            "bg-[#FFC857] px-1 text-xs font-semibold text-[#C41E3A]",
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
};

ScrollToLatestButtonComponent.displayName = "ScrollToLatestButton";

export const ScrollToLatestButton = React.memo(ScrollToLatestButtonComponent);

export default ScrollToLatestButton;
