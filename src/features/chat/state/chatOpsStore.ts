import { create } from "zustand";

interface ChatOpsState {
  sending: boolean;
  syncing: boolean;
  setSending: (value: boolean) => void;
  setSyncing: (value: boolean) => void;
}

export const useChatOpsStore = create<ChatOpsState>((set) => ({
  sending: false,
  syncing: false,
  setSending: (value) => set({ sending: value }),
  setSyncing: (value) => set({ syncing: value }),
}));
