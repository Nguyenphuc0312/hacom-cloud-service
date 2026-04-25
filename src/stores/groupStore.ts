import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { registerStoreResetter } from "./storeResetRegistry";

export interface InviteLinkItem {
  id: string;
  conversationId: string;
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
  conversationId: string;
  userId: string;
  status: "pending" | "approved" | "rejected";
  note?: string;
  createdAt?: string;
  resolvedAt?: string;
}

interface GroupStoreState {
  slowModeUntilByConversation: Record<string, number>;
  inviteLinksByConversation: Record<string, InviteLinkItem[]>;
  joinRequestsByConversation: Record<string, JoinRequestItem[]>;
  memberListVersionByConversation: Record<string, number>;

  setSlowModeCooldown: (conversationId: string, retryAfterSeconds: number) => void;
  clearSlowModeCooldown: (conversationId: string) => void;
  getSlowModeRemainingSeconds: (conversationId: string) => number;

  upsertInviteLink: (conversationId: string, link: InviteLinkItem) => void;
  setInviteLinks: (conversationId: string, links: InviteLinkItem[]) => void;
  markInviteLinkRevoked: (
    conversationId: string,
    linkId: string,
    revokedAt?: string,
  ) => void;

  upsertJoinRequest: (conversationId: string, request: JoinRequestItem) => void;
  setJoinRequests: (conversationId: string, requests: JoinRequestItem[]) => void;
  markJoinRequestResolved: (
    conversationId: string,
    requestId: string,
    status: "approved" | "rejected",
  ) => void;
  removeJoinRequest: (conversationId: string, requestId: string) => void;
  bumpMemberListVersion: (conversationId: string) => void;
  reset: () => void;
}

const initialState: Pick<
  GroupStoreState,
  | "slowModeUntilByConversation"
  | "inviteLinksByConversation"
  | "joinRequestsByConversation"
  | "memberListVersionByConversation"
> = {
  slowModeUntilByConversation: {},
  inviteLinksByConversation: {},
  joinRequestsByConversation: {},
  memberListVersionByConversation: {},
};

export const useGroupStore = create<GroupStoreState>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    setSlowModeCooldown: (conversationId, retryAfterSeconds) => {
      if (
        !conversationId ||
        !Number.isFinite(retryAfterSeconds) ||
        retryAfterSeconds <= 0
      ) {
        return;
      }

      const until = Date.now() + retryAfterSeconds * 1000;
      set((state) => ({
        slowModeUntilByConversation: {
          ...state.slowModeUntilByConversation,
          [conversationId]: Math.max(
            state.slowModeUntilByConversation[conversationId] || 0,
            until,
          ),
        },
      }));
    },

    clearSlowModeCooldown: (conversationId) => {
      if (!conversationId) return;

      set((state) => {
        const next = { ...state.slowModeUntilByConversation };
        delete next[conversationId];
        return { slowModeUntilByConversation: next };
      });
    },

    getSlowModeRemainingSeconds: (conversationId) => {
      if (!conversationId) return 0;
      const until = get().slowModeUntilByConversation[conversationId] || 0;
      const deltaMs = until - Date.now();
      if (deltaMs <= 0) return 0;
      return Math.ceil(deltaMs / 1000);
    },

    upsertInviteLink: (conversationId, link) => {
      if (!conversationId || !link?.id) return;

      set((state) => {
        const current = state.inviteLinksByConversation[conversationId] || [];
        const existingIdx = current.findIndex((item) => item.id === link.id);
        const nextLinks =
          existingIdx >= 0
            ? current.map((item, idx) => (idx === existingIdx ? { ...item, ...link } : item))
            : [link, ...current];

        return {
          inviteLinksByConversation: {
            ...state.inviteLinksByConversation,
            [conversationId]: nextLinks,
          },
        };
      });
    },

    setInviteLinks: (conversationId, links) => {
      if (!conversationId) return;
      set((state) => ({
        inviteLinksByConversation: {
          ...state.inviteLinksByConversation,
          [conversationId]: Array.isArray(links) ? links : [],
        },
      }));
    },

    markInviteLinkRevoked: (
      conversationId,
      linkId,
      revokedAt = new Date().toISOString(),
    ) => {
      if (!conversationId || !linkId) return;

      set((state) => {
        const current =
          state.inviteLinksByConversation[conversationId] || [];
        const next = current.map((item) =>
          item.id === linkId ? { ...item, revokedAt } : item,
        );
        return {
          inviteLinksByConversation: {
            ...state.inviteLinksByConversation,
            [conversationId]: next,
          },
        };
      });
    },

    upsertJoinRequest: (conversationId, request) => {
      if (!conversationId || !request?.id) return;

      set((state) => {
        const current =
          state.joinRequestsByConversation[conversationId] || [];
        const existingIdx = current.findIndex((item) => item.id === request.id);
        const next =
          existingIdx >= 0
            ? current.map((item, idx) => (idx === existingIdx ? { ...item, ...request } : item))
            : [request, ...current];

        return {
          joinRequestsByConversation: {
            ...state.joinRequestsByConversation,
            [conversationId]: next,
          },
        };
      });
    },

    setJoinRequests: (conversationId, requests) => {
      if (!conversationId) return;
      set((state) => ({
        joinRequestsByConversation: {
          ...state.joinRequestsByConversation,
          [conversationId]: Array.isArray(requests) ? requests : [],
        },
      }));
    },

    markJoinRequestResolved: (conversationId, requestId, status) => {
      if (!conversationId || !requestId) return;

      set((state) => {
        const current =
          state.joinRequestsByConversation[conversationId] || [];
        const next = current.map((item) =>
          item.id === requestId
            ? { ...item, status, resolvedAt: new Date().toISOString() }
            : item,
        );

        return {
          joinRequestsByConversation: {
            ...state.joinRequestsByConversation,
            [conversationId]: next,
          },
        };
      });
    },

    removeJoinRequest: (conversationId, requestId) => {
      if (!conversationId || !requestId) return;
      set((state) => {
        const current =
          state.joinRequestsByConversation[conversationId] || [];
        return {
          joinRequestsByConversation: {
            ...state.joinRequestsByConversation,
            [conversationId]: current.filter((item) => item.id !== requestId),
          },
        };
      });
    },

    bumpMemberListVersion: (conversationId) => {
      if (!conversationId) return;
      set((state) => ({
        memberListVersionByConversation: {
          ...state.memberListVersionByConversation,
          [conversationId]:
            (state.memberListVersionByConversation[conversationId] || 0) + 1,
        },
      }));
    },

    reset: () => set(initialState),
  })),
);

registerStoreResetter("group", () => {
  useGroupStore.getState().reset();
});

export default useGroupStore;
