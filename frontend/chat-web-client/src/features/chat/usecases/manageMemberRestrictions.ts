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
  // Convert ISO date string to seconds from now
  const restrictedUntilDate = new Date(restrictedUntil);
  const seconds = Math.max(1, Math.floor((restrictedUntilDate.getTime() - Date.now()) / 1000));
  return chatApi.group.restrictMember(conversationId, userId, seconds);
};
