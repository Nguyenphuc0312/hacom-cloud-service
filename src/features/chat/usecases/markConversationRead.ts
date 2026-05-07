import { useChatStore } from "../../../stores";
import type { MarkAsReadInput } from "../../../stores/chatStoreUnread";

export const markConversationReadUseCase = async (
  conversationId: string,
  input?: string | MarkAsReadInput,
) => {
  const { markAsRead } = useChatStore.getState();
  return markAsRead(conversationId, input);
};
