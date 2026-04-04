import { useChatStore } from "../../../stores";

export const useChatConversations = () =>
  useChatStore((state) => state.conversations);

export const useCurrentConversation = () =>
  useChatStore(
    (state) =>
      state.conversations.find(
        (conversation) => conversation.id === state.selectedConversationId,
      ) || null,
  );

export const useCurrentConversationMessages = () =>
  useChatStore((state) => {
    const currentId = state.selectedConversationId;
    if (!currentId) {
      return [];
    }
    return state.messages[currentId] || [];
  });
