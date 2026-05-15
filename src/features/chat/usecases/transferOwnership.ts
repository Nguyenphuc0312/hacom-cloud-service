import { chatApi } from "../api/chatApi";

export const transferOwnershipUseCase = async (
  conversationId: string,
  newOwnerId: string,
) => {
  return chatApi.group.transferOwnership(conversationId, newOwnerId);
};
