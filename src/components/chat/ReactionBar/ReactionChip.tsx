/**
 * ReactionChip - Single reaction chip component with tooltip.
 *
 * Features:
 * - Emoji (18px) + space (4px) + count (12px)
 * - Padding: 3px 8px, border-radius: 20px
 * - My chip: bg #EBF4FF, border #B5D4F4, count #185FA5
 * - Other chip: bg white, border var(--color-border-secondary)
 * - Hover: Tooltip after 400ms delay
 * - Click: toggleReaction or reactWithEmoji
 * - Animate: scale(0.5)→scale(1) + opacity 0→1, 200ms spring
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { clsx } from "clsx";
import type { Reaction } from "@hacom/chat-shared-types/chat";

interface ReactionChipProps {
  reaction: Reaction;
  reactedByMe: boolean;
  currentUserId?: string;
  onClick: (emoji: string) => void;
  onToggle: (emoji: string) => void;
  className?: string;
}

export const ReactionChip: React.FC<ReactionChipProps> = ({
  reaction,
  reactedByMe,
  currentUserId,
  onClick,
  onToggle,
  className,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipUsers, setTooltipUsers] = useState<string[]>([]);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chipRef = useRef<HTMLButtonElement>(null);

  const handleMouseEnter = useCallback(() => {
    tooltipTimeoutRef.current = setTimeout(() => {
      setShowTooltip(true);
      // In a real implementation, this would fetch user names from a cache/store
      // For now, we'll show a placeholder
      const userCount = reaction.userIds.length;
      const displayNames = reaction.userIds
        .slice(0, 2)
        .map((id) => (id === currentUserId ? "Bạn" : "Người dùng"));
      const others = userCount > 2 ? ` và ${userCount - 2} người khác` : "";
      setTooltipUsers([...displayNames, others]);
    }, 400);
  }, [reaction.userIds, currentUserId]);

  const handleMouseLeave = useCallback(() => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
    setShowTooltip(false);
    setTooltipUsers([]);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (reactedByMe) {
        onToggle(reaction.emoji);
      } else {
        onClick(reaction.emoji);
      }
    },
    [reactedByMe, onClick, onToggle, reaction.emoji],
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, []);

  const tooltipText = tooltipUsers.length > 0
    ? `${reaction.emoji} · ${tooltipUsers.join("")}`
    : "";

  return (
    <div className="relative">
      <button
        ref={chipRef}
        type="button"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={clsx(
          "group inline-flex items-center gap-1 rounded-full",
          "px-2 py-0.5 text-xs",
          "border transition-all duration-100",
          "hover:scale-105 hover:shadow-xs active:scale-100",
          reactedByMe
            ? "bg-[#EBF4FF] border-[#B5D4F4] hover:bg-[#D6E8FA]"
            : "bg-white border-[hsl(var(--border-secondary))] hover:bg-[hsl(var(--surface-hover))]",
          className,
        )}
        aria-label={`${reaction.emoji} reaction, ${reaction.count} ${
          reaction.count === 1 ? "person" : "people"
        }`}
      >
        {/* Emoji */}
        <span className="text-base leading-none">{reaction.emoji}</span>

        {/* Count */}
        <span
          className={clsx(
            "font-medium tabular-nums",
            reactedByMe ? "text-[#185FA5]" : "text-text-secondary",
          )}
        >
          {reaction.count}
        </span>
      </button>

      {/* Tooltip */}
      {showTooltip && tooltipText && (
        <div
          className={clsx(
            "absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2",
            "whitespace-nowrap rounded-md border border-border/50",
            "bg-[hsl(var(--surface))] px-2 py-1 text-xs",
            "shadow-elev2",
            "animate-fade-in",
          )}
        >
          {tooltipText}
          {/* Tooltip arrow */}
          <div
            className={clsx(
              "absolute left-1/2 top-full -translate-x-1/2",
              "border-4 border-transparent border-t-border/50",
            )}
          />
        </div>
      )}
    </div>
  );
};

export default ReactionChip;
