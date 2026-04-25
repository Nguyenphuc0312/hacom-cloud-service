import { create } from "zustand";

interface ChatUiState {
  searchOpen: boolean;
  mediaPanelOpen: boolean;
  composerDraftByConversation: Record<string, string>;
  setSearchOpen: (value: boolean) => void;
  setMediaPanelOpen: (value: boolean) => void;
  setComposerDraft: (conversationId: string, value: string) => void;
  clearComposerDraft: (conversationId: string) => void;
}

export const useChatUiStore = create<ChatUiState>((set) => ({
  searchOpen: false,
  mediaPanelOpen: false,
  composerDraftByConversation: {},
  setSearchOpen: (value) => set({ searchOpen: value }),
  setMediaPanelOpen: (value) => set({ mediaPanelOpen: value }),
  setComposerDraft: (conversationId, value) =>
    set((state) => {
      const currentValue = state.composerDraftByConversation[conversationId] ?? "";
      if (currentValue === value) {
        return state;
      }

      if (!value) {
        const nextDrafts = { ...state.composerDraftByConversation };
        delete nextDrafts[conversationId];
        return {
          composerDraftByConversation: nextDrafts,
        };
      }

      return {
        composerDraftByConversation: {
          ...state.composerDraftByConversation,
          [conversationId]: value,
        },
      };
    }),
  clearComposerDraft: (conversationId) =>
    set((state) => {
      if (!(conversationId in state.composerDraftByConversation)) {
        return state;
      }

      const nextDrafts = { ...state.composerDraftByConversation };
      delete nextDrafts[conversationId];
      return {
        composerDraftByConversation: nextDrafts,
      };
    }),
}));
