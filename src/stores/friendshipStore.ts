import { create } from "zustand";
import type {
  FriendshipActionResult,
  FriendshipActorRole,
  FriendshipCapabilitiesDto,
  FriendshipRelationDto,
  FriendshipStatus,
} from "@hacom/chat-shared-types/chat";
import { friendshipApi } from "../services/api";
import { unwrapApiSuccess } from "../lib/apiContract";
import type { User } from "./authStore";
import type {
  FriendshipRealtimeDetail,
  FriendshipResyncReason,
} from "../features/chat/realtime/friendshipRealtime";

export type FriendshipStatusType = FriendshipRelationDto["status"];

export interface FriendRequest {
  relationId: string;
  createdAt: string;
  updatedAt: string;
  requester: User;
  addressee: User;
  friend: User | null;
  status: FriendshipStatusType;
  actorRole: FriendshipActorRole;
  capabilities: FriendshipCapabilitiesDto;
  actionResult: FriendshipActionResult;
}

export interface FriendRecord extends User {
  relationId: string;
  capabilities: FriendshipCapabilitiesDto;
  actorRole: FriendshipActorRole;
  relationStatus: FriendshipStatusType;
  actionResult: FriendshipActionResult;
  createdAt: string;
  updatedAt: string;
}

export interface BlockedUser extends User {
  relationId: string;
  capabilities: FriendshipCapabilitiesDto;
  actorRole: FriendshipActorRole;
  relationStatus: FriendshipStatusType;
  actionResult: FriendshipActionResult;
  createdAt: string;
  updatedAt: string;
}

export const EMPTY_CAPABILITIES: FriendshipCapabilitiesDto = {
  canSendRequest: false,
  canAccept: false,
  canDecline: false,
  canCancel: false,
  canUnfriend: false,
  canBlock: false,
  canUnblock: false,
  canMessage: false,
};

export const NONE_RELATION_CAPABILITIES: FriendshipCapabilitiesDto = {
  ...EMPTY_CAPABILITIES,
  canSendRequest: true,
  canBlock: true,
};

export type RelationshipState =
  | { kind: "self"; capabilities: FriendshipCapabilitiesDto }
  | { kind: "not_friend"; capabilities: FriendshipCapabilitiesDto }
  | {
      kind: "outgoing_request";
      requestId: string;
      capabilities: FriendshipCapabilitiesDto;
    }
  | {
      kind: "incoming_request";
      requestId: string;
      capabilities: FriendshipCapabilitiesDto;
    }
  | {
      kind: "friend";
      friendshipId: string;
      capabilities: FriendshipCapabilitiesDto;
    }
  | {
      kind: "blocked";
      friendshipId: string;
      capabilities: FriendshipCapabilitiesDto;
    };

export interface FriendshipDirectorySnapshot {
  friends: FriendRecord[];
  incomingRequests: FriendRequest[];
  sentRequests: FriendRequest[];
  blockedUsers: BlockedUser[];
  pendingCount: number;
}

interface DeriveRelationshipStateInput {
  userId: string;
  currentUserId?: string | null;
  blockedUsers: BlockedUser[];
  friends: FriendRecord[];
  incomingRequests: FriendRequest[];
  sentRequests: FriendRequest[];
}

interface ActionMetric {
  successCount: number;
  rollbackCount: number;
  failureCount: number;
  lastLatencyMs: number;
  lastStatus: "success" | "rollback" | "failure";
}

interface FriendshipStoreState {
  friends: FriendRecord[];
  incomingRequests: FriendRequest[];
  sentRequests: FriendRequest[];
  blockedUsers: BlockedUser[];
  pendingCount: number;

  friendByUserId: Record<string, FriendRecord>;
  incomingByRelationId: Record<string, FriendRequest>;
  sentByRelationId: Record<string, FriendRequest>;
  blockedByUserId: Record<string, BlockedUser>;

  isFriendsLoading: boolean;
  isIncomingLoading: boolean;
  isSentLoading: boolean;
  isBlockedLoading: boolean;
  isDirectoryRefreshing: boolean;
  hasHydrated: boolean;
  lastSyncedAt: string | null;

  actionPendingByKey: Record<string, boolean>;
  actionMetricsByKey: Record<string, ActionMetric>;
  resyncTriggeredCount: number;
  uiInconsistencyCount: number;
  lastResyncReason: FriendshipResyncReason | null;

  setActionPending: (key: string, pending: boolean) => void;
  isActionPending: (key: string) => boolean;
  recordActionResult: (
    key: string,
    status: "success" | "rollback" | "failure",
    latencyMs: number,
  ) => void;
  markUiInconsistency: (reason: string) => void;

  createSnapshot: () => FriendshipDirectorySnapshot;
  applySnapshot: (snapshot: FriendshipDirectorySnapshot) => void;
  restoreSnapshot: (snapshot: FriendshipDirectorySnapshot) => void;

  applyRelation: (relation: FriendshipRelationDto) => void;
  applyRealtimeDetail: (detail: FriendshipRealtimeDetail) => void;

  fetchFriends: () => Promise<void>;
  fetchIncomingRequests: () => Promise<void>;
  fetchSentRequests: () => Promise<void>;
  fetchBlockedUsers: () => Promise<void>;
  fetchPendingCount: () => Promise<void>;

  refreshDirectory: (options?: {
    reason?: FriendshipResyncReason;
    includeFullSnapshot?: boolean;
  }) => Promise<void>;
  triggerResync: (reason: FriendshipResyncReason) => void;
}

const RESYNC_STALE_MS = 60_000;
let scheduledResyncTimer: ReturnType<typeof setTimeout> | null = null;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;

const asRelationDto = (value: unknown): FriendshipRelationDto | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  if (
    typeof record.relationId === "string" &&
    typeof record.status === "string" &&
    record.requester !== null &&
    record.addressee !== null
  ) {
    return record as unknown as FriendshipRelationDto;
  }

  return null;
};

export const extractWriteRelation = (
  payload: unknown,
): FriendshipRelationDto | null => {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  const direct = asRelationDto(record.friendship);
  if (direct) {
    return direct;
  }

  const nested = asRecord(record.data);
  const nestedRelation = nested ? asRelationDto(nested.friendship) : null;
  if (nestedRelation) {
    return nestedRelation;
  }

  return asRelationDto(payload);
};

const isRelationArrayPayload = (
  payload: unknown,
): payload is FriendshipRelationDto[] => {
  return Array.isArray(payload);
};

const asRelations = (payload: unknown): FriendshipRelationDto[] => {
  if (isRelationArrayPayload(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.data)) {
    return record.data as FriendshipRelationDto[];
  }

  if (
    record.data &&
    typeof record.data === "object" &&
    Array.isArray((record.data as Record<string, unknown>).data)
  ) {
    return (record.data as Record<string, unknown>)
      .data as FriendshipRelationDto[];
  }

  return [];
};

export const toFriendshipUser = (
  user:
    | FriendshipRelationDto["requester"]
    | FriendshipRelationDto["friend"]
    | null,
): User | null => {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    firstName: user.displayName ?? undefined,
    lastName: undefined,
    avatar: user.avatarUrl ?? undefined,
    status: "offline",
  };
};

const toFriendRecord = (
  relation: FriendshipRelationDto,
): FriendRecord | null => {
  const friend = toFriendshipUser(relation.friend);
  if (!friend) {
    return null;
  }

  return {
    ...friend,
    relationId: relation.relationId,
    capabilities: relation.capabilities,
    actorRole: relation.actorRole,
    relationStatus: relation.status,
    actionResult: relation.actionResult,
    createdAt: relation.createdAt,
    updatedAt: relation.updatedAt,
  };
};

const toRequestRecord = (
  relation: FriendshipRelationDto,
): FriendRequest | null => {
  const requester = toFriendshipUser(relation.requester);
  const addressee = toFriendshipUser(relation.addressee);

  if (!requester || !addressee) {
    return null;
  }

  return {
    relationId: relation.relationId,
    createdAt: relation.createdAt,
    updatedAt: relation.updatedAt,
    requester,
    addressee,
    friend: toFriendshipUser(relation.friend),
    status: relation.status,
    actorRole: relation.actorRole,
    capabilities: relation.capabilities,
    actionResult: relation.actionResult,
  };
};

const toBlockedRecord = (
  relation: FriendshipRelationDto,
): BlockedUser | null => {
  const friend = toFriendshipUser(relation.friend);
  if (!friend) {
    return null;
  }

  return {
    ...friend,
    relationId: relation.relationId,
    capabilities: relation.capabilities,
    actorRole: relation.actorRole,
    relationStatus: relation.status,
    actionResult: relation.actionResult,
    createdAt: relation.createdAt,
    updatedAt: relation.updatedAt,
  };
};

export const mapRelationToFriendRecord = toFriendRecord;
export const mapRelationToRequestRecord = toRequestRecord;
export const mapRelationToBlockedRecord = toBlockedRecord;

export const removeByRelationId = <T extends { relationId: string }>(
  rows: T[],
  relationId: string,
): T[] => rows.filter((item) => item.relationId !== relationId);

export const upsertFront = <T extends { relationId: string }>(
  rows: T[],
  nextRow: T,
): T[] => [nextRow, ...removeByRelationId(rows, nextRow.relationId)];

const sortByUpdatedAtDesc = <T extends { updatedAt: string }>(
  rows: T[],
): T[] => {
  return [...rows].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
};

export const applyRelationToSnapshot = (
  snapshot: FriendshipDirectorySnapshot,
  relation: FriendshipRelationDto,
): FriendshipDirectorySnapshot => {
  const next: FriendshipDirectorySnapshot = {
    friends: removeByRelationId(snapshot.friends, relation.relationId),
    incomingRequests: removeByRelationId(
      snapshot.incomingRequests,
      relation.relationId,
    ),
    sentRequests: removeByRelationId(
      snapshot.sentRequests,
      relation.relationId,
    ),
    blockedUsers: removeByRelationId(
      snapshot.blockedUsers,
      relation.relationId,
    ),
    pendingCount: snapshot.pendingCount,
  };

  if (relation.status === "accepted") {
    const friend = toFriendRecord(relation);
    if (friend) {
      next.friends = upsertFront(next.friends, friend);
    }
  }

  if (relation.status === "blocked") {
    const blocked = toBlockedRecord(relation);
    if (blocked) {
      next.blockedUsers = upsertFront(next.blockedUsers, blocked);
    }
  }

  if (relation.status === "pending") {
    const request = toRequestRecord(relation);
    if (request) {
      if (relation.actorRole === "addressee") {
        next.incomingRequests = upsertFront(next.incomingRequests, request);
      }
      if (relation.actorRole === "requester") {
        next.sentRequests = upsertFront(next.sentRequests, request);
      }
    }
  }

  next.pendingCount = next.incomingRequests.length;
  return next;
};

export const deriveRelationshipState = (
  input: DeriveRelationshipStateInput,
): RelationshipState => {
  const {
    userId,
    currentUserId,
    blockedUsers,
    friends,
    incomingRequests,
    sentRequests,
  } = input;

  if (currentUserId && userId === currentUserId) {
    return { kind: "self", capabilities: EMPTY_CAPABILITIES };
  }

  const blocked = blockedUsers.find((item) => item.id === userId);
  if (blocked) {
    return {
      kind: "blocked",
      friendshipId: blocked.relationId,
      capabilities: blocked.capabilities,
    };
  }

  const friend = friends.find((item) => item.id === userId);
  if (friend) {
    return {
      kind: "friend",
      friendshipId: friend.relationId,
      capabilities: friend.capabilities,
    };
  }

  const incoming = incomingRequests.find(
    (item) => item.requester.id === userId,
  );
  if (incoming) {
    return {
      kind: "incoming_request",
      requestId: incoming.relationId,
      capabilities: incoming.capabilities,
    };
  }

  const outgoing = sentRequests.find((item) => item.addressee.id === userId);
  if (outgoing) {
    return {
      kind: "outgoing_request",
      requestId: outgoing.relationId,
      capabilities: outgoing.capabilities,
    };
  }

  return { kind: "not_friend", capabilities: NONE_RELATION_CAPABILITIES };
};

const initialSnapshot: FriendshipDirectorySnapshot = {
  friends: [],
  incomingRequests: [],
  sentRequests: [],
  blockedUsers: [],
  pendingCount: 0,
};

const toIndexedFields = (snapshot: FriendshipDirectorySnapshot) => ({
  friendByUserId: snapshot.friends.reduce<Record<string, FriendRecord>>(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {},
  ),
  incomingByRelationId: snapshot.incomingRequests.reduce<
    Record<string, FriendRequest>
  >((acc, item) => {
    acc[item.relationId] = item;
    return acc;
  }, {}),
  sentByRelationId: snapshot.sentRequests.reduce<Record<string, FriendRequest>>(
    (acc, item) => {
      acc[item.relationId] = item;
      return acc;
    },
    {},
  ),
  blockedByUserId: snapshot.blockedUsers.reduce<Record<string, BlockedUser>>(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {},
  ),
});

const normalizeSnapshot = (
  snapshot: FriendshipDirectorySnapshot,
): FriendshipDirectorySnapshot => {
  return {
    friends: sortByUpdatedAtDesc(snapshot.friends),
    incomingRequests: sortByUpdatedAtDesc(snapshot.incomingRequests),
    sentRequests: sortByUpdatedAtDesc(snapshot.sentRequests),
    blockedUsers: sortByUpdatedAtDesc(snapshot.blockedUsers),
    pendingCount: snapshot.pendingCount,
  };
};

const currentSnapshot = (
  state: FriendshipStoreState,
): FriendshipDirectorySnapshot => ({
  friends: state.friends,
  incomingRequests: state.incomingRequests,
  sentRequests: state.sentRequests,
  blockedUsers: state.blockedUsers,
  pendingCount: state.pendingCount,
});

const isSnapshotStale = (timestamp: string | null): boolean => {
  if (!timestamp) {
    return true;
  }

  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return true;
  }

  return Date.now() - parsed >= RESYNC_STALE_MS;
};

const nowIso = () => new Date().toISOString();

const logFriendshipMetric = (
  event: string,
  payload: Record<string, unknown>,
): void => {
  console.info(`[friendship-metric] ${event}`, payload);
};

export const useFriendshipStore = create<FriendshipStoreState>((set, get) => ({
  ...initialSnapshot,
  ...toIndexedFields(initialSnapshot),

  isFriendsLoading: false,
  isIncomingLoading: false,
  isSentLoading: false,
  isBlockedLoading: false,
  isDirectoryRefreshing: false,
  hasHydrated: false,
  lastSyncedAt: null,

  actionPendingByKey: {},
  actionMetricsByKey: {},
  resyncTriggeredCount: 0,
  uiInconsistencyCount: 0,
  lastResyncReason: null,

  setActionPending: (key, pending) => {
    set((state) => ({
      actionPendingByKey: {
        ...state.actionPendingByKey,
        [key]: pending,
      },
    }));
  },

  isActionPending: (key) => Boolean(get().actionPendingByKey[key]),

  recordActionResult: (key, status, latencyMs) => {
    set((state) => {
      const previous = state.actionMetricsByKey[key] ?? {
        successCount: 0,
        rollbackCount: 0,
        failureCount: 0,
        lastLatencyMs: 0,
        lastStatus: status,
      };

      const next: ActionMetric = {
        ...previous,
        successCount:
          status === "success"
            ? previous.successCount + 1
            : previous.successCount,
        rollbackCount:
          status === "rollback"
            ? previous.rollbackCount + 1
            : previous.rollbackCount,
        failureCount:
          status === "failure"
            ? previous.failureCount + 1
            : previous.failureCount,
        lastLatencyMs: Number.isFinite(latencyMs)
          ? latencyMs
          : previous.lastLatencyMs,
        lastStatus: status,
      };

      return {
        actionMetricsByKey: {
          ...state.actionMetricsByKey,
          [key]: next,
        },
      };
    });

    logFriendshipMetric("friendship_action", {
      key,
      status,
      latencyMs,
    });
  },

  markUiInconsistency: (reason) => {
    set((state) => ({
      uiInconsistencyCount: state.uiInconsistencyCount + 1,
    }));

    logFriendshipMetric("ui_inconsistency_detected", { reason });
  },

  createSnapshot: () => currentSnapshot(get()),

  applySnapshot: (snapshot) => {
    const normalized = normalizeSnapshot(snapshot);
    set(() => ({
      ...normalized,
      ...toIndexedFields(normalized),
    }));
  },

  restoreSnapshot: (snapshot) => {
    const normalized = normalizeSnapshot(snapshot);
    set(() => ({
      ...normalized,
      ...toIndexedFields(normalized),
    }));
  },

  applyRelation: (relation) => {
    const nextSnapshot = applyRelationToSnapshot(
      currentSnapshot(get()),
      relation,
    );
    const normalized = normalizeSnapshot(nextSnapshot);
    set(() => ({
      ...normalized,
      ...toIndexedFields(normalized),
      hasHydrated: true,
      lastSyncedAt: nowIso(),
    }));
  },

  applyRealtimeDetail: (detail) => {
    if (!detail.relation) {
      get().markUiInconsistency(`missing_relation:${detail.eventType}`);
      get().triggerResync("missing_relation_payload");
      return;
    }

    get().applyRelation(detail.relation);
    logFriendshipMetric("friendship_realtime_event", {
      eventType: detail.eventType,
      status: detail.status,
      relationId: detail.relation.relationId,
    });
  },

  fetchFriends: async () => {
    set({ isFriendsLoading: true });
    try {
      const response = await friendshipApi.getFriends();
      const payload = unwrapApiSuccess(response);
      const list = asRelations(payload)
        .map((relation) => toFriendRecord(relation))
        .filter((item): item is FriendRecord => item !== null);

      set((state) => {
        const next = normalizeSnapshot({
          ...currentSnapshot(state),
          friends: list,
        });

        return {
          ...next,
          ...toIndexedFields(next),
        };
      });
    } catch {
      set((state) => {
        const next = normalizeSnapshot({
          ...currentSnapshot(state),
          friends: [],
        });

        return {
          ...next,
          ...toIndexedFields(next),
        };
      });
    } finally {
      set({ isFriendsLoading: false });
    }
  },

  fetchIncomingRequests: async () => {
    set({ isIncomingLoading: true });
    try {
      const response = await friendshipApi.getPendingRequests();
      const payload = unwrapApiSuccess(response);
      const list = asRelations(payload)
        .map((relation) => toRequestRecord(relation))
        .filter((item): item is FriendRequest => item !== null);

      set((state) => {
        const next = normalizeSnapshot({
          ...currentSnapshot(state),
          incomingRequests: list,
          pendingCount: list.length,
        });

        return {
          ...next,
          ...toIndexedFields(next),
        };
      });
    } catch {
      set((state) => {
        const next = normalizeSnapshot({
          ...currentSnapshot(state),
          incomingRequests: [],
          pendingCount: 0,
        });

        return {
          ...next,
          ...toIndexedFields(next),
        };
      });
    } finally {
      set({ isIncomingLoading: false });
    }
  },

  fetchSentRequests: async () => {
    set({ isSentLoading: true });
    try {
      const response = await friendshipApi.getSentRequests();
      const payload = unwrapApiSuccess(response);
      const list = asRelations(payload)
        .map((relation) => toRequestRecord(relation))
        .filter((item): item is FriendRequest => item !== null);

      set((state) => {
        const next = normalizeSnapshot({
          ...currentSnapshot(state),
          sentRequests: list,
        });

        return {
          ...next,
          ...toIndexedFields(next),
        };
      });
    } catch {
      set((state) => {
        const next = normalizeSnapshot({
          ...currentSnapshot(state),
          sentRequests: [],
        });

        return {
          ...next,
          ...toIndexedFields(next),
        };
      });
    } finally {
      set({ isSentLoading: false });
    }
  },

  fetchBlockedUsers: async () => {
    set({ isBlockedLoading: true });
    try {
      const response = await friendshipApi.getBlockedUsers();
      const payload = unwrapApiSuccess(response);
      const list = asRelations(payload)
        .map((relation) => toBlockedRecord(relation))
        .filter((item): item is BlockedUser => item !== null);

      set((state) => {
        const next = normalizeSnapshot({
          ...currentSnapshot(state),
          blockedUsers: list,
        });

        return {
          ...next,
          ...toIndexedFields(next),
        };
      });
    } catch {
      set((state) => {
        const next = normalizeSnapshot({
          ...currentSnapshot(state),
          blockedUsers: [],
        });

        return {
          ...next,
          ...toIndexedFields(next),
        };
      });
    } finally {
      set({ isBlockedLoading: false });
    }
  },

  fetchPendingCount: async () => {
    try {
      const response = await friendshipApi.getPendingCount();
      const payload = unwrapApiSuccess(response);
      const count =
        payload &&
        typeof payload === "object" &&
        typeof (payload as { count?: unknown }).count === "number"
          ? (payload as { count: number }).count
          : 0;

      set((state) => ({
        pendingCount:
          state.incomingRequests.length > 0
            ? state.incomingRequests.length
            : count,
      }));
    } catch {
      // keep last known count on network failure
    }
  },

  refreshDirectory: async (options) => {
    if (get().isDirectoryRefreshing) {
      return;
    }

    const includeFullSnapshot = options?.includeFullSnapshot ?? true;
    set({ isDirectoryRefreshing: true });

    try {
      const tasks: Array<Promise<void>> = [
        get().fetchIncomingRequests(),
        get().fetchSentRequests(),
        get().fetchPendingCount(),
      ];

      if (includeFullSnapshot) {
        tasks.push(get().fetchFriends(), get().fetchBlockedUsers());
      }

      await Promise.all(tasks);
      set({
        hasHydrated: true,
        lastSyncedAt: nowIso(),
      });
    } finally {
      set({ isDirectoryRefreshing: false });
    }
  },

  triggerResync: (reason) => {
    if (scheduledResyncTimer) {
      clearTimeout(scheduledResyncTimer);
    }

    set((state) => ({
      resyncTriggeredCount: state.resyncTriggeredCount + 1,
      lastResyncReason: reason,
    }));

    const delayMs = reason === "socket_reconnect" ? 120 : 180;

    scheduledResyncTimer = setTimeout(() => {
      scheduledResyncTimer = null;

      const state = get();
      const includeFullSnapshot =
        reason !== "socket_reconnect"
          ? true
          : !state.hasHydrated || isSnapshotStale(state.lastSyncedAt);

      void state.refreshDirectory({
        reason,
        includeFullSnapshot,
      });
    }, delayMs);
  },
}));

export const selectFriendshipState = (state: FriendshipStoreState) => ({
  friends: state.friends,
  incomingRequests: state.incomingRequests,
  sentRequests: state.sentRequests,
  blockedUsers: state.blockedUsers,
  pendingCount: state.pendingCount,
  isFriendsLoading: state.isFriendsLoading,
  isIncomingLoading: state.isIncomingLoading,
  isSentLoading: state.isSentLoading,
  isBlockedLoading: state.isBlockedLoading,
  hasHydrated: state.hasHydrated,
});

export const asFriendshipStatus = (
  status: FriendshipStatusType,
): FriendshipStatus => {
  return status as FriendshipStatus;
};
