import { chatApi } from "../api/chatApi";
import type { Conversation } from "../../../types";

export const updateConversationUseCase = async (
  conversationId: string,
  data: Partial<Conversation>,
) => {
  return chatApi.conversation.updateConversation(conversationId, data);
};
