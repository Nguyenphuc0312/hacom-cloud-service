import { create } from "zustand";
import type {
  FriendshipActionResult,
  FriendshipActorRole,
  FriendshipCapabilitiesDto,
  FriendshipRelationDto,
  FriendshipStatus,
} from "@hacom/chat-shared-types/chat";
import { FRIENDS_PAGE_SIZE, friendshipApi } from "../services/api";
import { unwrapApiSuccess } from "../lib/apiContract";
import type { User } from "./authStore";
import type {
  FriendshipRealtimeDetail,
  FriendshipResyncReason,
} from "../features/chat/realtime/friendshipRealtime";
import { logger } from "../utils/logger";
import { useEnrichedProfileStore } from "./enrichedProfileStore";

// ponytail: localStorage shim until BE ships alias column; remove after shared-types bump
const ALIAS_KEY = "hc:contact-aliases";
const _loadAliases = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(ALIAS_KEY) ?? "{}"); } catch { return {}; }
};
const _saveAlias = (userId: string, alias: string | null) => {
  const map = _loadAliases();
  if (alias) map[userId] = alias; else delete map[userId];
  localStorage.setItem(ALIAS_KEY, JSON.stringify(map));
};

export type FriendshipStatusType = FriendshipRelationDto["status"];

export interface FriendRequest {
  relationId: string;
  pairKey: string | null;
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
  alias?: string | null;
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
;

export interface FriendshipDirectorySnapshot {
  friends: FriendRecord[];
  incomingRequests: FriendRequest[];
  sentRequests: FriendRequest[];
  pendingCount: number;
  sentCount: number;
}

interface DeriveRelationshipStateInput {
  userId: string;
  currentUserId?: string | null;
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
  friendsTotal: number;
  friendsPage: number;
  friendsLimit: number;
  friendsHasNext: boolean;
  friendsError: string | null;
  friendsLoadMoreError: string | null;
  incomingRequests: FriendRequest[];
  sentRequests: FriendRequest[];
  pendingCount: number;
  sentCount: number;

  friendByUserId: Record<string, FriendRecord>;
  incomingByRelationId: Record<string, FriendRequest>;
  sentByRelationId: Record<string, FriendRequest>;

  isFriendsLoading: boolean;
  isFriendsLoadingMore: boolean;
  isIncomingLoading: boolean;
  isSentLoading: boolean;
  isDirectoryRefreshing: boolean;
  hasHydrated: boolean;
  lastSyncedAt: string | null;

  actionPendingByKey: Record<string, boolean>;
  actionMetricsByKey: Record<string, ActionMetric>;
  resyncTriggeredCount: number;
  uiInconsistencyCount: number;
  lastResyncReason: FriendshipResyncReason | null;

  setLocalAlias: (userId: string, alias: string | null) => void;

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

  fetchFriends: (options?: {
    page?: number;
    limit?: number;
    append?: boolean;
  }) => Promise<void>;
  loadMoreFriends: () => Promise<void>;
  fetchIncomingRequests: () => Promise<void>;
  fetchSentRequests: () => Promise<void>;
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

interface RelationPage {
  relations: FriendshipRelationDto[];
  total: number | null;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asPagination = (
  value: unknown,
  fallback: { page: number; limit: number; total: number },
): Omit<RelationPage, "relations"> => {
  const record = asRecord(value);
  if (!record) {
    const totalPages = Math.ceil(fallback.total / fallback.limit);
    return {
      total: fallback.total,
      page: fallback.page,
      limit: fallback.limit,
      totalPages,
      hasNext: fallback.page < totalPages,
      hasPrev: fallback.page > 1,
    };
  }

  const pagination = asRecord(record.pagination);
  const total =
    asNumber(record.total) ??
    (pagination ? asNumber(pagination.total) : null) ??
    fallback.total;
  const page =
    (pagination ? asNumber(pagination.page) : null) ??
    asNumber(record.page) ??
    fallback.page;
  const limit =
    (pagination ? asNumber(pagination.limit) : null) ??
    asNumber(record.limit) ??
    fallback.limit;
  const totalPages =
    (pagination ? asNumber(pagination.totalPages) : null) ??
    asNumber(record.totalPages) ??
    Math.ceil(total / limit);
  const hasNext =
    (pagination && typeof pagination.hasNext === "boolean"
      ? pagination.hasNext
      : typeof record.hasNext === "boolean"
        ? record.hasNext
        : page < totalPages);
  const hasPrev =
    (pagination && typeof pagination.hasPrev === "boolean"
      ? pagination.hasPrev
      : typeof record.hasPrev === "boolean"
        ? record.hasPrev
        : page > 1);

  return {
    total,
    page,
    limit,
    totalPages,
    hasNext,
    hasPrev,
  };
};

const asRelationPage = (
  payload: unknown,
  fallback: { page?: number; limit?: number } = {},
): RelationPage => {
  const fallbackPage = fallback.page ?? 1;
  const fallbackLimit = fallback.limit ?? FRIENDS_PAGE_SIZE;
  if (Array.isArray(payload)) {
    return {
      relations: payload as FriendshipRelationDto[],
      ...asPagination(null, {
        page: fallbackPage,
        limit: fallbackLimit,
        total: payload.length,
      }),
    };
  }

  const record = asRecord(payload);
  if (!record) {
    return {
      relations: [],
      ...asPagination(null, {
        page: fallbackPage,
        limit: fallbackLimit,
        total: 0,
      }),
    };
  }

  const directData = Array.isArray(record.data)
    ? (record.data as FriendshipRelationDto[])
    : null;
  if (directData) {
    return {
      relations: directData,
      ...asPagination(record, {
        page: fallbackPage,
        limit: fallbackLimit,
        total: directData.length,
      }),
    };
  }

  const nested = asRecord(record.data);
  if (nested && Array.isArray(nested.data)) {
    const nestedRelations = nested.data as FriendshipRelationDto[];
    return {
      relations: nestedRelations,
      ...asPagination(nested, {
        page: fallbackPage,
        limit: fallbackLimit,
        total:
          asNumber(record.total) ??
          (asRecord(record.pagination)
            ? asNumber(asRecord(record.pagination)?.total)
            : null) ??
          nestedRelations.length,
      }),
    };
  }

  return {
    relations: [],
    ...asPagination(record, {
      page: fallbackPage,
      limit: fallbackLimit,
      total: 0,
    }),
  };
};

export const computeFriendshipPairKey = (
  firstUserId: string,
  secondUserId: string,
): string => [firstUserId, secondUserId].sort().join(":");

const resolveRequestPairKey = (
  request: Pick<FriendRequest, "pairKey" | "requester" | "addressee">,
): string | null => {
  if (typeof request.pairKey === "string" && request.pairKey.trim().length > 0) {
    return request.pairKey;
  }

  const requesterId = request.requester?.id?.trim();
  const addresseeId = request.addressee?.id?.trim();
  if (!requesterId || !addresseeId) {
    return null;
  }

  return computeFriendshipPairKey(requesterId, addresseeId);
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
    displayName: user.displayName ?? undefined,
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

  // ponytail: cast until shared-types ships the alias field
  const dto = relation as FriendshipRelationDto & { alias?: string | null };
  return {
    ...friend,
    relationId: relation.relationId,
    capabilities: relation.capabilities,
    actorRole: relation.actorRole,
    relationStatus: relation.status,
    actionResult: relation.actionResult,
    createdAt: relation.createdAt,
    updatedAt: relation.updatedAt,
    alias: dto.alias ?? null,
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
    pairKey: relation.pairKey,
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

export const mapRelationToFriendRecord = toFriendRecord;
export const mapRelationToRequestRecord = toRequestRecord;

export const removeByRelationId = <T extends { relationId: string }>(
  rows: T[],
  relationId: string,
): T[] => rows.filter((item) => item.relationId !== relationId);

export const upsertFront = <T extends { relationId: string }>(
  rows: T[],
  nextRow: T,
): T[] => [nextRow, ...removeByRelationId(rows, nextRow.relationId)];

const mergeFriendsByUserId = (
  current: FriendRecord[],
  incoming: FriendRecord[],
): FriendRecord[] => {
  const nextById = new Map<string, FriendRecord>();
  current.forEach((friend) => nextById.set(friend.id, friend));
  incoming.forEach((friend) => nextById.set(friend.id, friend));
  return Array.from(nextById.values());
};

export const removeByRelationIdentity = (
  rows: FriendRequest[],
  identity: { relationId: string; pairKey?: string | null },
): FriendRequest[] => {
  const pairKey =
    typeof identity.pairKey === "string" && identity.pairKey.trim().length > 0
      ? identity.pairKey
      : null;

  return rows.filter((item) => {
    if (item.relationId === identity.relationId) {
      return false;
    }

    return pairKey === null || resolveRequestPairKey(item) !== pairKey;
  });
};

const upsertRequestFront = (
  rows: FriendRequest[],
  nextRow: FriendRequest,
): FriendRequest[] => [nextRow, ...removeByRelationIdentity(rows, nextRow)];

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
  const relationIdentity = {
    relationId: relation.relationId,
    pairKey: relation.pairKey,
  };
  const hadIncoming = snapshot.incomingRequests.some(
    (item) =>
      item.relationId === relation.relationId ||
      (resolveRequestPairKey(item) !== null &&
        resolveRequestPairKey(item) === relation.pairKey),
  );
  const hadSent = snapshot.sentRequests.some(
    (item) =>
      item.relationId === relation.relationId ||
      (resolveRequestPairKey(item) !== null &&
        resolveRequestPairKey(item) === relation.pairKey),
  );
  const next: FriendshipDirectorySnapshot = {
    friends: removeByRelationId(snapshot.friends, relation.relationId),
    incomingRequests: removeByRelationIdentity(
      snapshot.incomingRequests,
      relationIdentity,
    ),
    sentRequests: removeByRelationIdentity(snapshot.sentRequests, relationIdentity),
    pendingCount: snapshot.pendingCount,
    sentCount: snapshot.sentCount,
  };

  if (relation.status === "accepted") {
    const friend = toFriendRecord(relation);
    if (friend) {
      next.friends = upsertFront(next.friends, friend);
    }
  }

  if (relation.status === "pending") {
    const request = toRequestRecord(relation);
    if (request) {
      if (relation.actorRole === "addressee") {
        next.incomingRequests = upsertRequestFront(next.incomingRequests, request);
      }
      if (relation.actorRole === "requester") {
        next.sentRequests = upsertRequestFront(next.sentRequests, request);
      }
    }
  }

  next.pendingCount =
    relation.status === "pending" && relation.actorRole === "addressee"
      ? snapshot.pendingCount + (hadIncoming ? 0 : 1)
      : Math.max(0, snapshot.pendingCount - (hadIncoming ? 1 : 0));
  next.sentCount =
    relation.status === "pending" && relation.actorRole === "requester"
      ? snapshot.sentCount + (hadSent ? 0 : 1)
      : Math.max(0, snapshot.sentCount - (hadSent ? 1 : 0));
  return next;
};

export const deriveRelationshipState = (
  input: DeriveRelationshipStateInput,
): RelationshipState => {
  const {
    userId,
    currentUserId,
    friends,
    incomingRequests,
    sentRequests,
  } = input;

  if (currentUserId && userId === currentUserId) {
    return { kind: "self", capabilities: EMPTY_CAPABILITIES };
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
  pendingCount: 0,
  sentCount: 0,
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
});

const normalizeSnapshot = (
  snapshot: FriendshipDirectorySnapshot,
): FriendshipDirectorySnapshot => {
  const dedupeRequests = (rows: FriendRequest[]): FriendRequest[] => {
    const seenRelationIds = new Set<string>();
    const seenPairKeys = new Set<string>();

    return rows.filter((item) => {
      const pairKey = resolveRequestPairKey(item);
      if (seenRelationIds.has(item.relationId)) {
        return false;
      }
      if (pairKey && seenPairKeys.has(pairKey)) {
        return false;
      }

      seenRelationIds.add(item.relationId);
      if (pairKey) {
        seenPairKeys.add(pairKey);
      }
      return true;
    });
  };

  return {
    friends: sortByUpdatedAtDesc(snapshot.friends),
    incomingRequests: dedupeRequests(sortByUpdatedAtDesc(snapshot.incomingRequests)),
    sentRequests: dedupeRequests(sortByUpdatedAtDesc(snapshot.sentRequests)),
    pendingCount: Math.max(0, snapshot.pendingCount),
    sentCount: Math.max(0, snapshot.sentCount),
  };
};

const currentSnapshot = (
  state: FriendshipStoreState,
): FriendshipDirectorySnapshot => ({
  friends: state.friends,
  incomingRequests: state.incomingRequests,
  sentRequests: state.sentRequests,
  pendingCount: state.pendingCount,
  sentCount: state.sentCount,
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
  logger.info("friendship-metric", event, payload, { debugOnly: true });
};

export const useFriendshipStore = create<FriendshipStoreState>((set, get) => ({
  ...initialSnapshot,
  ...toIndexedFields(initialSnapshot),
  friendsTotal: 0,
  friendsPage: 0,
  friendsLimit: FRIENDS_PAGE_SIZE,
  friendsHasNext: false,
  friendsError: null,
  friendsLoadMoreError: null,

  isFriendsLoading: false,
  isFriendsLoadingMore: false,
  isIncomingLoading: false,
  isSentLoading: false,
  isDirectoryRefreshing: false,
  hasHydrated: false,
  lastSyncedAt: null,

  actionPendingByKey: {},
  actionMetricsByKey: {},
  resyncTriggeredCount: 0,
  uiInconsistencyCount: 0,
  lastResyncReason: null,

  setLocalAlias: (userId, alias) => {
    _saveAlias(userId, alias);
    set((state) => {
      const friends = state.friends.map((f) =>
        f.id === userId ? { ...f, alias } : f,
      );
      return {
        friends,
        friendByUserId: Object.fromEntries(friends.map((f) => [f.id, f])),
      };
    });
    const { setEnrichedName, clearEnrichedName } = useEnrichedProfileStore.getState();
    if (alias) {
      setEnrichedName(userId, alias);
    } else {
      clearEnrichedName(userId);
    }
  },

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
    const current = get();
    const hadFriend = current.friends.some(
      (friend) => friend.relationId === relation.relationId,
    );
    const nextSnapshot = applyRelationToSnapshot(
      currentSnapshot(current),
      relation,
    );
    const normalized = normalizeSnapshot(nextSnapshot);
    const hasFriend = normalized.friends.some(
      (friend) => friend.relationId === relation.relationId,
    );
    const friendsTotal =
      hasFriend && !hadFriend
        ? current.friendsTotal + 1
        : hadFriend && !hasFriend
          ? Math.max(0, current.friendsTotal - 1)
          : Math.max(current.friendsTotal, normalized.friends.length);
    const updatedFriend = normalized.friends.find(
      (f) => f.relationId === relation.relationId,
    );
    if (updatedFriend?.alias) {
      useEnrichedProfileStore.getState().setEnrichedName(updatedFriend.id, updatedFriend.alias);
    }
    set(() => ({
      ...normalized,
      ...toIndexedFields(normalized),
      friendsTotal,
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

  fetchFriends: async (options) => {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? FRIENDS_PAGE_SIZE;
    const append = options?.append === true;
    const state = get();

    if (append && (state.isFriendsLoadingMore || state.isFriendsLoading)) {
      return;
    }

    set(
      append
        ? { isFriendsLoadingMore: true, friendsLoadMoreError: null }
        : { isFriendsLoading: true, friendsError: null, friendsLoadMoreError: null },
    );
    try {
      const response = await friendshipApi.getFriends(page, limit);
      const payload = unwrapApiSuccess(response);
      const relationPage = asRelationPage(payload, { page, limit });
      const list = relationPage.relations
        .map((relation) => toFriendRecord(relation))
        .filter((item): item is FriendRecord => item !== null);

      // Inject aliases into enrichedProfileStore so ChatHeader/RoomItem reflect them immediately
      const { setEnrichedName } = useEnrichedProfileStore.getState();
      const storedAliases = _loadAliases();
      list.forEach((f) => {
        const alias = f.alias ?? storedAliases[f.id] ?? null;
        if (alias) setEnrichedName(f.id, alias);
      });

      set((state) => {
        const mergedFriends = append
          ? mergeFriendsByUserId(state.friends, list)
          : list;
        const next = normalizeSnapshot({
          ...currentSnapshot(state),
          friends: mergedFriends,
        });

        return {
          ...next,
          ...toIndexedFields(next),
          friendsTotal: relationPage.total ?? next.friends.length,
          friendsPage: relationPage.page,
          friendsLimit: relationPage.limit,
          friendsHasNext: relationPage.hasNext,
          friendsError: null,
          friendsLoadMoreError: null,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Load friends failed";
      if (append) {
        set({ friendsLoadMoreError: message });
      } else {
        set((state) => {
          const next = normalizeSnapshot({
            ...currentSnapshot(state),
            friends: [],
          });

          return {
            ...next,
            ...toIndexedFields(next),
            friendsTotal: 0,
            friendsPage: 0,
            friendsHasNext: false,
            friendsError: message,
          };
        });
      }
    } finally {
      set(
        append
          ? { isFriendsLoadingMore: false }
          : { isFriendsLoading: false },
      );
    }
  },

  loadMoreFriends: async () => {
    const state = get();
    if (!state.friendsHasNext || state.isFriendsLoadingMore || state.isFriendsLoading) {
      return;
    }

    await state.fetchFriends({
      page: state.friendsPage + 1,
      limit: state.friendsLimit || FRIENDS_PAGE_SIZE,
      append: true,
    });
  },

  fetchIncomingRequests: async () => {
    set({ isIncomingLoading: true });
    try {
      const response = await friendshipApi.getPendingRequests();
      const payload = unwrapApiSuccess(response);
      const page = asRelationPage(payload);
      const list = page.relations
        .map((relation) => toRequestRecord(relation))
        .filter((item): item is FriendRequest => item !== null);

      set((state) => {
        const next = normalizeSnapshot({
          ...currentSnapshot(state),
          incomingRequests: list,
          pendingCount: page.total ?? list.length,
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
      const page = asRelationPage(payload);
      const list = page.relations
        .map((relation) => toRequestRecord(relation))
        .filter((item): item is FriendRequest => item !== null);

      set((state) => {
        const next = normalizeSnapshot({
          ...currentSnapshot(state),
          sentRequests: list,
          sentCount: page.total ?? list.length,
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
          sentCount: 0,
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

      set({
        pendingCount: count,
      });
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
        tasks.push(get().fetchFriends());
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
  friendsTotal: state.friendsTotal,
  friendsPage: state.friendsPage,
  friendsHasNext: state.friendsHasNext,
  friendsError: state.friendsError,
  friendsLoadMoreError: state.friendsLoadMoreError,
  incomingRequests: state.incomingRequests,
  sentRequests: state.sentRequests,
  pendingCount: state.pendingCount,
  sentCount: state.sentCount,
  isFriendsLoading: state.isFriendsLoading,
  isFriendsLoadingMore: state.isFriendsLoadingMore,
  isIncomingLoading: state.isIncomingLoading,
  isSentLoading: state.isSentLoading,
  hasHydrated: state.hasHydrated,
});

export const asFriendshipStatus = (
  status: FriendshipStatusType,
): FriendshipStatus => {
  return status as FriendshipStatus;
};
