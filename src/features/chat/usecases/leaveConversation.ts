import { chatApi } from "../api/chatApi";

export const leaveConversationUseCase = async (conversationId: string) => {
  return chatApi.conversation.leaveConversation(conversationId);
};
