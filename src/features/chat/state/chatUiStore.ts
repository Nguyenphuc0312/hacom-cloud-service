import { create } from "zustand";

const COMPOSER_DRAFTS_STORAGE_KEY = "chat:composerDrafts";

const readComposerDrafts = (): Record<string, string> => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.sessionStorage.getItem(COMPOSER_DRAFTS_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
};

const persistComposerDrafts = (drafts: Record<string, string>) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (Object.keys(drafts).length === 0) {
      window.sessionStorage.removeItem(COMPOSER_DRAFTS_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(
      COMPOSER_DRAFTS_STORAGE_KEY,
      JSON.stringify(drafts),
    );
  } catch {
    // Ignore storage errors so typing remains usable.
  }
};

interface ChatUiState {
  searchOpen: boolean;
  mediaPanelOpen: boolean;
  composerDraftByConversation: Record<string, string>;
  setSearchOpen: (value: boolean) => void;
  setMediaPanelOpen: (value: boolean) => void;
  setComposerDraft: (conversationId: string, value: string) => void;
  clearComposerDraft: (conversationId: string) => void;
  selectedEndpoint: "company" | "personal";
  setSelectedEndpoint: (endpoint: "company" | "personal") => void;
}

export const useChatUiStore = create<ChatUiState>((set) => ({
  searchOpen: false,
  mediaPanelOpen: false,
  composerDraftByConversation: readComposerDrafts(),
  setSearchOpen: (value) => set({ searchOpen: value }),
  setMediaPanelOpen: (value) => set({ mediaPanelOpen: value }),
  setComposerDraft: (conversationId, value) =>
    set((state) => {
      const currentValue = state.composerDraftByConversation[conversationId] ?? "";
      if (currentValue === value) {
        return state;
      }

      const nextDrafts = { ...state.composerDraftByConversation };
      if (!value) {
        delete nextDrafts[conversationId];
      } else {
        nextDrafts[conversationId] = value;
      }
      persistComposerDrafts(nextDrafts);

      return {
        composerDraftByConversation: nextDrafts,
      };
    }),
  clearComposerDraft: (conversationId) =>
    set((state) => {
      if (!(conversationId in state.composerDraftByConversation)) {
        return state;
      }

      const nextDrafts = { ...state.composerDraftByConversation };
      delete nextDrafts[conversationId];
      persistComposerDrafts(nextDrafts);
      return {
        composerDraftByConversation: nextDrafts,
      };
    }),
  selectedEndpoint: (typeof window !== "undefined" && window.sessionStorage.getItem("chat:selectedEndpoint") as "company" | "personal") || "company",
  setSelectedEndpoint: (endpoint) => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("chat:selectedEndpoint", endpoint);
    }
    set({ selectedEndpoint: endpoint });
  },
}));
