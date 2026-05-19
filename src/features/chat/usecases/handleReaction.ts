/**
 * handleReaction - Use case for handling reaction actions with optimistic update.
 *
 * Implements:
 * 1. Get snapshot from RTK cache
 * 2. Compute new reactions using computeNewReactions
 * 3. Optimistic update to RTK cache
 * 4. API call (add or remove based on computeNewReactions result)
 * 5. Rollback on error
 * 6. Save to localStorage recent emojis
 */

import { toast } from "react-hot-toast";
import { chatApi } from "@/features/api/chatApi";
import { computeNewReactions, type ComputeResult } from "@/utils/computeNewReactions";
import { saveRecentEmoji } from "@/components/chat/ReactionPicker/emoji-data";
import type { Reaction } from "@chat/shared-types";

interface HandleReactionOptions {
  messageId: string;
  emoji: string;
  currentUserId: string;
  conversationId: string;
}

interface HandleReactionResult {
  success: boolean;
  action: ComputeResult["action"];
  previousReactions: Reaction[];
  newReactions: Reaction[];
}

/**
 * Get the current reactions for a message from RTK cache.
 */
function getMessageReactionsFromCache(
  conversationId: string,
  messageId: string,
): Reaction[] {
  const state = chatApi.util.getState();
  const cache = chatApi.endpoints.getMessages.select({ conversationId })(state);

  if (!cache?.data?.messages) {
    return [];
  }

  const message = cache.data.messages.find(
    (msg) =>
      msg.id === messageId ||
      msg.localId === messageId ||
      msg.stableId === messageId ||
      msg.clientMessageId === messageId,
  );

  return message?.reactions ?? [];
}

/**
 * Update reactions in RTK cache directly.
 */
function updateReactionsInCache(
  conversationId: string,
  messageId: string,
  reactions: Reaction[],
): void {
  chatApi.util.updateQueryData(
    "getMessages",
    { conversationId },
    (draft) => {
      const message = draft.messages.find(
        (msg) =>
          msg.id === messageId ||
          msg.localId === messageId ||
          msg.stableId === messageId ||
          msg.clientMessageId === messageId,
      );

      if (message) {
        message.reactions = reactions;
      }
    },
  );
}

/**
 * Main reaction handler function.
 * Handles adding, removing, or toggling reactions with optimistic updates.
 *
 * @param options - The reaction options including messageId, emoji, currentUserId, conversationId
 * @returns Result object with success status and reaction changes
 */
export async function handleReaction(
  options: HandleReactionOptions,
): Promise<HandleReactionResult> {
  const { messageId, emoji, currentUserId, conversationId } = options;

  // Step 1: Get current snapshot from cache
  const previousReactions = getMessageReactionsFromCache(conversationId, messageId);

  // Step 2: Compute new reactions
  const { reactions: newReactions, action } = computeNewReactions(
    previousReactions,
    currentUserId,
    emoji,
  );

  // If no change needed, return early
  if (action === "none") {
    return {
      success: true,
      action: "none",
      previousReactions,
      newReactions,
    };
  }

  // Step 3: Optimistic update
  updateReactionsInCache(conversationId, messageId, newReactions);

  // Step 4: API call
  try {
    if (action === "remove") {
      await chatApi.endpoints.removeReaction.initiate({
        conversationId,
        messageId,
        emoji,
      });
    } else if (action === "add") {
      await chatApi.endpoints.addReaction.initiate({
        conversationId,
        messageId,
        emoji,
      });

      // Step 5: Save to localStorage if adding
      saveRecentEmoji(emoji);
    }

    return {
      success: true,
      action,
      previousReactions,
      newReactions,
    };
  } catch (error) {
    // Step 6: Rollback on error
    updateReactionsInCache(conversationId, messageId, previousReactions);

    // Show error toast
    toast.error("Không thể gửi reaction");

    return {
      success: false,
      action,
      previousReactions,
      newReactions: previousReactions,
    };
  }
}

/**
 * Toggle a reaction (remove if user already reacted with this emoji).
 * This is a convenience wrapper around handleReaction.
 */
export async function toggleReaction(
  options: HandleReactionOptions,
): Promise<HandleReactionResult> {
  const { emoji, currentUserId, conversationId, messageId } = options;

  const currentReactions = getMessageReactionsFromCache(conversationId, messageId);
  const existingGroup = currentReactions.find((group) =>
    group.userIds.includes(currentUserId),
  );
  const existingEmoji = existingGroup?.emoji;

  // If clicking the same emoji, remove it
  // If clicking a different emoji, replace it
  return handleReaction({
    messageId,
    emoji,
    currentUserId,
    conversationId,
  });
}
