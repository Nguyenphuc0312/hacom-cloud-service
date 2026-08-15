import { create } from "zustand";
import { registerStoreResetter } from "./storeResetRegistry";

const MAX_ENRICHED_PROFILE_NAMES = 400;

/**
 * Stores resolved display names + avatars fetched from /users/{id}.
 * Keyed by userId. Never overwritten by conversation/message API refreshes.
 *
 * Names and avatars share one LRU order (`lruUserIds`): they come from the same
 * profile fetch, so evicting one but keeping the other would leave a user with
 * an avatar and no name (or vice versa) — a half-entry no caller expects.
 */
interface EnrichedProfileState {
  nameByUserId: Record<string, string>;
  avatarByUserId: Record<string, string>;
  lruUserIds: string[];
  setEnrichedName: (userId: string, name: string) => void;
  setEnrichedAvatar: (userId: string, avatarUrl: string) => void;
  clearEnrichedName: (userId: string) => void;
  getEnrichedName: (userId: string) => string | undefined;
  getEnrichedAvatar: (userId: string) => string | undefined;
  clear: () => void;
}

/**
 * Move `userId` to the LRU tail and drop whatever falls off the head, from the
 * name and avatar maps alike.
 */
const touch = (
  state: EnrichedProfileState,
  userId: string,
): {
  order: string[];
  names: Record<string, string>;
  avatars: Record<string, string>;
} => {
  const order = [...state.lruUserIds.filter((id) => id !== userId), userId];
  const names = { ...state.nameByUserId };
  const avatars = { ...state.avatarByUserId };

  while (order.length > MAX_ENRICHED_PROFILE_NAMES) {
    const evictedUserId = order.shift();
    if (evictedUserId) {
      delete names[evictedUserId];
      delete avatars[evictedUserId];
    }
  }

  return { order, names, avatars };
};

/** True when `userId` is already the LRU tail, i.e. `touch` would be a no-op. */
const isAtLruTail = (state: EnrichedProfileState, userId: string): boolean =>
  state.lruUserIds[state.lruUserIds.length - 1] === userId;

export const useEnrichedProfileStore = create<EnrichedProfileState>((set, get) => ({
  nameByUserId: {},
  avatarByUserId: {},
  lruUserIds: [],
  setEnrichedName: (userId, name) =>
    set((state) => {
      if (!userId) return state;

      const { order, names, avatars } = touch(state, userId);
      names[userId] = name;

      if (state.nameByUserId[userId] === name && isAtLruTail(state, userId)) {
        return state;
      }

      return {
        nameByUserId: names,
        avatarByUserId: avatars,
        lruUserIds: order,
      };
    }),
  setEnrichedAvatar: (userId, avatarUrl) =>
    set((state) => {
      if (!userId || !avatarUrl) return state;

      const { order, names, avatars } = touch(state, userId);
      avatars[userId] = avatarUrl;

      if (state.avatarByUserId[userId] === avatarUrl && isAtLruTail(state, userId)) {
        return state;
      }

      return {
        nameByUserId: names,
        avatarByUserId: avatars,
        lruUserIds: order,
      };
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
  getEnrichedAvatar: (userId) => get().avatarByUserId[userId],
  clear: () => set({ nameByUserId: {}, avatarByUserId: {}, lruUserIds: [] }),
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
