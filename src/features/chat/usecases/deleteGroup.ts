import { chatApi } from "../api/chatApi";

export const deleteGroupUseCase = async (conversationId: string) => {
  return chatApi.group.deleteGroup(conversationId);
};
