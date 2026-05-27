/**
 * ReactionBar - Zalo-style unified reaction pill.
 *
 * All emojis are stacked together in one pill with a total count,
 * e.g.: 😂❤️ 8 — click to open reaction detail modal.
 */

import React, { useCallback, useState } from "react";
import { clsx } from "clsx";
import type { Reaction } from "@hacom/chat-shared-types/chat";
import { ReactionDetailModal } from "./ReactionDetailModal";

interface ReactionBarProps {
  reactions?: Reaction[];
  currentUserId?: string;
  isOutgoing: boolean;
  onReact: (emoji: string) => void;
  onToggleReaction: (emoji: string) => void;
  conversationId?: string;
  className?: string;
}

const MAX_SHOWN_EMOJIS = 3;

export const ReactionBar: React.FC<ReactionBarProps> = ({
  reactions = [],
  currentUserId,
  isOutgoing: _isOutgoing,
  onReact: _onReact,
  onToggleReaction: _onToggleReaction,
  conversationId,
  className,
}) => {
  const [showModal, setShowModal] = useState(false);

  const hasReactions = reactions.length > 0;

  // Total count across all reactions
  const totalCount = reactions.reduce((sum, r) => sum + r.count, 0);

  // Top emojis to show (sorted by count)
  const shownEmojis = [...reactions].sort((a, b) => b.count - a.count).slice(0, MAX_SHOWN_EMOJIS);

  const reactedByMe = currentUserId
    ? reactions.some((r) => r.userIds.includes(currentUserId))
    : false;

  const handlePillClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowModal(true);
  }, []);

  if (!hasReactions) return null;

  return (
    <>
      <button
        type="button"
        onClick={handlePillClick}
        className={clsx(
          "inline-flex items-center gap-0.5 rounded-full",
          "h-[22px] px-2",
          "border text-xs font-medium",
          "transition-all duration-100 hover:scale-105 active:scale-100 select-none",
          "z-10 relative",
          reactedByMe
            ? "border-[#1976D2]/40 bg-[#EBF4FF] text-[#1565C0] shadow-sm"
            : "border-border bg-white text-text-secondary shadow-md",
          className,
        )}
        aria-label={`${totalCount} reaction${totalCount !== 1 ? "s" : ""}`}
      >
        {/* Stacked emojis */}
        <span className="flex items-center leading-none">
          {shownEmojis.map((r, i) => (
            <span
              key={r.emoji}
              className={clsx("inline-block text-[13px]", i > 0 && "-ml-0.5")}
            >
              {r.emoji}
            </span>
          ))}
        </span>

        {/* Total count */}
        <span className="ml-0.5 tabular-nums text-[11px]">
          {totalCount}
        </span>
      </button>

      <ReactionDetailModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        reactions={reactions}
        currentUserId={currentUserId}
        conversationId={conversationId}
      />
    </>
  );
};

export default ReactionBar;
