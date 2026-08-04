import { chatApi } from "../api/chatApi";

export const getUserByIdUseCase = async (userId: string) => {
  return chatApi.user.getUserById(userId);
};
