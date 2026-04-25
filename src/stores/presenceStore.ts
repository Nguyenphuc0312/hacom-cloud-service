/**
 * @fileoverview Presence Store (Zustand)
 * Tracks online/offline/last_seen for other users.
 * Data flows from WebSocket presence:update / presence:snapshot events.
 */

import { create } from "zustand";
import { registerStoreResetter } from "./storeResetRegistry";

// ============================================
// Types
// ============================================

export type PresenceState =
  | "online"
  | "offline"
  | "away"
  | "idle"
  | "dnd"
  | "busy";

export interface UserPresenceInfo {
  userId: string;
  state: PresenceState;
  lastSeenAt?: string; // ISO-8601
  updatedAt: string; // ISO-8601
  username?: string;
}

interface PresenceStoreState {
  /** Map of userId → presence info */
  presenceMap: Record<string, UserPresenceInfo>;

  /** Set a single user's presence */
  setPresence: (info: UserPresenceInfo) => void;

  /** Set presence for multiple users (snapshot) */
  setPresenceBatch: (items: UserPresenceInfo[]) => void;

  /** Get presence for a user (returns offline if unknown) */
  getPresence: (userId: string) => UserPresenceInfo;

  /** Check if a user is online */
  isOnline: (userId: string) => boolean;

  /** Clear all presence data (e.g., on logout) */
  clearAll: () => void;
}

// ============================================
// Store
// ============================================

export const usePresenceStore = create<PresenceStoreState>((set, get) => ({
  presenceMap: {},

  setPresence: (info) =>
    set((state) => ({
      presenceMap: {
        ...state.presenceMap,
        [info.userId]: info,
      },
    })),

  setPresenceBatch: (items) =>
    set((state) => {
      const updated = { ...state.presenceMap };
      for (const item of items) {
        updated[item.userId] = item;
      }
      return { presenceMap: updated };
    }),

  getPresence: (userId) => {
    const info = get().presenceMap[userId];
    if (info) return info;
    return {
      userId,
      state: "offline" as const,
      updatedAt: new Date().toISOString(),
    };
  },

  isOnline: (userId) => {
    const info = get().presenceMap[userId];
    if (!info) return false;
    return (
      info.state === "online" ||
      info.state === "away" ||
      info.state === "idle" ||
      info.state === "dnd" ||
      info.state === "busy"
    );
  },

  clearAll: () => set({ presenceMap: {} }),
}));

registerStoreResetter("presence", () => {
  usePresenceStore.getState().clearAll();
});
