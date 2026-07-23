import { logger } from "../utils/logger";
import { asString } from "../utils/payloadGuards";

type UnknownRecord = Record<string, unknown>;

const warnedMessages = new Set<string>();

const isRecord = (value: unknown): value is UnknownRecord =>
  value !== null && typeof value === "object";

const warnOnce = (key: string, message: string, extra?: unknown): void => {
  if (!import.meta.env.DEV || warnedMessages.has(key)) {
    return;
  }

  warnedMessages.add(key);
  if (extra === undefined) {
    logger.warn("conversation-identity", key, { message });
    return;
  }

  logger.warn("conversation-identity", key, { message, extra });
};

export const warnLegacyRoomAlias = (
  source: string,
  payload?: unknown,
): void => {
  warnOnce(
    `legacy-room-alias:${source}`,
    `[chat-web-client] Legacy roomId alias received at ${source}. Normalize to conversationId at the boundary.`,
    payload,
  );
};

export const warnLegacyRoomsRequest = (requestPath: string): void => {
  warnOnce(
    `legacy-rooms-request:${requestPath}`,
    `[chat-web-client] Deprecated /rooms/* request detected from frontend code: ${requestPath}`,
  );
};

export const warnConversationIdentityMismatch = (
  source: string,
  identities: {
    routeConversationId?: string | null;
    activeConversationId?: string | null;
    eventConversationId?: string | null;
  },
): void => {
  const values = [
    identities.routeConversationId,
    identities.activeConversationId,
    identities.eventConversationId,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  if (values.length <= 1 || new Set(values).size === 1) {
    return;
  }

  warnOnce(
    `conversation-identity-mismatch:${source}:${values.join("|")}`,
    `[chat-web-client] Conversation identity mismatch detected at ${source}.`,
    identities,
  );
};

export const resolveConversationId = (
  payload: unknown,
  options?: {
    source?: string;
    nestedKeys?: string[];
    fallbackConversationId?: string | null;
    includeEntityId?: boolean;
  },
): string | null => {
  const record = isRecord(payload) ? payload : null;
  if (!record) {
    return options?.fallbackConversationId ?? null;
  }

  const conversationId =
    asString(record.conversationId) ??
    (options?.includeEntityId ? asString(record.id) : null) ??
    (options?.includeEntityId ? asString(record._id) : null) ??
    options?.nestedKeys
      ?.map((key) => {
        const nested = record[key];
        if (!isRecord(nested)) return null;
        return (
          asString(nested.conversationId) ??
          (options?.includeEntityId ? asString(nested.id) : null) ??
          (options?.includeEntityId ? asString(nested._id) : null)
        );
      })
      .find((value): value is string => typeof value === "string") ??
    null;

  if (conversationId) {
    return conversationId;
  }

  const roomId =
    asString(record.roomId) ??
    asString(record.room_id) ??
    asString(record.room) ??
    options?.nestedKeys
      ?.map((key) => {
        const nested = record[key];
        if (!isRecord(nested)) return null;
        return (
          asString(nested.roomId) ??
          asString(nested.room_id) ??
          asString(nested.room)
        );
      })
      .find((value): value is string => typeof value === "string") ??
    options?.fallbackConversationId ??
    null;

  if (roomId && options?.source) {
    warnLegacyRoomAlias(options.source, payload);
  }

  return roomId;
};

export const resolveConversationIds = (
  payload: unknown,
  options?: {
    source?: string;
  },
): string[] => {
  const record = isRecord(payload) ? payload : null;
  if (!record) {
    return [];
  }

  const canonicalConversationIds = Array.isArray(record.conversationIds)
    ? record.conversationIds
        .map((item) => asString(item))
        .filter((item): item is string => typeof item === "string")
    : [];
  if (canonicalConversationIds.length > 0) {
    return canonicalConversationIds;
  }

  const legacyConversationIds = [record.roomIds, record.rooms]
    .find((candidate) => Array.isArray(candidate));
  if (!Array.isArray(legacyConversationIds)) {
    return [];
  }

  const normalizedLegacyConversationIds = legacyConversationIds
    .map((item) => asString(item))
    .filter((item): item is string => typeof item === "string");

  if (normalizedLegacyConversationIds.length > 0 && options?.source) {
    warnLegacyRoomAlias(options.source, payload);
  }

  return normalizedLegacyConversationIds;
};

export const resetConversationIdentityWarningsForTest = (): void => {
  warnedMessages.clear();
};
