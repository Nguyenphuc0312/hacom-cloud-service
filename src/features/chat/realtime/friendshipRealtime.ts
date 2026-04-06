import type { FriendshipRelationDto } from "@hacom/chat-shared-types";

const FRIENDSHIP_RELATION_CHANGED_EVENT = "friendship:realtime:relation";
const FRIENDSHIP_RESYNC_REQUESTED_EVENT = "friendship:realtime:resync";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const isRelationDto = (value: unknown): value is FriendshipRelationDto => {
  const record = asRecord(value);
  if (!record) return false;

  return (
    typeof record.relationId === "string" &&
    typeof record.status === "string" &&
    record.requester !== null &&
    typeof record.requester === "object" &&
    record.addressee !== null &&
    typeof record.addressee === "object"
  );
};

const extractRelation = (
  payload: Record<string, unknown>,
): FriendshipRelationDto | null => {
  if (isRelationDto(payload.relation)) {
    return payload.relation;
  }

  if (isRelationDto(payload.friendship)) {
    return payload.friendship;
  }

  if (isRelationDto(payload)) {
    return payload;
  }

  return null;
};

export interface FriendshipRealtimeDetail {
  eventType: string;
  eventId: string | null;
  targetUserId: string | null;
  actorUserId: string | null;
  occurredAt: string | null;
  status: string | null;
  relation: FriendshipRelationDto | null;
  raw: Record<string, unknown>;
}

export type FriendshipResyncReason =
  | "socket_reconnect"
  | "missing_relation_payload"
  | "explicit_refresh";

export interface FriendshipResyncDetail {
  reason: FriendshipResyncReason;
  requestedAt: string;
}

export const toFriendshipRealtimeDetail = (
  eventType: string,
  payload: unknown,
): FriendshipRealtimeDetail => {
  const raw = asRecord(payload) ?? {};
  const relation = extractRelation(raw);

  return {
    eventType,
    eventId: asString(raw.eventId),
    targetUserId: asString(raw.targetUserId),
    actorUserId: asString(raw.actorUserId),
    occurredAt: asString(raw.occurredAt) ?? asString(raw.changedAt),
    status: relation?.status ?? asString(raw.status),
    relation,
    raw,
  };
};

export const emitFriendshipRealtimeDetail = (
  detail: FriendshipRealtimeDetail,
): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(FRIENDSHIP_RELATION_CHANGED_EVENT, {
      detail,
    }),
  );
};

export const subscribeFriendshipRealtime = (
  listener: (detail: FriendshipRealtimeDetail) => void,
): (() => void) => {
  if (typeof window === "undefined") {
    return () => {
      // no-op in non-browser runtime
    };
  }

  const handler = (event: Event): void => {
    const customEvent = event as CustomEvent<FriendshipRealtimeDetail>;
    if (!customEvent.detail) return;
    listener(customEvent.detail);
  };

  window.addEventListener(
    FRIENDSHIP_RELATION_CHANGED_EVENT,
    handler as EventListener,
  );
  return () => {
    window.removeEventListener(
      FRIENDSHIP_RELATION_CHANGED_EVENT,
      handler as EventListener,
    );
  };
};

export const requestFriendshipResync = (
  reason: FriendshipResyncReason,
): void => {
  if (typeof window === "undefined") return;

  const detail: FriendshipResyncDetail = {
    reason,
    requestedAt: new Date().toISOString(),
  };

  window.dispatchEvent(
    new CustomEvent(FRIENDSHIP_RESYNC_REQUESTED_EVENT, {
      detail,
    }),
  );
};

export const subscribeFriendshipResync = (
  listener: (detail: FriendshipResyncDetail) => void,
): (() => void) => {
  if (typeof window === "undefined") {
    return () => {
      // no-op in non-browser runtime
    };
  }

  const handler = (event: Event): void => {
    const customEvent = event as CustomEvent<FriendshipResyncDetail>;
    if (!customEvent.detail) return;
    listener(customEvent.detail);
  };

  window.addEventListener(
    FRIENDSHIP_RESYNC_REQUESTED_EVENT,
    handler as EventListener,
  );
  return () => {
    window.removeEventListener(
      FRIENDSHIP_RESYNC_REQUESTED_EVENT,
      handler as EventListener,
    );
  };
};
