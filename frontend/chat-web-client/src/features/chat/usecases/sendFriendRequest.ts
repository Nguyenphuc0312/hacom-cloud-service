import { chatApi } from "../api/chatApi";

export const sendFriendRequestUseCase = async (userId: string) => {
  return chatApi.friendship.sendFriendRequest(userId);
};
