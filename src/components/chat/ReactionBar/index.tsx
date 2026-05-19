/**
 * ReactionBar - Container for reaction chips below a message bubble.
 *
 * Features:
 * - Position: margin-top 4px, align flex-end for outgoing, flex-start for incoming
 * - Shows up to 3 chips, then "+N" overflow chip
 * - Uses ReactionChip for each reaction
 * - Animate chips on appear
 */

import React, { useCallback } from "react";
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

  const {
    visibleReactions,
    overflowCount,
    hasOverflow,
  } = useReactionBar({
    reactions,
    currentUserId,
    maxVisible: 3,
  });

  const handleChipClick = useCallback(
    (emoji: string) => {
      // If user has a different reaction, this will replace it
      // The parent's onReact handles the logic
      onReact(emoji);
    },
    [onReact],
  );

  const handleChipToggle = useCallback(
    (emoji: string) => {
      onToggleReaction(emoji);
    },
    [onToggleReaction],
  );

  const handleOverflowClick = useCallback(() => {
    // TODO: Show overflow menu with all reactions
    // For now, clicking overflow will show quick reactions
  }, []);

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

      {/* Overflow chip */}
      {hasOverflow && (
        <button
          type="button"
          onClick={handleOverflowClick}
          className={clsx(
            "inline-flex items-center rounded-full",
            "px-2 py-0.5 text-xs",
            "border border-[hsl(var(--border-secondary))] bg-white",
            "text-text-secondary hover:bg-[hsl(var(--surface-hover))]",
            "transition-all duration-100 hover:scale-105 active:scale-100",
          )}
          aria-label={`${overflowCount} more reactions`}
        >
          <span className="font-medium">+{overflowCount}</span>
        </button>
      )}
    </div>
  );
};

export default ReactionBar;
