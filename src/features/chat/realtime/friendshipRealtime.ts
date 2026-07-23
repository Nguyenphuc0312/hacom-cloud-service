import type { FriendshipRelationDto } from "@hacom/chat-shared-types/chat";
import { asRecord, asString } from "../../../utils/payloadGuards";

const friendshipRealtimeListeners = new Set<
  (detail: FriendshipRealtimeDetail) => void
>();
const friendshipResyncListeners = new Set<
  (detail: FriendshipResyncDetail) => void
>();

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
  friendshipRealtimeListeners.forEach((listener) => listener(detail));
};

export const subscribeFriendshipRealtime = (
  listener: (detail: FriendshipRealtimeDetail) => void,
): (() => void) => {
  friendshipRealtimeListeners.add(listener);
  return () => {
    friendshipRealtimeListeners.delete(listener);
  };
};

export const requestFriendshipResync = (
  reason: FriendshipResyncReason,
): void => {
  const detail: FriendshipResyncDetail = {
    reason,
    requestedAt: new Date().toISOString(),
  };

  friendshipResyncListeners.forEach((listener) => listener(detail));
};

export const subscribeFriendshipResync = (
  listener: (detail: FriendshipResyncDetail) => void,
): (() => void) => {
  friendshipResyncListeners.add(listener);
  return () => {
    friendshipResyncListeners.delete(listener);
  };
};
