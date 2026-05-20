/**
 * ReactionBar - Container for reaction chips below a message bubble.
 *
 * Features:
 * - Position: margin-top 4px, align flex-end for outgoing, flex-start for incoming
 * - Shows up to 3 chips, then "+N" overflow chip
 * - Uses ReactionChip for each reaction
 * - Animate chips on appear
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import type { Reaction } from "@hacom/chat-shared-types/chat";
import { ReactionChip } from "./ReactionChip";
import { useReactionBar } from "./useReactionBar";

interface ReactionBarProps {
  reactions?: Reaction[];
  currentUserId?: string;
  isOutgoing: boolean;
  onReact: (emoji: string) => void;
  onToggleReaction: (emoji: string) => void;
  className?: string;
}

export const ReactionBar: React.FC<ReactionBarProps> = ({
  reactions = [],
  currentUserId,
  isOutgoing,
  onReact,
  onToggleReaction,
  className,
}) => {
  const hasReactions = reactions.length > 0;
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  const {
    visibleReactions,
    overflowCount,
    hasOverflow,
  } = useReactionBar({
    reactions,
    currentUserId,
    maxVisible: 3,
  });

  const hiddenReactions = hasOverflow ? reactions.slice(3) : [];

  const handleChipClick = useCallback(
    (emoji: string) => {
      onReact(emoji);
      setOverflowOpen(false);
    },
    [onReact],
  );

  const handleChipToggle = useCallback(
    (emoji: string) => {
      onToggleReaction(emoji);
      setOverflowOpen(false);
    },
    [onToggleReaction],
  );

  const handleOverflowClick = useCallback(() => {
    setOverflowOpen((prev) => !prev);
  }, []);

  // Close popover on outside click
  useEffect(() => {
    if (!overflowOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [overflowOpen]);

  if (!hasReactions) {
    return null;
  }

  return (
    <div
      className={clsx(
        "mt-1 flex flex-wrap items-center gap-1",
        isOutgoing ? "justify-end" : "justify-start",
        className,
      )}
    >
      {/* Visible reaction chips */}
      {visibleReactions.map((reaction, index) => {
        const isMyReaction = currentUserId
          ? reaction.userIds.includes(currentUserId)
          : false;

        return (
          <div
            key={reaction.emoji}
            className="animate-reaction-pop"
            style={{
              animationDelay: `${index * 50}ms`,
              animationFillMode: "both",
            }}
          >
            <ReactionChip
              reaction={reaction}
              reactedByMe={isMyReaction}
              currentUserId={currentUserId}
              onClick={handleChipClick}
              onToggle={handleChipToggle}
            />
          </div>
        );
      })}

      {/* Overflow chip + popover */}
      {hasOverflow && (
        <div ref={overflowRef} className="relative">
          <button
            type="button"
            onClick={handleOverflowClick}
            aria-expanded={overflowOpen}
            aria-label={`${overflowCount} reactions thêm`}
            className={clsx(
              "inline-flex items-center rounded-full",
              "px-2 py-0.5 text-xs",
              "border border-border bg-surface",
              "text-text-secondary hover:bg-[hsl(var(--surface-hover))]",
              "transition-all duration-100 hover:scale-105 active:scale-100",
              overflowOpen && "bg-[hsl(var(--surface-hover))]",
            )}
          >
            <span className="font-medium">+{overflowCount}</span>
          </button>

          {overflowOpen && (
            <div
              className={clsx(
                "absolute bottom-full mb-1.5 z-50",
                isOutgoing ? "right-0" : "left-0",
                "flex flex-wrap gap-1 p-2",
                "min-w-max max-w-[200px]",
                "rounded-xl border border-border bg-surface shadow-elev3",
                "animate-scale-in-emoji",
              )}
            >
              {hiddenReactions.map((reaction) => {
                const isMyReaction = currentUserId
                  ? reaction.userIds.includes(currentUserId)
                  : false;
                return (
                  <ReactionChip
                    key={reaction.emoji}
                    reaction={reaction}
                    reactedByMe={isMyReaction}
                    currentUserId={currentUserId}
                    onClick={handleChipClick}
                    onToggle={handleChipToggle}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReactionBar;
