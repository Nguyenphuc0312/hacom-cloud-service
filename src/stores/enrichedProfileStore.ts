import { create } from "zustand";

/**
 * Stores resolved display names fetched from /users/{id}.
 * Keyed by userId. Never overwritten by conversation/message API refreshes.
 */
interface EnrichedProfileState {
  nameByUserId: Record<string, string>;
  setEnrichedName: (userId: string, name: string) => void;
  clearEnrichedName: (userId: string) => void;
  getEnrichedName: (userId: string) => string | undefined;
}

export const useEnrichedProfileStore = create<EnrichedProfileState>((set, get) => ({
  nameByUserId: {},
  setEnrichedName: (userId, name) =>
    set((state) =>
      state.nameByUserId[userId] === name
        ? state
        : { nameByUserId: { ...state.nameByUserId, [userId]: name } },
    ),
  clearEnrichedName: (userId) =>
    set((state) => {
      if (!(userId in state.nameByUserId)) return state;
      const next = { ...state.nameByUserId };
      delete next[userId];
      return { nameByUserId: next };
    }),
  getEnrichedName: (userId) => get().nameByUserId[userId],
}));
