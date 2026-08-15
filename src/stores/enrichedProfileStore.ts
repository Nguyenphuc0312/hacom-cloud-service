import { create } from "zustand";
import { registerStoreResetter } from "./storeResetRegistry";

const MAX_ENRICHED_PROFILE_NAMES = 400;

/**
 * How long a cached avatar URL stays usable.
 *
 * Avatar URLs from the API are PRESIGNED storage links with `X-Amz-Expires=900`
 * (15 min) — see `chat-api-service` `user.service.ts#rehydrateCachedAvatar`,
 * which re-signs on every read for exactly this reason. Caching one for the
 * whole session would show the avatar now and a dead 403 link a quarter of an
 * hour later, which is worse than the initials it replaced.
 *
 * Held a minute short of the real TTL so a URL handed out just before the
 * boundary is still valid by the time the browser requests the image.
 */
const AVATAR_URL_TTL_MS = 14 * 60 * 1000;

/** Names never expire; only the presigned avatar URL does. */
interface CachedAvatar {
  url: string;
  fetchedAtMs: number;
}

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
  avatarByUserId: Record<string, CachedAvatar>;
  lruUserIds: string[];
  setEnrichedName: (userId: string, name: string) => void;
  setEnrichedAvatar: (userId: string, avatarUrl: string) => void;
  /** Drop a cached avatar whose signed URL the browser rejected (403). */
  clearEnrichedAvatar: (userId: string) => void;
  clearEnrichedName: (userId: string) => void;
  getEnrichedName: (userId: string) => string | undefined;
  getEnrichedAvatar: (userId: string) => string | undefined;
  clear: () => void;
}

/** The URL if still within the signature TTL, else undefined (treated as absent). */
export const readFreshAvatarUrl = (
  entry: CachedAvatar | undefined,
  nowMs: number = Date.now(),
): string | undefined =>
  entry && nowMs - entry.fetchedAtMs < AVATAR_URL_TTL_MS ? entry.url : undefined;

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
  avatars: Record<string, CachedAvatar>;
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
      const previous = state.avatarByUserId[userId];
      avatars[userId] = { url: avatarUrl, fetchedAtMs: Date.now() };

      // Re-enrich hands back a NEWLY SIGNED url for the same picture, so an
      // identical string is not the only no-op case — the refreshed timestamp
      // is the whole point of the write. Bail out only while the stored url is
      // both identical and still fresh, otherwise the clock never advances and
      // the entry expires for good.
      if (
        previous?.url === avatarUrl &&
        readFreshAvatarUrl(previous) !== undefined &&
        isAtLruTail(state, userId)
      ) {
        return state;
      }

      return {
        nameByUserId: names,
        avatarByUserId: avatars,
        lruUserIds: order,
      };
    }),
  clearEnrichedAvatar: (userId) =>
    set((state) => {
      if (!(userId in state.avatarByUserId)) return state;
      const next = { ...state.avatarByUserId };
      delete next[userId];
      // The LRU entry stays: the name is still valid, and the next enrich
      // refills the avatar under the same key.
      return { avatarByUserId: next };
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
  getEnrichedAvatar: (userId) => readFreshAvatarUrl(get().avatarByUserId[userId]),
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
