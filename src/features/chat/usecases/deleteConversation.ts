import { chatApi } from "../api/chatApi";

export const deleteConversationUseCase = async (conversationId: string) => {
  return chatApi.conversation.deleteConversation(conversationId);
};
