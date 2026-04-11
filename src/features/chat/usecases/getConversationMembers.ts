import { chatApi } from "../api/chatApi";

export const getConversationMembersUseCase = async (
  conversationId: string,
  page = 1,
  limit = 200,
) => {
  return chatApi.conversation.getMembers(conversationId, page, limit);
};
