import { buildMessageCorrelationKey } from "../../../utils/messageIdFactory";
import { asRecord, asString } from "../../../utils/payloadGuards";
import {
  buildRealtimeEventKey,
  createRealtimeEventDeduper,
} from "./realtimeEventKeys";
import type {
  NormalizedMessageRealtimeEvent,
} from "./realtimeEventTypes";

const asFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getMessagePayload = (
  payload: Record<string, unknown>,
): Record<string, unknown> | null => {
  const nested =
    asRecord(payload.message) ??
    asRecord(payload.data) ??
    asRecord(payload.payload);

  if (nested) {
    return nested;
  }

  return asString(payload.id) ||
    asString(payload.messageId) ||
    asString(payload._id)
    ? payload
    : null;
};

const getConversationId = (
  payload: Record<string, unknown>,
  messagePayload: Record<string, unknown>,
): string | null =>
  asString(payload.conversationId) ??
  asString(payload.conversation_id) ??
  asString(payload.roomId) ??
  asString(payload.room_id) ??
  asString(messagePayload.conversationId) ??
  asString(messagePayload.conversation_id) ??
  asString(messagePayload.roomId) ??
  asString(messagePayload.room_id);

const getNestedId = (
  source: Record<string, unknown>,
  key: "sender" | "from",
): string | null => asString(asRecord(source[key])?.id);

const getSenderId = (
  payload: Record<string, unknown>,
  messagePayload: Record<string, unknown>,
): string | null =>
  asString(messagePayload.senderId) ??
  asString(messagePayload.sender_id) ??
  getNestedId(messagePayload, "sender") ??
  getNestedId(payload, "sender") ??
  getNestedId(messagePayload, "from") ??
  getNestedId(payload, "from") ??
  asString(messagePayload.authorId) ??
  asString(messagePayload.author_id) ??
  asString(payload.authorId) ??
  asString(payload.author_id) ??
  asString(messagePayload.createdBy) ??
  asString(payload.createdBy);

export const normalizeMessageRealtimeEvent = (
  data: unknown,
  socketEvent: "message:new" | "message:updated",
): NormalizedMessageRealtimeEvent | null => {
  const payload = asRecord(data);
  if (!payload) return null;

  const messagePayload = getMessagePayload(payload);
  if (!messagePayload) return null;

  const conversationId = getConversationId(payload, messagePayload);
  const messageId =
    asString(messagePayload.id) ??
    asString(messagePayload._id) ??
    asString(messagePayload.messageId) ??
    asString(messagePayload.stableId) ??
    asString(messagePayload.localId) ??
    asString(messagePayload.tempId);

  if (!conversationId || !messageId) {
    return null;
  }

  const tempId =
    asString(payload.tempId) ??
    asString(messagePayload.tempId) ??
    asString(payload.clientMessageId) ??
    asString(messagePayload.clientMessageId) ??
    undefined;
  const clientMessageId =
    asString(payload.clientMessageId) ??
    asString(messagePayload.clientMessageId) ??
    tempId ??
    undefined;
  const localId =
    asString(messagePayload.localId) ??
    asString(payload.localId) ??
    tempId ??
    undefined;
  const stableId =
    asString(messagePayload.stableId) ?? localId ?? messageId;
  const senderId = getSenderId(payload, messagePayload) ?? undefined;
  const incomingSeq = asFiniteNumber(
    messagePayload.serverSeq ??
      messagePayload.messageSeq ??
      messagePayload.message_seq ??
      payload.messageSeq ??
      payload.message_seq,
  );
  const version =
    asString(messagePayload.updatedAt) ??
    asString(messagePayload.createdAt) ??
    incomingSeq;
  const eventId = buildRealtimeEventKey({
    eventId:
      asString(payload.eventId) ?? asString(messagePayload.eventId) ?? null,
    eventName: socketEvent,
    conversationId,
    entityId: messageId,
    version,
  });

  return {
    kind: socketEvent === "message:new" ? "message.created" : "message.updated",
    socketEvent,
    conversationId,
    messageId,
    eventId,
    messagePayload,
    payload,
    ...(clientMessageId ? { clientMessageId } : {}),
    ...(localId ? { localId } : {}),
    ...(tempId ? { tempId } : {}),
    ...(stableId ? { stableId } : {}),
    ...(senderId ? { senderId } : {}),
    incomingSeq,
    correlationKey: buildMessageCorrelationKey({
      conversationId,
      clientMessageId,
      tempId,
      localId,
    }),
  };
};

export const createChatRealtimeAdapter = () => {
  const deduper = createRealtimeEventDeduper();

  return {
    normalizeMessageRealtimeEvent,
    shouldProcessEvent: deduper.shouldProcess,
    clearDedupe: deduper.clear,
  };
};
