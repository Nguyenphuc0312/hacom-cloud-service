import { chatApi } from "../api/chatApi";

export const banMemberUseCase = async (
  conversationId: string,
  userId: string,
) => {
  return chatApi.group.banMember(conversationId, userId);
};

export const unbanMemberUseCase = async (
  conversationId: string,
  userId: string,
) => {
  return chatApi.group.unbanMember(conversationId, userId);
};

export const restrictMemberUseCase = async (
  conversationId: string,
  userId: string,
  restrictedUntil: string,
) => {
  return chatApi.group.restrictMember(conversationId, userId, restrictedUntil);
};
