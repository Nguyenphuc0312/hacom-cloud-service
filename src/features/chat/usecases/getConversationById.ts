import { chatApi } from "../api/chatApi";

export const getConversationByIdUseCase = async (conversationId: string) => {
  return chatApi.conversation.getConversationById(conversationId);
};
