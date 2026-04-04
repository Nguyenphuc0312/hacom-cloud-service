import { chatApi } from "../api/chatApi";

export const removeConversationMemberUseCase = async (
  conversationId: string,
  userId: string,
) => {
  return chatApi.conversation.removeMember(conversationId, userId);
};
