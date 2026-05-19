/**
 * useReactionBar - Hook for ReactionBar state management and click handlers.
 */

import { useCallback, useMemo } from "react";
import type { Reaction } from "@chat/shared-types";
import { getTopReactions, getUserReactionEmoji } from "../../../utils/computeNewReactions";

export interface UseReactionBarOptions {
  reactions: Reaction[];
  currentUserId?: string;
  maxVisible?: number;
}

export interface UseReactionBarReturn {
  visibleReactions: Reaction[];
  overflowCount: number;
  hasOverflow: boolean;
  myReactionEmoji: string | null;
  reactedByMe: boolean;
  handleChipClick: (emoji: string) => void;
  handleOverflowClick: () => void;
}

const DEFAULT_MAX_VISIBLE = 3;

export function useReactionBar({
  reactions,
  currentUserId,
  maxVisible = DEFAULT_MAX_VISIBLE,
}: UseReactionBarOptions): UseReactionBarReturn {
  // Get top N reactions
  const topReactions = useMemo(
    () => getTopReactions(reactions, maxVisible),
    [reactions, maxVisible],
  );

  const overflowCount = Math.max(0, reactions.length - maxVisible);
  const hasOverflow = overflowCount > 0;

  // Check if current user has reacted
  const myReactionEmoji = useMemo(
    () => (currentUserId ? getUserReactionEmoji(reactions, currentUserId) : null),
    [reactions, currentUserId],
  );

  const reactedByMe = myReactionEmoji !== null;

  const handleChipClick = useCallback(
    (_emoji: string) => {
      // This will be connected to the parent's onToggleReaction handler
      // The parent component will handle the actual reaction logic
    },
    [],
  );

  const handleOverflowClick = useCallback(() => {
    // This will show the overflow menu with all reactions
    // Implementation depends on parent component
  }, []);

  return {
    visibleReactions: topReactions,
    overflowCount,
    hasOverflow,
    myReactionEmoji,
    reactedByMe,
    handleChipClick,
    handleOverflowClick,
  };
}
