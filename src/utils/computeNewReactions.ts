/**
 * Pure function to compute new reaction state based on user action.
 * Implements the business rules:
 * 1. One user can only react with one emoji per message
 * 2. Selecting a new emoji when holding an old one → REPLACE (not accumulate)
 * 3. Tapping the same emoji again → TOGGLE OFF (remove reaction)
 */

import type { Reaction } from "@chat/shared-types";

export interface ComputeResult {
  reactions: Reaction[];
  action: "add" | "remove" | "none";
}

/**
 * Compute new reactions after a user reacts to a message.
 *
 * @param prev - Current reactions array
 * @param userId - ID of the user performing the action
 * @param emoji - Emoji the user selected
 * @returns New reactions array and the action performed
 */
export function computeNewReactions(
  prev: Reaction[],
  userId: string,
  emoji: string,
): ComputeResult {
  // Find the reaction group containing this user (if any)
  const existingGroup = prev.find((group) => group.userIds.includes(userId));
  const existingEmoji = existingGroup?.emoji;

  // Case 1: User is already reacting with the SAME emoji → toggle OFF
  if (existingEmoji === emoji) {
    const updatedReactions = removeUserFromReaction(prev, userId, emoji);
    return {
      reactions: sortReactions(updatedReactions),
      action: "remove",
    };
  }

  // Case 2: User is already reacting with a DIFFERENT emoji → replace
  if (existingGroup) {
    const updatedReactions = replaceUserReaction(prev, userId, existingEmoji!, emoji);
    return {
      reactions: sortReactions(updatedReactions),
      action: "add",
    };
  }

  // Case 3: User has no existing reaction → add new
  const updatedReactions = addReaction(prev, userId, emoji);
  return {
    reactions: sortReactions(updatedReactions),
    action: "add",
  };
}

/**
 * Remove a user from a specific reaction group.
 * If the group becomes empty, remove it entirely.
 */
function removeUserFromReaction(
  reactions: Reaction[],
  userId: string,
  emoji: string,
): Reaction[] {
  return reactions
    .map((group) => {
      if (group.emoji !== emoji) return group;

      const newUserIds = group.userIds.filter((id) => id !== userId);
      const newCount = Math.max(0, group.count - 1);

      // Remove group if empty
      if (newUserIds.length === 0 || newCount === 0) {
        return null;
      }

      return {
        ...group,
        userIds: newUserIds,
        count: newCount,
      };
    })
    .filter((group): group is Reaction => group !== null);
}

/**
 * Replace user's existing reaction with a new emoji.
 * Removes from old group and adds to new group.
 */
function replaceUserReaction(
  reactions: Reaction[],
  userId: string,
  oldEmoji: string,
  newEmoji: string,
): Reaction[] {
  // First, remove from old group
  let result = removeUserFromReaction(reactions, userId, oldEmoji);

  // Then add to new group
  result = addReaction(result, userId, newEmoji);

  return result;
}

/**
 * Add a reaction for a user.
 * If the emoji group exists, add user to it.
 * If not, create a new group.
 */
function addReaction(
  reactions: Reaction[],
  userId: string,
  emoji: string,
): Reaction[] {
  const existingGroup = reactions.find((group) => group.emoji === emoji);

  if (existingGroup) {
    // Add user to existing group if not already present
    if (existingGroup.userIds.includes(userId)) {
      return reactions;
    }

    return reactions.map((group) => {
      if (group.emoji === emoji) {
        return {
          ...group,
          userIds: [...group.userIds, userId],
          count: group.count + 1,
        };
      }
      return group;
    });
  }

  // Create new group
  return [
    ...reactions,
    {
      emoji,
      userIds: [userId],
      count: 1,
    },
  ];
}

/**
 * Sort reactions by count (descending), then by emoji code point (ascending).
 * Most popular reactions appear first.
 */
function sortReactions(reactions: Reaction[]): Reaction[] {
  return [...reactions].sort((a, b) => {
    // Sort by count descending
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    // Then by emoji code point ascending (deterministic order)
    const aCode = a.emoji.codePointAt(0) ?? 0;
    const bCode = b.emoji.codePointAt(0) ?? 0;
    return aCode - bCode;
  });
}

/**
 * Get the top N reactions by count.
 */
export function getTopReactions(reactions: Reaction[], limit: number): Reaction[] {
  return [...reactions]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Count total reactions.
 */
export function getTotalReactionCount(reactions: Reaction[]): number {
  return reactions.reduce((sum, group) => sum + group.count, 0);
}

/**
 * Check if a user has reacted to a message.
 */
export function hasUserReacted(
  reactions: Reaction[],
  userId: string,
): boolean {
  return reactions.some((group) => group.userIds.includes(userId));
}

/**
 * Get the emoji a user has reacted with.
 */
export function getUserReactionEmoji(
  reactions: Reaction[],
  userId: string,
): string | null {
  const group = reactions.find((g) => g.userIds.includes(userId));
  return group?.emoji ?? null;
}
