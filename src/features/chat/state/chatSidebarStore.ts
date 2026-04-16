import { create } from "zustand";

export type SidebarConversationFilter = "all" | "unread" | "groups";

interface ChatSidebarState {
  searchQuery: string;
  filter: SidebarConversationFilter;
  setSearchQuery: (value: string) => void;
  setFilter: (value: SidebarConversationFilter) => void;
  reset: () => void;
}

const initialState = {
  searchQuery: "",
  filter: "all" as SidebarConversationFilter,
};

export const useChatSidebarStore = create<ChatSidebarState>((set) => ({
  ...initialState,
  setSearchQuery: (value) => set({ searchQuery: value }),
  setFilter: (value) => set({ filter: value }),
  reset: () => set(initialState),
}));

export default useChatSidebarStore;
