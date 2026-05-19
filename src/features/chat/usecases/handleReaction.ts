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
import { unwrapApiSuccess } from "@/lib/apiContract";
import { messageApi } from "@/services/api";
import type { Message } from "@/types";
import { computeNewReactions, type ComputeResult } from "@/utils/computeNewReactions";
import { saveRecentEmoji } from "@/components/chat/ReactionPicker/emoji-data";
import { store, type AppDispatch, type RootState } from "@/store";
import type { Reaction } from "@hacom/chat-shared-types/chat";

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

interface ReactionStoreContext {
  dispatch: AppDispatch;
  getState: () => RootState;
}

/**
 * Get the current reactions for a message from RTK cache.
 */
function getMessageReactionsFromCache(
  conversationId: string,
  messageId: string,
  getState: () => RootState,
): Reaction[] {
  const cache = chatApi.endpoints.getMessages.select({ conversationId })(getState());

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
  dispatch: AppDispatch,
) {
  return dispatch(
    chatApi.util.updateQueryData("getMessages", { conversationId }, (draft) => {
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
    }),
  );
}

function syncMessageInCache(
  conversationId: string,
  message: Message,
  dispatch: AppDispatch,
) {
  return dispatch(
    chatApi.util.updateQueryData("getMessages", { conversationId }, (draft) => {
      const cachedMessage = draft.messages.find(
        (candidate) =>
          candidate.id === message.id ||
          candidate.localId === message.id ||
          candidate.stableId === message.id ||
          candidate.clientMessageId === message.id,
      );

      if (cachedMessage) {
        Object.assign(cachedMessage, message);
      }
    }),
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
  context: ReactionStoreContext = store,
): Promise<HandleReactionResult> {
  const { messageId, emoji, currentUserId, conversationId } = options;
  const { dispatch, getState } = context;

  // Step 1: Get current snapshot from cache
  const previousReactions = getMessageReactionsFromCache(
    conversationId,
    messageId,
    getState,
  );

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
  const patch = updateReactionsInCache(
    conversationId,
    messageId,
    newReactions,
    dispatch,
  );

  // Step 4: API call
  try {
    let canonicalMessage: Message | null = null;

    if (action === "remove") {
      canonicalMessage = unwrapApiSuccess(
        await messageApi.removeReaction(messageId, emoji),
      );
    } else if (action === "add") {
      canonicalMessage = unwrapApiSuccess(
        await messageApi.addReaction(messageId, emoji),
      );

      // Step 5: Save to localStorage if adding
      saveRecentEmoji(emoji);
    }

    if (!canonicalMessage) {
      throw new Error(`Unsupported reaction action: ${action}`);
    }

    syncMessageInCache(conversationId, canonicalMessage, dispatch);

    return {
      success: true,
      action,
      previousReactions,
      newReactions,
    };
  } catch {
    // Step 6: Rollback on error
    patch.undo();

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
  context: ReactionStoreContext = store,
): Promise<HandleReactionResult> {
  // Delegate to handleReaction which handles the toggle logic
  return handleReaction(options, context);
}
