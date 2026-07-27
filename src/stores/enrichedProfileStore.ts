import { create } from "zustand";
import { registerStoreResetter } from "./storeResetRegistry";

const MAX_ENRICHED_PROFILE_NAMES = 400;

/**
 * Stores resolved display names fetched from /users/{id}.
 * Keyed by userId. Never overwritten by conversation/message API refreshes.
 */
interface EnrichedProfileState {
  nameByUserId: Record<string, string>;
  lruUserIds: string[];
  setEnrichedName: (userId: string, name: string) => void;
  clearEnrichedName: (userId: string) => void;
  getEnrichedName: (userId: string) => string | undefined;
  clear: () => void;
}

export const useEnrichedProfileStore = create<EnrichedProfileState>((set, get) => ({
  nameByUserId: {},
  lruUserIds: [],
  setEnrichedName: (userId, name) =>
    set((state) => {
      if (!userId) return state;

      const nextOrder = [
        ...state.lruUserIds.filter((id) => id !== userId),
        userId,
      ];
      const nextNames = { ...state.nameByUserId, [userId]: name };

      while (nextOrder.length > MAX_ENRICHED_PROFILE_NAMES) {
        const evictedUserId = nextOrder.shift();
        if (evictedUserId) {
          delete nextNames[evictedUserId];
        }
      }

      if (
        state.nameByUserId[userId] === name &&
        state.lruUserIds.length === nextOrder.length &&
        state.lruUserIds[state.lruUserIds.length - 1] === userId
      ) {
        return state;
      }

      return { nameByUserId: nextNames, lruUserIds: nextOrder };
    }),
  clearEnrichedName: (userId) =>
    set((state) => {
      if (!(userId in state.nameByUserId)) return state;
      const next = { ...state.nameByUserId };
      delete next[userId];
      return {
        nameByUserId: next,
        lruUserIds: state.lruUserIds.filter((id) => id !== userId),
      };
    }),
  getEnrichedName: (userId) => get().nameByUserId[userId],
  clear: () => set({ nameByUserId: {}, lruUserIds: [] }),
}));

registerStoreResetter("enriched-profile", () => {
  useEnrichedProfileStore.getState().clear();
});

/**
 * Resolve a user's shown name with the "tên gợi nhớ" (alias) rule: the enriched
 * name (alias-if-set, else real name) wins, else the caller's fallback.
 *
 * Prefer `useResolvedDisplayName` from `useResolvedDisplayName.ts` — it also
 * reads the authoritative alias out of `friendshipStore`. This hook only sees
 * `nameByUserId`, which races `enrichUserProfile`.
 */
export function useResolvedName(userId: string | undefined, fallback: string): string {
  const enriched = useEnrichedProfileStore((s) =>
    userId ? s.nameByUserId[userId] : undefined,
  );
  return enriched || fallback;
}
