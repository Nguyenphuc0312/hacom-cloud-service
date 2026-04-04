import { useChatStore } from "../../../stores";

export const loadConversationsUseCase = async () => {
  const { fetchConversations } = useChatStore.getState();
  return fetchConversations();
};
