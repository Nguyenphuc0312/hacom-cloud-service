export interface ConversationResyncPatch {
  conversationId: string;
  reason: string;
}

export const createScopedConversationResyncPatch = (
  conversationId: string,
  reason: string,
): ConversationResyncPatch => ({
  conversationId,
  reason,
});
