import { create } from "zustand";

export type SidebarConversationFilter = "all" | "unread" | "groups";

interface ChatSidebarState {
  searchQuery: string;
  filter: SidebarConversationFilter;
  /** Global-search overlay open state (Zalo-style full search) */
  isSearchOpen: boolean;
  setSearchQuery: (value: string) => void;
  setFilter: (value: SidebarConversationFilter) => void;
  openSearch: () => void;
  closeSearch: () => void;
  reset: () => void;
}

const initialState = {
  searchQuery: "",
  filter: "all" as SidebarConversationFilter,
  isSearchOpen: false,
};

export const useChatSidebarStore = create<ChatSidebarState>((set) => ({
  ...initialState,
  setSearchQuery: (value) => set({ searchQuery: value }),
  setFilter: (value) => set({ filter: value }),
  openSearch: () => set({ isSearchOpen: true }),
  closeSearch: () => set({ isSearchOpen: false, searchQuery: "" }),
  reset: () => set(initialState),
}));

export default useChatSidebarStore;
