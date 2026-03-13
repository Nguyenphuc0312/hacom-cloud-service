/**
 * @fileoverview Chat store (Zustand)
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";
import {
  normalizeConversation,
  normalizeConversationsPayload,
  normalizeRoomType,
} from "../lib/conversationAdapter";
import { toast } from "../utils/toast";
import { createReplySnapshot } from "../utils/messageTimeline";
import { rankConversations } from "../utils/conversationRanking";
import i18n from "../i18n";
import { useAuthStore } from "./authStore";
import { conversationApi, messageApi } from "../services/api";
import type {
  Conversation,
  Message,
  TypingStatus,
  ConversationFilter,
} from "../types";
import { MessageType, MessageStatus } from "../types";
import type { Attachment } from "../types";

interface ChatState {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  messagesHydratedByConversation: Record<string, boolean>;
  selectedConversationId: string | null;
  typingStatuses: TypingStatus[];
  searchQuery: string;
  activeFilter: ConversationFilter;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isLoadingMessagesByConversation: Record<string, boolean>;
  hasMoreMessages: Record<string, boolean>;
  messageErrors: Record<string, string | null>;
  error: string | null;

  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  removeConversation: (id: string) => void;
  selectConversation: (id: string | null) => void;
  markAsRead: (conversationId: string) => Promise<void>;
  fetchConversations: () => Promise<void>;

  setMessages: (conversationId: string, messages: Message[]) => void;
  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (
    conversationId: string,
    messageId: string,
    updates: Partial<Message>,
  ) => void;
  markMessagesReadUpTo: (
    conversationId: string,
    lastMessageId: string,
    readerId?: string,
  ) => void;
  removeMessage: (conversationId: string, messageId: string) => void;
  fetchMessages: (
    conversationId: string,
    before?: string,
    after?: string,
    options?: FetchMessagesOptions,
  ) => Promise<FetchMessagesResult>;
  sendMessage: (
    conversationId: string,
    content: string,
    type?: MessageType,
    fileMeta?: Attachment | Attachment[],
    replyToId?: string,
    replyToSnapshot?: Message,
  ) => Promise<void>;
  resendMessage: (conversationId: string, message: Message) => Promise<void>;

  setTyping: (status: TypingStatus) => void;
  clearTyping: (conversationId: string, userId: string) => void;

  setSearchQuery: (query: string) => void;
  setActiveFilter: (filter: ConversationFilter) => void;

  clearError: () => void;
  reset: () => void;
}

interface FetchMessagesResult {
  loaded: number;
  hasMore: boolean;
}

interface FetchMessagesOptions {
  force?: boolean;
  limit?: number;
  beforeId?: string;
  afterId?: string;
}

const initialState = {
  conversations: [],
  messages: {},
  messagesHydratedByConversation: {},
  selectedConversationId: null,
  typingStatuses: [],
  searchQuery: "",
  activeFilter: "all" as ConversationFilter,
  isLoadingConversations: false,
  isLoadingMessages: false,
  isLoadingMessagesByConversation: {},
  hasMoreMessages: {},
  messageErrors: {},
  error: null,
};

const EMPTY_MESSAGES: Message[] = [];

const roomMessageFetchInFlight = new Map<string, number>();
const initialFetchSeqByConversation = new Map<string, number>();
let nextLocalMessageOrder = 1;

const allocateLocalMessageOrder = (): number => {
  const allocated = nextLocalMessageOrder;
  nextLocalMessageOrder += 1;
  return allocated;
};

const buildLoadingStateFromInFlightMap = (): {
  isLoadingMessages: boolean;
  isLoadingMessagesByConversation: Record<string, boolean>;
} => {
  const isLoadingMessagesByConversation = Object.fromEntries(
    Array.from(roomMessageFetchInFlight.entries()).map(
      ([conversationId, count]) => [conversationId, count > 0],
    ),
  );
  return {
    isLoadingMessages: Array.from(roomMessageFetchInFlight.values()).some(
      (count) => count > 0,
    ),
    isLoadingMessagesByConversation,
  };
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;

const isMessageDebugEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  return (
    new URLSearchParams(window.location.search).get("debugMessages") === "1"
  );
};

const asStringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const asNumberValue = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const toDateObject = (value: unknown, fallback: Date = new Date()): Date => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
};

const normalizeAttachments = (value: unknown): Message["attachments"] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((attachmentRaw) => {
      const attachment = asRecord(attachmentRaw);
      if (!attachment) return null;

      const id =
        asStringValue(attachment.id) ?? asStringValue(attachment.fileId);
      const objectKey = asStringValue(attachment.objectKey);
      const url =
        asStringValue(attachment.url) ??
        asStringValue(attachment.downloadUrl) ??
        asStringValue(attachment.fileUrl);
      if (!id || (!objectKey && !url)) return null;

      return {
        id,
        type: (asStringValue(attachment.type) ?? "other") as Attachment["type"],
        objectKey,
        url,
        downloadUrl: asStringValue(attachment.downloadUrl),
        expiresAt: asStringValue(attachment.expiresAt),
        fileName:
          asStringValue(attachment.fileName) ??
          asStringValue(attachment.filename) ??
          asStringValue(attachment.originalName),
        mimeType:
          asStringValue(attachment.mimeType) ??
          asStringValue(attachment.mimetype),
        fileSize:
          asNumberValue(attachment.fileSize) ?? asNumberValue(attachment.size),
        thumbnailUrl: asStringValue(attachment.thumbnailUrl),
        width: asNumberValue(attachment.width),
        height: asNumberValue(attachment.height),
        duration: asNumberValue(attachment.duration),
      } as Attachment;
    })
    .filter((item): item is Attachment => item !== null);
};

const normalizeReactions = (value: unknown): Message["reactions"] => {
  if (!Array.isArray(value)) return [];
  if (value.length === 0) return [];

  const first = asRecord(value[0]);
  if (first && Array.isArray(first.userIds)) {
    return value as Message["reactions"];
  }

  const grouped = new Map<string, Set<string>>();

  for (const reactionRaw of value) {
    const reaction = asRecord(reactionRaw);
    if (!reaction) continue;

    const emoji = asStringValue(reaction.emoji);
    const userId =
      asStringValue(reaction.userId) ??
      asStringValue(reaction.senderId) ??
      asStringValue(reaction.user_id);
    if (!emoji || !userId) continue;

    if (!grouped.has(emoji)) grouped.set(emoji, new Set());
    grouped.get(emoji)?.add(userId);
  }

  return Array.from(grouped.entries()).map(([emoji, userIds]) => ({
    emoji,
    userIds: Array.from(userIds),
    count: userIds.size,
  }));
};

const normalizeMessage = (
  input: unknown,
  fallbackConversationId?: string,
): Message | null => {
  const sourceRecord = asRecord(input);
  if (!sourceRecord) return null;

  const nestedMessage = asRecord(sourceRecord.message);
  const source =
    nestedMessage &&
    !asStringValue(sourceRecord.id) &&
    !asStringValue(sourceRecord._id) &&
    !asStringValue(sourceRecord.messageId)
      ? nestedMessage
      : sourceRecord;

  const sender = asRecord(source.sender);
  const id =
    asStringValue(source.id) ??
    asStringValue(source._id) ??
    asStringValue(source.messageId);
  const conversationId =
    asStringValue(source.conversationId) ??
    asStringValue(source.roomId) ??
    asStringValue(source.room_id) ??
    fallbackConversationId;

  if (!id || !conversationId) return null;

  const senderId =
    asStringValue(source.senderId) ??
    asStringValue(source.userId) ??
    asStringValue(sender?.id) ??
    "unknown-user";
  const senderName =
    asStringValue(source.senderName) ??
    asStringValue(source.username) ??
    asStringValue(sender?.displayName) ??
    asStringValue(sender?.username) ??
    i18n.t("common:labels.user");
  const senderAvatar =
    asStringValue(source.senderAvatar) ??
    asStringValue(source.avatar) ??
    asStringValue(sender?.avatar);

  const rawStatus = asStringValue(source.status);
  const statusValues = new Set<string>(Object.values(MessageStatus));
  const status = statusValues.has(rawStatus ?? "")
    ? (rawStatus as Message["status"])
    : MessageStatus.SENT;
  const clientMessageId =
    asStringValue(source.clientMessageId) ??
    asStringValue(source.client_message_id) ??
    asStringValue(source.tempId) ??
    asStringValue(source.localId);
  const stableId =
    asStringValue(source.stableId) ??
    clientMessageId ??
    asStringValue(source.localId) ??
    id;
  const serverTs =
    source.serverTs ?? source.server_ts ?? source.createdAt ?? undefined;
  const localOrder =
    asNumberValue(source.localOrder) ??
    asNumberValue(source.local_order) ??
    undefined;
  const serverSeq =
    asNumberValue(source.serverSeq) ??
    asNumberValue(source.server_seq) ??
    asNumberValue(source.seq) ??
    asNumberValue(source.sequence) ??
    undefined;
  const transportStatus = (() => {
    const explicit =
      asStringValue(source.transportStatus) ??
      asStringValue(source.transport_status);
    if (
      explicit === "draft" ||
      explicit === "optimistic" ||
      explicit === "acked_transport" ||
      explicit === "synced_stream"
    ) {
      return explicit;
    }

    if (id.startsWith("temp-") || status === MessageStatus.SENDING) {
      return "optimistic" as const;
    }

    return serverSeq !== undefined ? ("synced_stream" as const) : ("acked_transport" as const);
  })();

  return {
    id,
    stableId,
    clientMessageId,
    localId:
      asStringValue(source.localId) ??
      asStringValue(source.tempId) ??
      asStringValue(source.clientMessageId),
    serverSeq,
    serverTs: serverTs ? toDateObject(serverTs) : undefined,
    localOrder,
    transportStatus,
    conversationId,
    senderId,
    senderName,
    senderAvatar,
    content: typeof source.content === "string" ? source.content : "",
    type: (asStringValue(source.type) ?? MessageType.TEXT) as Message["type"],
    replyTo:
      asStringValue(source.replyTo) ??
      (asRecord(source.replyTo)?.id as string | undefined),
    replyToMessage: source.replyToMessage as Message["replyToMessage"],
    forwardedFrom: source.forwardedFrom as Message["forwardedFrom"],
    attachments: normalizeAttachments(source.attachments),
    reactions: normalizeReactions(source.reactions),
    mentions: Array.isArray(source.mentions)
      ? (source.mentions.filter(
          (item): item is string => typeof item === "string",
        ) as string[])
      : [],
    status,
    isEdited: Boolean(source.isEdited),
    isPinned: Boolean(source.isPinned),
    isDeleted: Boolean(source.isDeleted),
    isSystem: Boolean(source.isSystem),
    metadata: asRecord(source.metadata) ?? undefined,
    createdAt: toDateObject(source.createdAt),
    editedAt: source.editedAt ? toDateObject(source.editedAt) : undefined,
    deliveredAt: source.deliveredAt
      ? toDateObject(source.deliveredAt)
      : undefined,
    readAt: source.readAt ? toDateObject(source.readAt) : undefined,
    readBy: Array.isArray(source.readBy)
      ? source.readBy
          .map((item) => {
            if (typeof item === "string") return item;
            const record = asRecord(item);
            return asStringValue(record?.userId) ?? asStringValue(record?.id);
          })
          .filter((item): item is string => typeof item === "string")
      : [],
  };
};

const toDateValue = (value: unknown): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const toFiniteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const getStableMessageId = (message: Message): string =>
  message.stableId ||
  message.clientMessageId ||
  message.localId ||
  message.id;

const compareMessages = (a: Message, b: Message): number => {
  const aSeq = toFiniteNumber(a.serverSeq);
  const bSeq = toFiniteNumber(b.serverSeq);
  if (aSeq !== null && bSeq !== null && aSeq !== bSeq) {
    return aSeq - bSeq;
  }
  if (aSeq !== null && bSeq === null) return -1;
  if (aSeq === null && bSeq !== null) return 1;

  const serverTimeDiff = toDateValue(a.serverTs) - toDateValue(b.serverTs);
  if (serverTimeDiff !== 0) return serverTimeDiff;

  const localOrderDiff =
    (toFiniteNumber(a.localOrder) ?? Number.MAX_SAFE_INTEGER) -
    (toFiniteNumber(b.localOrder) ?? Number.MAX_SAFE_INTEGER);
  if (localOrderDiff !== 0) return localOrderDiff;

  const timeDiff = toDateValue(a.createdAt) - toDateValue(b.createdAt);
  if (timeDiff !== 0) return timeDiff;

  const stableDiff = getStableMessageId(a).localeCompare(getStableMessageId(b));
  if (stableDiff !== 0) return stableDiff;

  const aId = typeof a.id === "string" ? a.id : "";
  const bId = typeof b.id === "string" ? b.id : "";
  return aId.localeCompare(bId);
};

const sortMessages = (messages: Message[]): Message[] =>
  [...messages].sort(compareMessages);

const isTempMessageId = (id: string | undefined): boolean =>
  typeof id === "string" && id.startsWith("temp-");

const matchesMessage = (source: Message, target: Message): boolean =>
  (source.stableId !== undefined &&
    (source.stableId === target.stableId ||
      source.stableId === target.clientMessageId ||
      source.stableId === target.localId)) ||
  (source.clientMessageId !== undefined &&
    (source.clientMessageId === target.clientMessageId ||
      source.clientMessageId === target.stableId ||
      source.clientMessageId === target.localId)) ||
  source.id === target.id ||
  (source.localId !== undefined && source.localId === target.id) ||
  (target.localId !== undefined && target.localId === source.id) ||
  (source.localId !== undefined &&
    target.localId !== undefined &&
    source.localId === target.localId) ||
  isSamePendingMessageCandidate(source, target);

const isSamePendingMessageCandidate = (
  source: Message,
  target: Message,
): boolean => {
  const sourceIsPending =
    isTempMessageId(source.id) ||
    source.status === MessageStatus.SENDING ||
    source.status === MessageStatus.FAILED;
  const targetIsPending =
    isTempMessageId(target.id) ||
    target.status === MessageStatus.SENDING ||
    target.status === MessageStatus.FAILED;

  if (sourceIsPending === targetIsPending) return false;
  if (!source.senderId || source.senderId !== target.senderId) return false;
  if (
    !source.conversationId ||
    source.conversationId !== target.conversationId
  ) {
    return false;
  }
  if (source.type !== target.type) return false;
  if ((source.content || "") !== (target.content || "")) return false;

  const sourceTs = toDateValue(source.createdAt);
  const targetTs = toDateValue(target.createdAt);
  if (!sourceTs || !targetTs) return false;

  const withinGraceWindow = Math.abs(sourceTs - targetTs) <= 45_000;
  if (!withinGraceWindow) return false;

  const sourceAttachment = source.attachments?.[0];
  const targetAttachment = target.attachments?.[0];
  // Do not collapse plain text messages by heuristic. They are deduped by id/localId.
  // This avoids overwriting legitimate repeated messages from the same sender.
  if (!sourceAttachment && !targetAttachment) return false;
  if (!sourceAttachment || !targetAttachment) return false;
  return sourceAttachment.id === targetAttachment.id;
};

const findMessageIndex = (messages: Message[], target: Message): number =>
  messages.findIndex((item) => matchesMessage(item, target));

const toMessageIdentityKeys = (message: Message): string[] => {
  const keys = new Set<string>();
  if (typeof message.stableId === "string" && message.stableId.length > 0) {
    keys.add(`stable:${message.stableId}`);
  }
  if (
    typeof message.clientMessageId === "string" &&
    message.clientMessageId.length > 0
  ) {
    keys.add(`client:${message.clientMessageId}`);
    keys.add(`stable:${message.clientMessageId}`);
  }
  if (typeof message.id === "string" && message.id.length > 0) {
    keys.add(`id:${message.id}`);
    keys.add(`local:${message.id}`);
  }
  if (typeof message.localId === "string" && message.localId.length > 0) {
    keys.add(`id:${message.localId}`);
    keys.add(`local:${message.localId}`);
    keys.add(`stable:${message.localId}`);
  }
  return Array.from(keys);
};

const resolveMessageMatchIndex = (
  current: Message[],
  keyToIndex: Map<string, number>,
  incoming: Message,
): number => {
  const identityMatch = toMessageIdentityKeys(incoming)
    .map((key) => keyToIndex.get(key))
    .find((index): index is number => typeof index === "number");
  if (typeof identityMatch === "number") {
    return identityMatch;
  }

  return current.findIndex((item) =>
    isSamePendingMessageCandidate(item, incoming),
  );
};

const mergeDefinedMessageFields = (
  current: Message,
  incoming: Message,
): Message => {
  const merged = { ...current } as unknown as Record<string, unknown>;
  Object.entries(incoming as unknown as Record<string, unknown>).forEach(
    ([key, value]) => {
      if (value !== undefined) {
        merged[key] = value;
      }
    },
  );
  return merged as unknown as Message;
};

const mergeMessageRecords = (current: Message, incoming: Message): Message => {
  const merged = mergeDefinedMessageFields(current, incoming);

  if (isTempMessageId(current.id) && !isTempMessageId(incoming.id)) {
    merged.id = incoming.id;
  } else if (!isTempMessageId(current.id) && isTempMessageId(incoming.id)) {
    merged.id = current.id;
  }

  merged.localId =
    incoming.localId ||
    current.localId ||
    (isTempMessageId(current.id)
      ? current.id
      : isTempMessageId(incoming.id)
        ? incoming.id
        : undefined);
  merged.clientMessageId =
    incoming.clientMessageId || current.clientMessageId || merged.localId;
  merged.stableId =
    current.stableId ||
    incoming.stableId ||
    merged.clientMessageId ||
    merged.localId ||
    merged.id;
  merged.localOrder =
    incoming.localOrder ?? current.localOrder ?? allocateLocalMessageOrder();

  const currentTransport = current.transportStatus;
  const incomingTransport = incoming.transportStatus;
  merged.transportStatus =
    incomingTransport === "synced_stream" ||
    currentTransport === "synced_stream"
      ? "synced_stream"
      : incomingTransport === "acked_transport" ||
          currentTransport === "acked_transport"
        ? "acked_transport"
        : incomingTransport || currentTransport;

  return merged;
};

const dedupeAndSortMessages = (messages: Message[]): Message[] => {
  const deduped: Message[] = [];
  const keyToIndex = new Map<string, number>();

  for (const message of messages) {
    const existingIndex = resolveMessageMatchIndex(
      deduped,
      keyToIndex,
      message,
    );
    if (existingIndex < 0) {
      const nextIndex = deduped.push(message) - 1;
      toMessageIdentityKeys(message).forEach((key) => {
        keyToIndex.set(key, nextIndex);
      });
      continue;
    }

    deduped[existingIndex] = mergeMessageRecords(
      deduped[existingIndex],
      message,
    );
    toMessageIdentityKeys(deduped[existingIndex]).forEach((key) => {
      keyToIndex.set(key, existingIndex);
    });
  }

  return sortMessages(deduped);
};

const upsertMessage = (
  messages: Message[],
  incoming: Message,
): { messages: Message[]; inserted: boolean; mergedMessage: Message } => {
  const current = Array.isArray(messages) ? messages : [];
  const index = findMessageIndex(current, incoming);

  if (index >= 0) {
    const mergedMessage = mergeMessageRecords(current[index], incoming);
    const next = [...current];
    next[index] = mergedMessage;
    return {
      messages: dedupeAndSortMessages(next),
      inserted: false,
      mergedMessage,
    };
  }

  return {
    messages: dedupeAndSortMessages([...current, incoming]),
    inserted: true,
    mergedMessage: incoming,
  };
};

const mergeMessages = (current: Message[], incoming: Message[]): Message[] =>
  dedupeAndSortMessages([
    ...(Array.isArray(current) ? current : []),
    ...(Array.isArray(incoming) ? incoming : []),
  ]);

const findMessageByIdentityIndex = (
  messages: Message[],
  target: Message,
): number =>
  messages.findIndex((item) => {
    if (!item) return false;

    const targetId = typeof target.id === "string" ? target.id : "";
    const targetLocalId =
      typeof target.localId === "string" ? target.localId : "";
    const targetStableId =
      typeof target.stableId === "string" ? target.stableId : "";
    const targetClientMessageId =
      typeof target.clientMessageId === "string" ? target.clientMessageId : "";
    const itemId = typeof item.id === "string" ? item.id : "";
    const itemLocalId = typeof item.localId === "string" ? item.localId : "";
    const itemStableId = typeof item.stableId === "string" ? item.stableId : "";
    const itemClientMessageId =
      typeof item.clientMessageId === "string" ? item.clientMessageId : "";

    return (
      (targetStableId.length > 0 &&
        (itemStableId === targetStableId ||
          itemClientMessageId === targetStableId ||
          itemLocalId === targetStableId)) ||
      (targetClientMessageId.length > 0 &&
        (itemClientMessageId === targetClientMessageId ||
          itemStableId === targetClientMessageId ||
          itemLocalId === targetClientMessageId)) ||
      (targetId.length > 0 &&
        (itemId === targetId || itemLocalId === targetId)) ||
      (targetLocalId.length > 0 &&
        (itemId === targetLocalId || itemLocalId === targetLocalId))
    );
  });

const mergeMessagesAfterCursor = (
  current: Message[],
  incoming: Message[],
): Message[] => {
  const base = Array.isArray(current) ? [...current] : [];
  for (const nextMessage of incoming) {
    const matchIndex = findMessageByIdentityIndex(base, nextMessage);
    if (matchIndex >= 0) {
      base[matchIndex] = mergeMessageRecords(base[matchIndex], nextMessage);
    } else {
      base.push(nextMessage);
    }
  }
  return sortMessages(base);
};

const toMessageSummary = (message: Message): Conversation["lastMessage"] => ({
  id: message.id,
  senderId: message.senderId,
  senderName: message.senderName,
  content: message.content,
  type: message.type,
  isDeleted: message.isDeleted,
  createdAt: message.createdAt,
});

const normalizeMessagesResponse = (
  rawData: unknown,
  responseMeta?: Record<string, unknown> | null,
): { messages: Message[]; hasNext: boolean; hasPrev: boolean } => {
  const getBoolean = (
    source: Record<string, unknown> | null | undefined,
    key: string,
  ): boolean | null => {
    if (!source) return null;
    return typeof source[key] === "boolean" ? (source[key] as boolean) : null;
  };

  const resolveFlags = (
    payloadMeta?: Record<string, unknown> | null,
  ): { hasNext: boolean | null; hasPrev: boolean | null } => {
    const hasNext =
      getBoolean(payloadMeta, "hasNext") ??
      getBoolean(payloadMeta, "hasNextPage") ??
      getBoolean(payloadMeta, "hasMore") ??
      getBoolean(responseMeta, "hasNext") ??
      getBoolean(responseMeta, "hasNextPage") ??
      getBoolean(responseMeta, "hasMore") ??
      null;

    const hasPrev =
      getBoolean(payloadMeta, "hasPrev") ??
      getBoolean(payloadMeta, "hasPrevPage") ??
      getBoolean(payloadMeta, "hasMore") ??
      getBoolean(responseMeta, "hasPrev") ??
      getBoolean(responseMeta, "hasPrevPage") ??
      getBoolean(responseMeta, "hasMore") ??
      null;

    return { hasNext, hasPrev };
  };

  if (Array.isArray(rawData)) {
    const flags = resolveFlags();
    return {
      messages: rawData
        .map((item) => normalizeMessage(item))
        .filter((item): item is Message => item !== null),
      hasNext: flags.hasNext ?? false,
      hasPrev: flags.hasPrev ?? false,
    };
  }

  const payload = asRecord(rawData);
  if (!payload) {
    return { messages: [], hasNext: false, hasPrev: false };
  }

  const rawMessages = Array.isArray(payload.messages)
    ? payload.messages
    : Array.isArray(payload.items)
      ? payload.items
      : [];
  const messages = rawMessages
    .map((item) => normalizeMessage(item))
    .filter((item): item is Message => item !== null);
  const pagination = asRecord(payload.pagination);
  const flags = resolveFlags(payload);

  return {
    messages,
    hasNext:
      flags.hasNext ??
      (typeof pagination?.hasNextPage === "boolean"
        ? Boolean(pagination.hasNextPage)
        : false),
    hasPrev:
      flags.hasPrev ??
      (typeof pagination?.hasPrevPage === "boolean"
        ? Boolean(pagination.hasPrevPage)
        : false),
  };
};

const toAttachmentPayload = (attachments?: Attachment[]) =>
  attachments?.map((attachment) => ({
    id: attachment.id,
    objectKey: attachment.objectKey,
    type: attachment.type,
    ...(attachment.url ? { url: attachment.url } : {}),
    ...(attachment.downloadUrl ? { downloadUrl: attachment.downloadUrl } : {}),
    ...(attachment.expiresAt ? { expiresAt: attachment.expiresAt } : {}),
    fileName: attachment.fileName || "attachment",
    mimeType: attachment.mimeType || "application/octet-stream",
    fileSize:
      typeof attachment.fileSize === "number" && attachment.fileSize >= 0
        ? attachment.fileSize
        : 0,
    ...(typeof attachment.width === "number"
      ? { width: attachment.width }
      : {}),
    ...(typeof attachment.height === "number"
      ? { height: attachment.height }
      : {}),
    ...(typeof attachment.duration === "number"
      ? { duration: attachment.duration }
      : {}),
    ...(attachment.thumbnailUrl
      ? { thumbnailUrl: attachment.thumbnailUrl }
      : {}),
  }));

const resolveSenderIdentity = (): {
  id: string | null;
  senderName: string;
  senderAvatar?: string;
} => {
  const currentUser = useAuthStore.getState().user;
  const senderName =
    `${currentUser?.firstName || ""} ${currentUser?.lastName || ""}`.trim() ||
    currentUser?.username?.trim() ||
    i18n.t("chat:message.you");

  return {
    id: currentUser?.id || null,
    senderName,
    senderAvatar: currentUser?.avatar || undefined,
  };
};

const getReplyToId = (replyTo: Message["replyTo"]): string | undefined => {
  if (!replyTo) return undefined;
  if (typeof replyTo === "string") return replyTo;
  if (typeof (replyTo as { id?: string }).id === "string") {
    return (replyTo as { id: string }).id;
  }
  return undefined;
};

export const useChatStore = create<ChatState>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    setConversations: (conversations) => {
      set({
        conversations: normalizeConversationsPayload(
          Array.isArray(conversations) ? conversations : [],
        ),
      });
    },

    addConversation: (conversation) => {
      const normalized = normalizeConversation(conversation);
      if (!normalized) return;

      set((state) => ({
        conversations: [
          normalized,
          ...(Array.isArray(state.conversations) ? state.conversations : []),
        ].filter(
          (item, index, list) =>
            list.findIndex((candidate) => candidate.id === item.id) === index,
        ),
      }));
    },

    updateConversation: (id, updates) => {
      set((state) => ({
        conversations: (Array.isArray(state.conversations)
          ? state.conversations
          : []
        ).map((conversation) =>
          conversation.id === id
            ? (normalizeConversation({ ...conversation, ...updates }) ?? {
                ...conversation,
                ...updates,
              })
            : conversation,
        ),
      }));
    },

    removeConversation: (id) => {
      roomMessageFetchInFlight.delete(id);
      initialFetchSeqByConversation.delete(id);
      set((state) => ({
        conversations: (Array.isArray(state.conversations)
          ? state.conversations
          : []
        ).filter((conversation) => conversation.id !== id),
        messages: Object.fromEntries(
          Object.entries(state.messages).filter(([key]) => key !== id),
        ),
        messagesHydratedByConversation: Object.fromEntries(
          Object.entries(state.messagesHydratedByConversation).filter(
            ([key]) => key !== id,
          ),
        ),
        hasMoreMessages: Object.fromEntries(
          Object.entries(state.hasMoreMessages).filter(([key]) => key !== id),
        ),
        messageErrors: Object.fromEntries(
          Object.entries(state.messageErrors).filter(([key]) => key !== id),
        ),
        selectedConversationId:
          state.selectedConversationId === id
            ? null
            : state.selectedConversationId,
      }));
    },

    selectConversation: (id) => {
      set({ selectedConversationId: id });
    },

    markAsRead: async (conversationId) => {
      const previousUnreadCount =
        get().conversations.find(
          (conversation) => conversation.id === conversationId,
        )?.unreadCount ?? 0;

      set((state) => ({
        conversations: (Array.isArray(state.conversations)
          ? state.conversations
          : []
        ).map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, unreadCount: 0 }
            : conversation,
        ),
      }));

      try {
        await conversationApi.markAsRead(conversationId);
      } catch (error) {
        set((state) => ({
          conversations: (Array.isArray(state.conversations)
            ? state.conversations
            : []
          ).map((conversation) =>
            conversation.id === conversationId
              ? { ...conversation, unreadCount: previousUnreadCount }
              : conversation,
          ),
        }));
        throw error;
      }
    },

    fetchConversations: async () => {
      set({ isLoadingConversations: true, error: null });

      try {
        const response = await conversationApi.getConversations(1, 100);
        const conversations = normalizeConversationsPayload(
          unwrapApiSuccess(response),
        );
        set({
          conversations,
          isLoadingConversations: false,
        });
      } catch (error: unknown) {
        const apiError = extractApiError(error);
        const errorMessage =
          apiError.message || i18n.t("error:chat.fetchConversationsFailed");
        set({
          error: errorMessage,
          isLoadingConversations: false,
        });
      }
    },

    setMessages: (conversationId, messages) => {
      const normalized = mergeMessages(
        [],
        (Array.isArray(messages) ? messages : [])
          .map((item) => normalizeMessage(item, conversationId))
          .filter((item): item is Message => item !== null),
      );
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: normalized,
        },
        messagesHydratedByConversation: {
          ...state.messagesHydratedByConversation,
          [conversationId]: true,
        },
      }));
    },

    addMessage: (conversationId, message) => {
      const incoming = normalizeMessage(message, conversationId);
      if (!incoming) return;

      set((state) => {
        const currentMessages = state.messages[conversationId] || [];
        const { messages, inserted, mergedMessage } = upsertMessage(
          currentMessages,
          incoming,
        );

        const currentUserId = useAuthStore.getState().user?.id;
        const isOwnMessage =
          !!currentUserId && mergedMessage.senderId === currentUserId;
        const isOpenConversation =
          state.selectedConversationId === conversationId;

        const updatedConversations = state.conversations.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;

          const unreadCount = isOpenConversation
            ? 0
            : inserted && !isOwnMessage
              ? (conversation.unreadCount || 0) + 1
              : conversation.unreadCount;

          const lastMessage = messages[messages.length - 1];
          if (!lastMessage) return { ...conversation, unreadCount };

          return {
            ...conversation,
            unreadCount,
            lastMessage: toMessageSummary(lastMessage),
            updatedAt: lastMessage.createdAt,
          };
        });

        return {
          conversations: updatedConversations,
          messages: {
            ...state.messages,
            [conversationId]: messages,
          },
          messagesHydratedByConversation: {
            ...state.messagesHydratedByConversation,
            [conversationId]: true,
          },
        };
      });
    },

    updateMessage: (conversationId, messageId, updates) => {
      set((state) => {
        const currentMessages = state.messages[conversationId] || [];
        const updatedMessages = dedupeAndSortMessages(
          currentMessages.map((message) =>
            message.id === messageId || message.localId === messageId
              ? ({ ...message, ...updates } as Message)
              : message,
          ),
        );
        const lastMessage = updatedMessages[updatedMessages.length - 1];

        const updatedConversations = state.conversations.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          if (!lastMessage) return conversation;

          const shouldRefreshPreview =
            conversation.lastMessage?.id === messageId ||
            conversation.lastMessage?.id === lastMessage.id;

          return shouldRefreshPreview
            ? {
                ...conversation,
                lastMessage: toMessageSummary(lastMessage),
                updatedAt: lastMessage.createdAt,
              }
            : conversation;
        });

        return {
          conversations: updatedConversations,
          messages: {
            ...state.messages,
            [conversationId]: updatedMessages,
          },
          messagesHydratedByConversation: {
            ...state.messagesHydratedByConversation,
            [conversationId]: true,
          },
        };
      });
    },

    markMessagesReadUpTo: (conversationId, lastMessageId, readerId) => {
      const currentUserId = useAuthStore.getState().user?.id;
      if (!currentUserId) return;
      if (readerId && readerId === currentUserId) return;

      set((state) => {
        const currentMessages = state.messages[conversationId] || [];
        const sortedMessages = sortMessages(currentMessages);
        const boundaryIndex = sortedMessages.findIndex(
          (message) => message.id === lastMessageId,
        );
        const readAt = new Date();

        const updatedMessages = sortedMessages.map((message, index) => {
          if (message.senderId !== currentUserId) return message;
          if (message.status === MessageStatus.READ) return message;

          if (boundaryIndex < 0) {
            return message.id === lastMessageId
              ? { ...message, status: MessageStatus.READ, readAt }
              : message;
          }

          return index <= boundaryIndex
            ? { ...message, status: MessageStatus.READ, readAt }
            : message;
        });

        return {
          messages: {
            ...state.messages,
            [conversationId]: updatedMessages,
          },
          messagesHydratedByConversation: {
            ...state.messagesHydratedByConversation,
            [conversationId]: true,
          },
        };
      });
    },

    removeMessage: (conversationId, messageId) => {
      set((state) => {
        const updatedMessages = (state.messages[conversationId] || []).filter(
          (message) =>
            message.id !== messageId && message.localId !== messageId,
        );
        const lastMessage = updatedMessages[updatedMessages.length - 1];

        const updatedConversations = state.conversations.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;

          return {
            ...conversation,
            lastMessage: lastMessage
              ? toMessageSummary(lastMessage)
              : conversation.lastMessage,
            updatedAt: lastMessage?.createdAt || conversation.updatedAt,
          };
        });

        return {
          conversations: updatedConversations,
          messages: {
            ...state.messages,
            [conversationId]: updatedMessages,
          },
          messagesHydratedByConversation: {
            ...state.messagesHydratedByConversation,
            [conversationId]: true,
          },
        };
      });
    },

    fetchMessages: async (conversationId, before, after, options) => {
      const isInitialFetch = !before && !after;
      const forceRefresh = options?.force === true;
      if (
        isInitialFetch &&
        !forceRefresh &&
        get().messagesHydratedByConversation[conversationId]
      ) {
        return {
          loaded: 0,
          hasMore: get().hasMoreMessages[conversationId] ?? false,
        };
      }

      const currentInFlight = roomMessageFetchInFlight.get(conversationId) ?? 0;
      roomMessageFetchInFlight.set(conversationId, currentInFlight + 1);
      const initialFetchSeq = isInitialFetch
        ? (initialFetchSeqByConversation.get(conversationId) ?? 0) + 1
        : null;

      if (initialFetchSeq !== null) {
        initialFetchSeqByConversation.set(conversationId, initialFetchSeq);
      }

      set((state) => ({
        ...buildLoadingStateFromInFlightMap(),
        error: null,
        messageErrors: {
          ...state.messageErrors,
          [conversationId]: null,
        },
      }));

      try {
        const limit =
          typeof options?.limit === "number" &&
          Number.isFinite(options.limit) &&
          options.limit > 0
            ? Math.min(100, Math.floor(options.limit))
            : 50;
        const beforeId = asStringValue(options?.beforeId);
        const afterId = asStringValue(options?.afterId);
        const params = new URLSearchParams({ limit: String(limit) });
        if (before) params.set("before", before);
        if (beforeId) params.set("beforeId", beforeId);
        if (after) params.set("after", after);
        if (afterId) params.set("afterId", afterId);

        const response = await messageApi.getMessages(conversationId, {
          limit,
          ...(before ? { before } : {}),
          ...(beforeId ? { beforeId } : {}),
          ...(after ? { after } : {}),
          ...(afterId ? { afterId } : {}),
        });
        const responseEnvelope = asRecord(response);
        const responseMeta = asRecord(responseEnvelope?.meta);
        const payload = unwrapApiSuccess(response);
        let normalized = normalizeMessagesResponse(payload, responseMeta);

        if (
          after &&
          !afterId &&
          Array.isArray(normalized.messages) &&
          normalized.messages.length === 0
        ) {
          try {
            const parsedAfter = Date.parse(after);
            if (!Number.isNaN(parsedAfter)) {
              const earlierTs = Math.max(0, parsedAfter - 1);
              const earlier = new Date(earlierTs).toISOString();
              const retryResp = await messageApi.getMessages(conversationId, {
                limit,
                after: earlier,
              });
              const retryPayload = unwrapApiSuccess(retryResp);
              const retryMeta = asRecord(asRecord(retryResp)?.meta) ?? responseMeta;
              const retryNormalized = normalizeMessagesResponse(
                retryPayload,
                retryMeta,
              );
              if (
                Array.isArray(retryNormalized.messages) &&
                retryNormalized.messages.length > 0
              ) {
                normalized = retryNormalized;
              }
            }
          } catch {
            // ignore retry errors
          }
        }
        const hasMoreForDirection = after
          ? normalized.hasNext
          : normalized.hasPrev;

        if (
          isMessageDebugEnabled() &&
          isInitialFetch &&
          normalized.messages.length > 0
        ) {
          // eslint-disable-next-line no-debugger
          debugger;
        }

        set((state) => {
          if (
            initialFetchSeq !== null &&
            initialFetchSeqByConversation.get(conversationId) !==
              initialFetchSeq
          ) {
            return state;
          }

          const existingMessages = state.messages[conversationId] || [];
          const mergedMessages =
            after && !before
              ? mergeMessagesAfterCursor(existingMessages, normalized.messages)
              : mergeMessages(existingMessages, normalized.messages);
          const latestMessage = mergedMessages[mergedMessages.length - 1];

          const updatedConversations = state.conversations.map(
            (conversation) => {
              if (conversation.id !== conversationId || !latestMessage) {
                return conversation;
              }

              return {
                ...conversation,
                lastMessage: toMessageSummary(latestMessage),
                updatedAt: latestMessage.createdAt,
                unreadCount:
                  state.selectedConversationId === conversationId
                    ? 0
                    : conversation.unreadCount,
              };
            },
          );

          return {
            conversations: updatedConversations,
            messages: {
              ...state.messages,
              [conversationId]: mergedMessages,
            },
            messagesHydratedByConversation: {
              ...state.messagesHydratedByConversation,
              [conversationId]: true,
            },
            hasMoreMessages: {
              ...state.hasMoreMessages,
              [conversationId]:
                before || (!before && !after)
                  ? normalized.hasPrev
                  : (state.hasMoreMessages[conversationId] ?? false),
            },
          };
        });

        return {
          loaded: normalized.messages.length,
          hasMore: hasMoreForDirection,
        };
      } catch (error: unknown) {
        const apiError = extractApiError(error);
        const errorMessage =
          apiError.message || i18n.t("error:chat.fetchMessagesFailed");
        set((state) => ({
          error: errorMessage,
          messageErrors: {
            ...state.messageErrors,
            [conversationId]: errorMessage,
          },
        }));
        return { loaded: 0, hasMore: false };
      } finally {
        const nextInFlight = Math.max(
          0,
          (roomMessageFetchInFlight.get(conversationId) ?? 1) - 1,
        );
        if (nextInFlight === 0) {
          roomMessageFetchInFlight.delete(conversationId);
        } else {
          roomMessageFetchInFlight.set(conversationId, nextInFlight);
        }

        set(buildLoadingStateFromInFlightMap());
      }
    },

    sendMessage: async (
      conversationId,
      content,
      type = MessageType.TEXT,
      fileMeta,
      replyToId,
      replyToSnapshot,
    ) => {
      const text = content.trim();
      // Normalise fileMeta to an array (or undefined)
      const fileMetaArr: Attachment[] | undefined = fileMeta
        ? Array.isArray(fileMeta)
          ? fileMeta
          : [fileMeta]
        : undefined;
      const firstFileName = fileMetaArr?.[0]?.fileName;
      const messageContent = text || firstFileName || "";
      if (!messageContent) return;

      const sender = resolveSenderIdentity();

      const localOrder = allocateLocalMessageOrder();
      const clientMessageId = `client-${conversationId}-${localOrder}`;
      const tempId = `temp-${Date.now()}-${Math.random()}`;
      const tempMessage: Message = {
        id: tempId,
        stableId: clientMessageId,
        clientMessageId,
        localId: tempId,
        localOrder,
        transportStatus: "optimistic",
        conversationId,
        senderId: sender.id || "current-user",
        senderName: sender.senderName,
        senderAvatar: sender.senderAvatar,
        content: messageContent,
        type,
        status: MessageStatus.SENDING,
        isEdited: false,
        isPinned: false,
        isDeleted: false,
        isSystem: false,
        createdAt: new Date(),
        ...(replyToId ? { replyTo: replyToId } : {}),
        ...(replyToSnapshot
          ? { replyToMessage: createReplySnapshot(replyToSnapshot) }
          : {}),
        ...(fileMetaArr?.length ? { attachments: fileMetaArr } : {}),
      };

      get().addMessage(conversationId, tempMessage);

      try {
        const attachments = fileMetaArr
          ? toAttachmentPayload(fileMetaArr)
          : undefined;
        const response = await messageApi.sendMessage(conversationId, {
          content: messageContent,
          type,
          senderName: sender.senderName,
          ...(sender.senderAvatar
            ? { senderAvatar: sender.senderAvatar }
            : {}),
          ...(replyToId ? { replyToId } : {}),
          ...(attachments?.length ? { attachments } : {}),
        });
        const message = normalizeMessage(
          unwrapApiSuccess(response),
          conversationId,
        );
        if (!message) {
          throw new Error(i18n.t("error:chat.invalidSendResponse"));
        }

        get().addMessage(conversationId, {
          ...message,
          stableId: clientMessageId,
          clientMessageId,
          localId: tempId,
          localOrder,
          transportStatus:
            message.serverSeq !== undefined
              ? "synced_stream"
              : "acked_transport",
          status: message.status || MessageStatus.SENT,
        });
      } catch (error) {
        get().updateMessage(conversationId, tempId, {
          status: MessageStatus.FAILED,
        });
        throw error;
      }
    },

    resendMessage: async (conversationId: string, message: Message) => {
      get().updateMessage(conversationId, message.id, {
        status: MessageStatus.SENDING,
      });

      const replyToId = getReplyToId(message.replyTo);
      const attachments = toAttachmentPayload(message.attachments);
      const sender = resolveSenderIdentity();
      const senderName = message.senderName?.trim() || sender.senderName;
      const senderAvatar = message.senderAvatar || sender.senderAvatar;

      try {
        const response = await messageApi.sendMessage(conversationId, {
          content: message.content,
          type: message.type,
          senderName,
          ...(senderAvatar ? { senderAvatar } : {}),
          ...(replyToId ? { replyToId } : {}),
          ...(attachments?.length ? { attachments } : {}),
        });
        const resentMessage = normalizeMessage(
          unwrapApiSuccess(response),
          conversationId,
        );
        if (!resentMessage) {
          throw new Error(i18n.t("error:chat.invalidResendResponse"));
        }

        get().addMessage(conversationId, {
          ...resentMessage,
          stableId:
            message.stableId ||
            message.clientMessageId ||
            message.localId ||
            message.id,
          clientMessageId:
            message.clientMessageId || message.localId || message.id,
          localId: message.localId || message.id,
          localOrder: message.localOrder,
          transportStatus:
            resentMessage.serverSeq !== undefined
              ? "synced_stream"
              : "acked_transport",
          status: resentMessage.status || MessageStatus.SENT,
        });
        toast.success(i18n.t("chat:toast.resendSuccess"));
      } catch {
        get().updateMessage(conversationId, message.id, {
          status: MessageStatus.FAILED,
        });
        toast.error(i18n.t("chat:toast.resendFailed"));
      }
    },

    setTyping: (status) => {
      set((state) => {
        const exists = state.typingStatuses.some(
          (typing) =>
            typing.conversationId === status.conversationId &&
            typing.userId === status.userId,
        );

        if (exists) {
          return {
            typingStatuses: state.typingStatuses.map((typing) =>
              typing.conversationId === status.conversationId &&
              typing.userId === status.userId
                ? status
                : typing,
            ),
          };
        }

        return {
          typingStatuses: [...state.typingStatuses, status],
        };
      });
    },

    clearTyping: (conversationId, userId) => {
      set((state) => ({
        typingStatuses: state.typingStatuses.filter(
          (typing) =>
            !(
              typing.conversationId === conversationId &&
              typing.userId === userId
            ),
        ),
      }));
    },

    setSearchQuery: (query) => {
      set({ searchQuery: query });
    },

    setActiveFilter: (filter) => {
      set({ activeFilter: filter });
    },

    clearError: () => set({ error: null }),

    reset: () => {
      roomMessageFetchInFlight.clear();
      initialFetchSeqByConversation.clear();
      set(initialState);
    },
  })),
);

export const useSelectedConversation = () => {
  return useChatStore((state) => {
    if (!state.selectedConversationId) return null;
    const conversations = Array.isArray(state.conversations)
      ? state.conversations
      : [];
    return conversations.find((c) => c.id === state.selectedConversationId);
  });
};

export const useCurrentTypingStatus = () => {
  return useChatStore((state) => {
    if (!state.selectedConversationId) return null;
    const priority = {
      recording: 3,
      uploading: 2,
      typing: 1,
      online: 0,
    } as const;
    return state.typingStatuses
      .filter(
        (typing) =>
          typing.conversationId === state.selectedConversationId &&
          typing.isTyping,
      )
      .sort((a, b) => {
        const priorityDiff =
          (priority[b.activity || "typing"] ?? 1) -
          (priority[a.activity || "typing"] ?? 1);
        if (priorityDiff !== 0) return priorityDiff;
        return (b.confidence ?? 0) - (a.confidence ?? 0);
      })[0];
  });
};

export const useFilteredConversations = () => {
  return useChatStore((state) => {
    let filtered = Array.isArray(state.conversations)
      ? state.conversations
      : [];

    switch (state.activeFilter) {
      case "unread":
        filtered = filtered.filter(
          (conversation) => conversation.unreadCount > 0,
        );
        break;
      case "groups":
        filtered = filtered.filter(
          (conversation) =>
            normalizeRoomType(
              conversation.type,
              conversation.participants?.length,
            ) === "group",
        );
        break;
      case "channels":
        filtered = filtered.filter(
          (conversation) =>
            normalizeRoomType(
              conversation.type,
              conversation.participants?.length,
            ) === "channel",
        );
        break;
    }

    if (state.searchQuery.trim()) {
      const query = state.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (conversation) =>
          conversation.name?.toLowerCase().includes(query) ||
          conversation.displayName?.toLowerCase().includes(query) ||
          conversation.lastMessage?.content?.toLowerCase().includes(query),
      );
    }

    const currentUser = useAuthStore.getState().user;
    const currentDisplayName = currentUser
      ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim() ||
        currentUser.username
      : undefined;
    return rankConversations(filtered, {
      currentUserId: currentUser?.id,
      currentUsername: currentUser?.username,
      currentDisplayName,
      activeConversationId: state.selectedConversationId,
    });
  });
};

export const useTotalUnreadCount = () => {
  return useChatStore((state) =>
    (Array.isArray(state.conversations) ? state.conversations : []).reduce(
      (sum, conversation) => sum + (conversation.unreadCount || 0),
      0,
    ),
  );
};

export const useCurrentMessages = () =>
  useChatStore((state) => {
    const id = state.selectedConversationId;
    if (!id) return EMPTY_MESSAGES;
    return state.messages[id] || EMPTY_MESSAGES;
  });

export const useMessagesByConversation = (conversationId: string | null) =>
  useChatStore((state) => {
    if (!conversationId) return EMPTY_MESSAGES;
    return state.messages[conversationId] || EMPTY_MESSAGES;
  });
