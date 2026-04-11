import { chatApi } from "../api/chatApi";

export const searchUsersUseCase = async (
  query: string,
  page = 1,
  limit = 20,
) => {
  return chatApi.user.searchUsers(query, page, limit);
};
