import { create } from "zustand";

interface ChatUiState {
  searchOpen: boolean;
  mediaPanelOpen: boolean;
  setSearchOpen: (value: boolean) => void;
  setMediaPanelOpen: (value: boolean) => void;
}

export const useChatUiStore = create<ChatUiState>((set) => ({
  searchOpen: false,
  mediaPanelOpen: false,
  setSearchOpen: (value) => set({ searchOpen: value }),
  setMediaPanelOpen: (value) => set({ mediaPanelOpen: value }),
}));
