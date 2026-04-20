import { chatApi } from "../api/chatApi";

export const searchUsersUseCase = async (
  query: string,
  page = 1,
  limit = 20,
  options?: { signal?: AbortSignal },
) => {
  return chatApi.user.searchUsers(query, page, limit, options);
};
