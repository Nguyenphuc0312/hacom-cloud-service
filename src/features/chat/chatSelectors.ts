import type { RootState } from "../../store";

export const selectActiveConversationId = (state: RootState) =>
  state.chat.activeConversationId;

export const selectSelectedMessageId = (state: RootState) =>
  state.chat.selectedMessageId;

export const selectSidebarFilter = (state: RootState) =>
  state.chat.sidebarFilter;

export const selectSidebarSearchQuery = (state: RootState) =>
  state.chat.sidebarSearchQuery;

export const selectDraftForConversation =
  (conversationId: string | null) => (state: RootState): string => {
    if (!conversationId) return "";
    return state.chat.draftByConversationId[conversationId] ?? "";
  };

