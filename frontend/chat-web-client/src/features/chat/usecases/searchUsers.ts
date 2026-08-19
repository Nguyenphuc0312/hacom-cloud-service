import { USERS_SEARCH_PAGE_SIZE } from "../../../services/api";
import { chatApi } from "../api/chatApi";

export const searchUsersUseCase = async (
  query: string,
  page = 1,
  limit = USERS_SEARCH_PAGE_SIZE,
  options?: { signal?: AbortSignal; includeSelf?: boolean },
) => {
  return chatApi.user.searchUsers(query, page, limit, options);
};
