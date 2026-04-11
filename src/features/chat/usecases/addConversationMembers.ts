import { chatApi } from "../api/chatApi";

export const addConversationMembersUseCase = async (
  conversationId: string,
  memberIds: string[],
) => {
  return chatApi.conversation.addMembers(conversationId, memberIds);
};
