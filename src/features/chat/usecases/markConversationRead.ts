import { useChatStore } from "../../../stores";

export const markConversationReadUseCase = async (
  conversationId: string,
  lastVisibleMessageId?: string,
) => {
  const { markAsRead } = useChatStore.getState();
  return markAsRead(conversationId, lastVisibleMessageId);
};
