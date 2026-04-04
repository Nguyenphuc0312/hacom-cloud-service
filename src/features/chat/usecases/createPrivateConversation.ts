import { chatApi } from "../api/chatApi";

export const createPrivateConversationUseCase = async (userId: string) => {
  return chatApi.conversation.createPrivateConversation(userId);
};
