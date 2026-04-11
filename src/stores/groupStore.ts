import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

export interface InviteLinkItem {
  id: string;
  roomId: string;
  name?: string;
  inviteUrl?: string;
  token?: string;
  tokenPreview?: string;
  usageCount?: number;
  usageLimit?: number | null;
  expireAt?: string | null;
  revokedAt?: string | null;
  createdAt?: string;
}

export interface JoinRequestItem {
  id: string;
  roomId: string;
  userId: string;
  status: "pending" | "approved" | "rejected";
  note?: string;
  createdAt?: string;
  resolvedAt?: string;
}

interface GroupStoreState {
  slowModeUntilByRoom: Record<string, number>;
  inviteLinksByRoom: Record<string, InviteLinkItem[]>;
  joinRequestsByRoom: Record<string, JoinRequestItem[]>;

  setSlowModeCooldown: (roomId: string, retryAfterSeconds: number) => void;
  clearSlowModeCooldown: (roomId: string) => void;
  getSlowModeRemainingSeconds: (roomId: string) => number;

  upsertInviteLink: (roomId: string, link: InviteLinkItem) => void;
  setInviteLinks: (roomId: string, links: InviteLinkItem[]) => void;
  markInviteLinkRevoked: (roomId: string, linkId: string, revokedAt?: string) => void;

  upsertJoinRequest: (roomId: string, request: JoinRequestItem) => void;
  setJoinRequests: (roomId: string, requests: JoinRequestItem[]) => void;
  markJoinRequestResolved: (
    roomId: string,
    requestId: string,
    status: "approved" | "rejected",
  ) => void;
  removeJoinRequest: (roomId: string, requestId: string) => void;
  reset: () => void;
}

const initialState: Pick<
  GroupStoreState,
  "slowModeUntilByRoom" | "inviteLinksByRoom" | "joinRequestsByRoom"
> = {
  slowModeUntilByRoom: {},
  inviteLinksByRoom: {},
  joinRequestsByRoom: {},
};

export const useGroupStore = create<GroupStoreState>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    setSlowModeCooldown: (roomId, retryAfterSeconds) => {
      if (!roomId || !Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
        return;
      }

      const until = Date.now() + retryAfterSeconds * 1000;
      set((state) => ({
        slowModeUntilByRoom: {
          ...state.slowModeUntilByRoom,
          [roomId]: Math.max(state.slowModeUntilByRoom[roomId] || 0, until),
        },
      }));
    },

    clearSlowModeCooldown: (roomId) => {
      if (!roomId) return;

      set((state) => {
        const next = { ...state.slowModeUntilByRoom };
        delete next[roomId];
        return { slowModeUntilByRoom: next };
      });
    },

    getSlowModeRemainingSeconds: (roomId) => {
      if (!roomId) return 0;
      const until = get().slowModeUntilByRoom[roomId] || 0;
      const deltaMs = until - Date.now();
      if (deltaMs <= 0) return 0;
      return Math.ceil(deltaMs / 1000);
    },

    upsertInviteLink: (roomId, link) => {
      if (!roomId || !link?.id) return;

      set((state) => {
        const current = state.inviteLinksByRoom[roomId] || [];
        const existingIdx = current.findIndex((item) => item.id === link.id);
        const nextLinks =
          existingIdx >= 0
            ? current.map((item, idx) => (idx === existingIdx ? { ...item, ...link } : item))
            : [link, ...current];

        return {
          inviteLinksByRoom: {
            ...state.inviteLinksByRoom,
            [roomId]: nextLinks,
          },
        };
      });
    },

    setInviteLinks: (roomId, links) => {
      if (!roomId) return;
      set((state) => ({
        inviteLinksByRoom: {
          ...state.inviteLinksByRoom,
          [roomId]: Array.isArray(links) ? links : [],
        },
      }));
    },

    markInviteLinkRevoked: (roomId, linkId, revokedAt = new Date().toISOString()) => {
      if (!roomId || !linkId) return;

      set((state) => {
        const current = state.inviteLinksByRoom[roomId] || [];
        const next = current.map((item) =>
          item.id === linkId ? { ...item, revokedAt } : item,
        );
        return {
          inviteLinksByRoom: {
            ...state.inviteLinksByRoom,
            [roomId]: next,
          },
        };
      });
    },

    upsertJoinRequest: (roomId, request) => {
      if (!roomId || !request?.id) return;

      set((state) => {
        const current = state.joinRequestsByRoom[roomId] || [];
        const existingIdx = current.findIndex((item) => item.id === request.id);
        const next =
          existingIdx >= 0
            ? current.map((item, idx) => (idx === existingIdx ? { ...item, ...request } : item))
            : [request, ...current];

        return {
          joinRequestsByRoom: {
            ...state.joinRequestsByRoom,
            [roomId]: next,
          },
        };
      });
    },

    setJoinRequests: (roomId, requests) => {
      if (!roomId) return;
      set((state) => ({
        joinRequestsByRoom: {
          ...state.joinRequestsByRoom,
          [roomId]: Array.isArray(requests) ? requests : [],
        },
      }));
    },

    markJoinRequestResolved: (roomId, requestId, status) => {
      if (!roomId || !requestId) return;

      set((state) => {
        const current = state.joinRequestsByRoom[roomId] || [];
        const next = current.map((item) =>
          item.id === requestId
            ? { ...item, status, resolvedAt: new Date().toISOString() }
            : item,
        );

        return {
          joinRequestsByRoom: {
            ...state.joinRequestsByRoom,
            [roomId]: next,
          },
        };
      });
    },

    removeJoinRequest: (roomId, requestId) => {
      if (!roomId || !requestId) return;
      set((state) => {
        const current = state.joinRequestsByRoom[roomId] || [];
        return {
          joinRequestsByRoom: {
            ...state.joinRequestsByRoom,
            [roomId]: current.filter((item) => item.id !== requestId),
          },
        };
      });
    },

    reset: () => set(initialState),
  })),
);

export default useGroupStore;
