/**
 * @fileoverview Chat store (Zustand)
 */

import axios from "axios";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";
import { getSocket } from "../lib/socket";
import {
  normalizeConversation,
  normalizeConversationsPayload,
  normalizeRoomType,
} from "../lib/conversationAdapter";
import {
  buildMessageCorrelationKey,
  generateClientMessageId,
  generateTempMessageId,
  getMessageIdentityKey,
} from "../utils/messageIdentity";
import { logMessageDebug } from "../utils/messageDebug";
import { createReplySnapshot } from "../utils/messageTimeline";
import {
  compareConversationsByActivity,
  sortConversationsByActivity,
} from "../utils/conversationRanking";
import { resolveUserDisplayName } from "../features/chat/identity/resolveUserDisplayName";
import i18n from "../i18n";
import { useAuthStore } from "./authStore";
import { registerStoreResetter } from "./storeResetRegistry";
import { conversationApi, messageApi } from "../services/api";
import type {
  Conversation,
  Message,
  TypingStatus,
  ConversationFilter,
  SendMessageResult,
  SendRestriction,
} from "../types";
import { MessageType, MessageStatus } from "../types";
import type { Attachment } from "../types";

interface ChatState {
  conversations: Conversation[];
  conversationById: Record<string, Conversation>;
  orderedConversationIds: string[];
  totalUnreadCount: number;
  lastUnreadSummaryAppliedAt: number | null;
  lastConversationCursor: string | null;
  lastConversationUpdatedAfterCursor: string | null;
  messages: Record<string, Message[]>;
  messageById: Record<string, Message>;
  messageIdsByConversation: Record<string, string[]>;
  messageAliasIndexByConversation: Record<string, Record<string, string>>;
  messagesHydratedByConversation: Record<string, boolean>;
  selectedConversationId: string | null;
  typingStatuses: TypingStatus[];
  searchQuery: string;
  activeFilter: ConversationFilter;
  isLoadingConversations: boolean;
  hasFetchedConversationsOnce: boolean;
  conversationsError: string | null;
  isLoadingMessages: boolean;
  isLoadingMessagesByConversation: Record<string, boolean>;
  hasMoreMessages: Record<string, boolean>;
  hasNewerMessagesByConversation: Record<string, boolean>;
  outboxByConversation: Record<string, string[]>;
  sendRestrictionsByConversation: Record<string, SendRestriction | undefined>;
  messageErrors: Record<string, string | null>;
  error: string | null;

  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  upsertConversationSummary: (
    conversation: Conversation,
  ) => {
    applied: boolean;
    gapDetected: boolean;
    previousVersion: number;
    nextVersion: number;
    reason?: "inserted" | "updated" | "stale_version" | "stale_timestamp";
  };
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  removeConversation: (id: string) => void;
  selectConversation: (id: string | null) => void;
  markAsRead: (
    conversationId: string,
    lastVisibleMessageId?: string,
  ) => Promise<void>;
  applyUnreadSummary: (
    summary: {
      totalUnreadCount: number;
      conversations: Array<{
        conversationId: string;
        unreadCount: number;
        lastReadMessageId: string | null;
        lastReadAt: string | null;
      }>;
    },
    options?: {
      requestedAtMs?: number;
      appliedAtMs?: number;
      source?: "snapshot" | "cross_tab";
    },
  ) => void;
  applyIncomingConversationMessage: (
    conversationId: string,
    message: Message,
    options?: {
      incrementUnread?: boolean;
    },
  ) => void;
  ingestConversationMessageEvent: (
    conversationId: string,
    message: Message | Message[],
    options?: {
      incrementUnread?: boolean;
      hydrated?: boolean;
      source?: string;
    },
  ) => {
    status: "new" | "merged" | "ignored";
    canonicalMessage: Message | null;
    mergedMessage: Message | null;
    unreadDelta: number;
  };
  applyOptimisticConversationRead: (
    conversationId: string,
    lastReadMessageId: string,
    options?: {
      readAt?: Date | string | null;
    },
  ) => void;
  fetchConversations: () => Promise<void>;

  ingestMessages: (
    conversationId: string,
    messages: Message | Message[],
    options?: {
      mode?: "replace" | "prepend" | "append" | "upsert";
      preserveMessagesCreatedAfter?: Date;
      hydrated?: boolean;
      hasNewer?: boolean;
      source?: string;
    },
  ) => void;
  setMessages: (conversationId: string, messages: Message[]) => void;
  addMessage: (conversationId: string, message: Message) => void;
  ackOutgoingMessage: (
    conversationId: string,
    clientMessageId: string,
    serverMessage: Message,
  ) => void;
  failOutgoingMessage: (
    conversationId: string,
    clientMessageId: string,
    updates: Partial<Message>,
  ) => void;
  removeMessageAlias: (conversationId: string, identity: string) => void;
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
  ) => Promise<SendMessageResult>;
  resendMessage: (
    conversationId: string,
    message: Message,
  ) => Promise<SendMessageResult>;
  flushQueuedMessages: (conversationId?: string) => Promise<void>;
  setSendRestriction: (
    conversationId: string,
    restriction: SendRestriction,
  ) => void;
  clearSendRestriction: (conversationId: string) => void;

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
  hasNext: boolean;
  hasPrev: boolean;
  mode: "initial" | "older" | "newer";
  applied: boolean;
}

interface FetchMessagesOptions {
  force?: boolean;
  limit?: number;
  beforeId?: string;
  afterId?: string;
  syncReason?: "initial-sync" | "reconnect" | "room-refresh";
}

const initialState = {
  conversations: [],
  conversationById: {},
  orderedConversationIds: [],
  totalUnreadCount: 0,
  lastUnreadSummaryAppliedAt: null,
  lastConversationCursor: null,
  lastConversationUpdatedAfterCursor: null,
  messages: {},
  messageById: {},
  messageIdsByConversation: {},
  messageAliasIndexByConversation: {},
  messagesHydratedByConversation: {},
  selectedConversationId: null,
  typingStatuses: [],
  searchQuery: "",
  activeFilter: "all" as ConversationFilter,
  isLoadingConversations: false,
  hasFetchedConversationsOnce: false,
  conversationsError: null,
  isLoadingMessages: false,
  isLoadingMessagesByConversation: {},
  hasMoreMessages: {},
  hasNewerMessagesByConversation: {},
  outboxByConversation: {},
  sendRestrictionsByConversation: {},
  messageErrors: {},
  error: null,
};

const EMPTY_MESSAGES: Message[] = [];

const roomMessageFetchInFlight = new Map<string, number>();
const initialFetchSeqByConversation = new Map<string, number>();
const messageFetchGenerationByConversation = new Map<string, number>();
const markAsReadInFlight = new Map<
  string,
  {
    promise: Promise<void>;
    anchorId?: string;
    queuedAnchorId?: string;
  }
>();
let conversationsFetchPromise: Promise<void> | null = null;
const pendingMessageSendTimeouts = new Map<
  string,
  ReturnType<typeof setTimeout>
>();
const MESSAGE_SEND_TIMEOUT_MS = 25_000;
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

const asStringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const asNumberValue = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const getCorrelationKeyForMessage = (
  message: Pick<
    Message,
    "conversationId" | "clientMessageId" | "localId" | "id"
  >,
): string =>
  buildMessageCorrelationKey({
    conversationId: message.conversationId,
    clientMessageId: message.clientMessageId,
    tempId: message.localId || message.id,
    localId: message.localId,
  });

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
  const metadata = asRecord(source.metadata);
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
  const resolvedSenderDisplayName = resolveUserDisplayName(
    {
      ...(sender || {}),
      ...(source as Record<string, unknown>),
      id: senderId,
      username:
        asStringValue(source.username) ?? asStringValue(sender?.username),
      displayName:
        asStringValue(source.displayName) ?? asStringValue(sender?.displayName),
    },
    { allowLegacyFallback: true },
  );
  const senderName =
    (asStringValue(source.senderName) ?? resolvedSenderDisplayName) ||
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
    asStringValue(metadata?.clientMessageId) ??
    asStringValue(metadata?.client_message_id) ??
    asStringValue(source.tempId) ??
    asStringValue(metadata?.tempId) ??
    asStringValue(source.localId);
  const stableId =
    asStringValue(source.stableId) ??
    clientMessageId ??
    asStringValue(source.localId) ??
    asStringValue(metadata?.localId) ??
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
  const version =
    asNumberValue(source.version) ??
    asNumberValue(source.messageVersion) ??
    asNumberValue(metadata?.version) ??
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

    return serverSeq !== undefined
      ? ("synced_stream" as const)
      : ("acked_transport" as const);
  })();
  const explicitSendState =
    asStringValue(source.sendState) ?? asStringValue(source.send_state);
  const sendState = (() => {
    if (
      explicitSendState === "queued" ||
      explicitSendState === "sending" ||
      explicitSendState === "retrying" ||
      explicitSendState === "sent" ||
      explicitSendState === "failed"
    ) {
      return explicitSendState;
    }

    if (status === MessageStatus.FAILED) {
      return "failed" as const;
    }

    if (status === MessageStatus.SENDING || id.startsWith("temp-")) {
      return "sending" as const;
    }

    return "sent" as const;
  })();
  const queuedReason = (() => {
    const value =
      asStringValue(source.queuedReason) ?? asStringValue(source.queued_reason);
    if (
      value === "offline" ||
      value === "reconnecting" ||
      value === "manual_retry"
    ) {
      return value;
    }
    return undefined;
  })();
  const failureReason = (() => {
    const value =
      asStringValue(source.failureReason) ??
      asStringValue(source.failure_reason);
    if (
      value === "network" ||
      value === "timeout" ||
      value === "permission" ||
      value === "slow_mode" ||
      value === "backend_4xx" ||
      value === "backend_5xx" ||
      value === "server" ||
      value === "unknown"
    ) {
      return value;
    }
    return undefined;
  })();

  return {
    id,
    stableId,
    clientMessageId,
    version,
    localId:
      asStringValue(source.localId) ??
      asStringValue(metadata?.localId) ??
      asStringValue(source.tempId) ??
      asStringValue(metadata?.tempId),
    serverSeq,
    serverTs: serverTs ? toDateObject(serverTs) : undefined,
    localOrder,
    transportStatus,
    sendState,
    queuedReason,
    failureReason,
    errorCode:
      asStringValue(source.errorCode) ?? asStringValue(source.error_code),
    errorMessage:
      asStringValue(source.errorMessage) ?? asStringValue(source.error_message),
    sendAttempts:
      asNumberValue(source.sendAttempts) ?? asNumberValue(source.send_attempts),
    lastSendAttemptAt: source.lastSendAttemptAt
      ? toDateObject(source.lastSendAttemptAt)
      : source.last_send_attempt_at
        ? toDateObject(source.last_send_attempt_at)
        : undefined,
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

const toConversationVersion = (conversation: Conversation | null | undefined) =>
  typeof conversation?.summaryVersion === "number" &&
  Number.isFinite(conversation.summaryVersion)
    ? conversation.summaryVersion
    : 0;

const getConversationCursorTimestamp = (
  conversation: Conversation | null | undefined,
): number => {
  if (!conversation) return 0;

  const canonicalTimestamp = Math.max(
    toDateValue(conversation.lastMessageSortAt),
    toDateValue(conversation.lastActivityAt),
    toDateValue(conversation.lastMessageAt),
    toDateValue(conversation.lastMessage?.createdAt),
  );

  if (canonicalTimestamp > 0) {
    return canonicalTimestamp;
  }

  return toDateValue(conversation.updatedAt);
};

const getConversationCursorIdentity = (
  conversation: Conversation | null | undefined,
): string => {
  if (!conversation) return "unknown";

  return [
    String(getConversationCursorTimestamp(conversation)),
    String(toConversationVersion(conversation)),
    conversation.id,
    conversation.lastMessageId ?? conversation.lastMessage?.id ?? "no-message",
  ].join(":");
};

const computeConversationCursor = (conversations: Conversation[]): string | null => {
  const leadingConversation = Array.isArray(conversations)
    ? conversations[0]
    : null;
  if (!leadingConversation) {
    return null;
  }

  return getConversationCursorIdentity(leadingConversation);
};

const computeConversationUpdatedAfterCursor = (
  conversations: Conversation[],
): string | null => {
  let latestTimestamp = 0;

  (Array.isArray(conversations) ? conversations : []).forEach((conversation) => {
    latestTimestamp = Math.max(
      latestTimestamp,
      getConversationCursorTimestamp(conversation),
    );
  });

  return latestTimestamp > 0 ? new Date(latestTimestamp).toISOString() : null;
};

const computeCanonicalTotalUnreadCount = (conversations: Conversation[]): number =>
  (Array.isArray(conversations) ? conversations : []).reduce(
    (sum, conversation) => sum + Math.max(0, conversation.unreadCount || 0),
    0,
  );

const buildConversationIndexState = (conversations: Conversation[]) => {
  const ordered = Array.isArray(conversations) ? conversations : [];
  return {
    conversationById: ordered.reduce<Record<string, Conversation>>(
      (accumulator, conversation) => {
        accumulator[conversation.id] = conversation;
        return accumulator;
      },
      {},
    ),
    orderedConversationIds: ordered.map((conversation) => conversation.id),
  };
};

const buildConversationCollectionState = (conversations: Conversation[]) => ({
  ...buildConversationIndexState(conversations),
  totalUnreadCount: computeCanonicalTotalUnreadCount(conversations),
  lastConversationCursor: computeConversationCursor(conversations),
  lastConversationUpdatedAfterCursor:
    computeConversationUpdatedAfterCursor(conversations),
});

const buildConversationMessageIndexState = (
  state: Pick<ChatState, "messageById" | "messageIdsByConversation">,
  conversationId: string,
  nextMessages: Message[],
) => {
  const previousIds = state.messageIdsByConversation[conversationId] ?? [];
  const nextIds = nextMessages.map((message) => getStableMessageId(message));
  const nextIdSet = new Set(nextIds);
  const nextMessageById = { ...state.messageById };

  previousIds.forEach((messageId) => {
    if (!nextIdSet.has(messageId)) {
      delete nextMessageById[messageId];
    }
  });

  nextMessages.forEach((message) => {
    nextMessageById[getStableMessageId(message)] = message;
  });

  return {
    messageById: nextMessageById,
    messageIdsByConversation: {
      ...state.messageIdsByConversation,
      [conversationId]: nextIds,
    },
  };
};

const replaceConversationInActivityOrder = (
  conversations: Conversation[],
  nextConversation: Conversation,
): Conversation[] => {
  const next = (Array.isArray(conversations) ? conversations : []).filter(
    (conversation) => conversation.id !== nextConversation.id,
  );
  const insertIndex = next.findIndex(
    (conversation) =>
      compareConversationsByActivity(nextConversation, conversation) < 0,
  );
  if (insertIndex < 0) {
    next.push(nextConversation);
    return next;
  }

  next.splice(insertIndex, 0, nextConversation);
  return next;
};

const shouldApplyConversationSummary = (
  current: Conversation | null | undefined,
  incoming: Conversation,
): {
  apply: boolean;
  gapDetected: boolean;
  previousVersion: number;
  nextVersion: number;
  reason?: "inserted" | "updated" | "stale_version" | "stale_timestamp";
} => {
  const previousVersion = toConversationVersion(current);
  const nextVersion = toConversationVersion(incoming);

  if (!current) {
    return {
      apply: true,
      gapDetected: false,
      previousVersion: 0,
      nextVersion,
      reason: "inserted",
    };
  }

  if (
    previousVersion > 0 &&
    nextVersion > 0 &&
    nextVersion < previousVersion
  ) {
    return {
      apply: false,
      gapDetected: false,
      previousVersion,
      nextVersion,
      reason: "stale_version",
    };
  }

  const currentTs = getConversationCursorTimestamp(current);
  const incomingTs = getConversationCursorTimestamp(incoming);
  if (nextVersion === previousVersion && incomingTs > 0 && incomingTs < currentTs) {
    return {
      apply: false,
      gapDetected: false,
      previousVersion,
      nextVersion,
      reason: "stale_timestamp",
    };
  }

  return {
    apply: true,
    gapDetected:
      previousVersion > 0 && nextVersion > 0 && nextVersion > previousVersion + 1,
    previousVersion,
    nextVersion,
    reason: "updated",
  };
};

const mergeConversationSummary = (
  current: Conversation | null | undefined,
  incoming: Conversation,
): Conversation => {
  if (!current) {
    return incoming;
  }

  return (normalizeConversation({
    ...current,
    ...incoming,
    unreadCount: incoming.unreadCount,
    lastReadMessageId:
      incoming.lastReadMessageId ?? current.lastReadMessageId ?? undefined,
    lastReadAt: incoming.lastReadAt ?? current.lastReadAt ?? undefined,
    firstUnreadMessageId:
      incoming.firstUnreadMessageId ?? current.firstUnreadMessageId ?? undefined,
    firstUnreadMessageAt:
      incoming.firstUnreadMessageAt ?? current.firstUnreadMessageAt ?? undefined,
    summaryVersion:
      toConversationVersion(incoming) || toConversationVersion(current) || undefined,
  }) ?? {
    ...current,
    ...incoming,
  }) as Conversation;
};

const mergeConversationCollections = (
  conversations: Conversation[] | null | undefined,
): Conversation[] => {
  const mergedById = new Map<string, Conversation>();

  (Array.isArray(conversations) ? conversations : []).forEach((conversation) => {
    const normalized = normalizeConversation(conversation);
    if (!normalized) {
      return;
    }

    const existing = mergedById.get(normalized.id);
    if (!existing) {
      mergedById.set(normalized.id, normalized);
      return;
    }

    const decision = shouldApplyConversationSummary(existing, normalized);
    if (!decision.apply) {
      return;
    }

    mergedById.set(normalized.id, mergeConversationSummary(existing, normalized));
  });

  return sortConversationsByActivity(Array.from(mergedById.values()));
};

const updateConversationActivitySummary = (
  conversation: Conversation,
  message: Message,
  unreadCount: number,
): Conversation =>
  (normalizeConversation({
    ...conversation,
    unreadCount,
    lastMessage: toMessageSummary(message),
    updatedAt: message.createdAt,
    lastMessageAt: message.createdAt,
    lastMessageSortAt: message.createdAt,
    lastMessageId: message.id,
    lastMessageStatus:
      message.sendState === "failed" || message.status === MessageStatus.FAILED
        ? "failed"
        : "sent",
    lastActivityAt: message.createdAt,
  }) ?? {
    ...conversation,
    unreadCount,
    lastMessage: toMessageSummary(message),
    updatedAt: new Date(message.createdAt),
  }) as Conversation;

const updateConversationReadProgress = (
  conversation: Conversation,
  lastReadMessageId: string,
  readAt?: Date | string | null,
): Conversation =>
  (normalizeConversation({
    ...conversation,
    unreadCount: 0,
    lastReadMessageId,
    lastReadAt: readAt ?? new Date().toISOString(),
    firstUnreadMessageId: null,
    firstUnreadMessageAt: null,
  }) ?? {
    ...conversation,
    unreadCount: 0,
    lastReadMessageId,
    lastReadAt: readAt ?? new Date().toISOString(),
    firstUnreadMessageId: null,
    firstUnreadMessageAt: null,
  }) as Conversation;

const applyConversationReadState = (
  conversation: Conversation,
  readState: {
    unreadCount: number;
    lastReadMessageId: string | null;
    lastReadAt: string | null;
    firstUnreadMessageId?: string | null;
    firstUnreadMessageAt?: string | null;
  },
): Conversation =>
  (normalizeConversation({
    ...conversation,
    unreadCount: Math.max(0, readState.unreadCount ?? conversation.unreadCount ?? 0),
    lastReadMessageId:
      readState.lastReadMessageId ?? conversation.lastReadMessageId ?? undefined,
    lastReadAt: readState.lastReadAt ?? conversation.lastReadAt ?? undefined,
    firstUnreadMessageId:
      readState.firstUnreadMessageId ?? (readState.unreadCount > 0
        ? conversation.firstUnreadMessageId ?? undefined
        : null),
    firstUnreadMessageAt:
      readState.firstUnreadMessageAt ?? (readState.unreadCount > 0
        ? conversation.firstUnreadMessageAt ?? undefined
        : null),
  }) ?? {
    ...conversation,
    unreadCount: Math.max(0, readState.unreadCount ?? conversation.unreadCount ?? 0),
    lastReadMessageId:
      readState.lastReadMessageId ?? conversation.lastReadMessageId ?? null,
    lastReadAt: readState.lastReadAt ?? conversation.lastReadAt ?? null,
    firstUnreadMessageId:
      readState.firstUnreadMessageId ?? (readState.unreadCount > 0
        ? conversation.firstUnreadMessageId ?? null
        : null),
    firstUnreadMessageAt:
      readState.firstUnreadMessageAt ?? (readState.unreadCount > 0
        ? conversation.firstUnreadMessageAt ?? null
        : null),
  }) as Conversation;

const getStableMessageId = (message: Message): string =>
  getMessageIdentityKey(message);

const getMessageAliasCandidates = (
  message: Pick<Message, "id" | "localId" | "clientMessageId" | "stableId">,
): string[] =>
  Array.from(
    new Set(
      [
        message.id,
        message.localId,
        message.clientMessageId,
        message.stableId,
      ].filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );

const rebuildConversationMessageAliasIndex = (
  messages: Message[],
): Record<string, string> => {
  const aliasIndex: Record<string, string> = {};

  messages.forEach((message) => {
    const canonicalId = getStableMessageId(message);
    getMessageAliasCandidates(message).forEach((alias) => {
      aliasIndex[alias] = canonicalId;
    });
  });

  return aliasIndex;
};

const resolveCanonicalMessageIdentity = (
  conversationMessages: Message[],
  aliasIndex: Record<string, string> | undefined,
  identity: string,
): string => {
  if (!identity) return identity;

  const aliasedIdentity = aliasIndex?.[identity];
  if (aliasedIdentity) {
    return aliasedIdentity;
  }

  const matchedMessage = conversationMessages.find((message) =>
    matchesMessageIdentityValue(message, identity),
  );
  return matchedMessage ? getStableMessageId(matchedMessage) : identity;
};

const matchesMessageIdentityValue = (
  message: Pick<Message, "id" | "localId" | "clientMessageId" | "stableId">,
  identity: string,
): boolean => {
  if (!identity) return false;

  return (
    message.id === identity ||
    message.localId === identity ||
    message.clientMessageId === identity ||
    message.stableId === identity
  );
};

const getMessageQueueKey = (
  conversationId: string,
  message: Pick<Message, "id" | "localId" | "clientMessageId" | "stableId">,
): string => `${conversationId}:${getStableMessageId(message as Message)}`;

const clearMessageSendTimeout = (queueKey: string): void => {
  const timer = pendingMessageSendTimeouts.get(queueKey);
  if (!timer) return;
  clearTimeout(timer);
  pendingMessageSendTimeouts.delete(queueKey);
};

const clearAllMessageSendTimeouts = (): void => {
  pendingMessageSendTimeouts.forEach((timer) => clearTimeout(timer));
  pendingMessageSendTimeouts.clear();
};

const getBrowserOnlineState = (): boolean | null => {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.onLine !== "boolean"
  ) {
    return null;
  }

  return navigator.onLine;
};

const resolveConnectionSendMode = (): "online" | "reconnecting" | "offline" => {
  const connectionState = getSocket()?.getConnectionState() ?? "disconnected";
  if (connectionState === "connected") {
    return "online";
  }
  if (
    connectionState === "connecting" ||
    connectionState === "authenticating" ||
    connectionState === "reconnecting"
  ) {
    return "reconnecting";
  }
  return "offline";
};

const isAxiosTimeoutError = (error: unknown): boolean => {
  if (!axios.isAxiosError(error)) return false;
  return (
    error.code === "ECONNABORTED" ||
    /timeout/i.test(error.message || "") ||
    /timeout/i.test(String(error.cause || ""))
  );
};

const isNetworkError = (error: unknown): boolean => {
  if (getBrowserOnlineState() === false) {
    return true;
  }
  return axios.isAxiosError(error) && !error.response;
};

const resolveSendFailureDescriptor = (
  error: unknown,
  apiError: ReturnType<typeof extractApiError>,
): {
  failureReason: NonNullable<Message["failureReason"]>;
  errorCode: string;
  errorMessage: string;
} => {
  if (isAxiosTimeoutError(error)) {
    return {
      failureReason: "timeout",
      errorCode: "REQUEST_TIMEOUT",
      errorMessage: i18n.t("chat:message.status.timeoutError", {
        defaultValue: "Message timed out. Please retry.",
      }),
    };
  }

  if (isNetworkError(error)) {
    return {
      failureReason: "network",
      errorCode: "NETWORK_OFFLINE",
      errorMessage: i18n.t("chat:message.status.networkError", {
        defaultValue: "No network connection. Please retry.",
      }),
    };
  }

  if (apiError.statusCode >= 500) {
    return {
      failureReason: "backend_5xx",
      errorCode: "BACKEND_5XX",
      errorMessage: i18n.t("chat:message.status.backend5xxError", {
        defaultValue: "Server is busy. Please try again.",
      }),
    };
  }

  if (apiError.statusCode >= 400) {
    return {
      failureReason: "backend_4xx",
      errorCode: "BACKEND_4XX",
      errorMessage: i18n.t("chat:message.status.backend4xxError", {
        defaultValue: "Message was rejected. Please retry.",
      }),
    };
  }

  return {
    failureReason: "unknown",
    errorCode: "UNKNOWN_ERROR",
    errorMessage: i18n.t("chat:message.status.unknownError", {
      defaultValue: "Could not send message.",
    }),
  };
};

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
  (source.stableId !== undefined && source.stableId === target.stableId) ||
  (source.clientMessageId !== undefined &&
    source.clientMessageId === target.clientMessageId) ||
  source.id === target.id ||
  (source.localId !== undefined && source.localId === target.id) ||
  (target.localId !== undefined && target.localId === source.id) ||
  (source.localId !== undefined &&
    target.localId !== undefined &&
    source.localId === target.localId);

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
  _current: Message[],
  keyToIndex: Map<string, number>,
  incoming: Message,
): number => {
  const identityMatch = toMessageIdentityKeys(incoming)
    .map((key) => keyToIndex.get(key))
    .find((index): index is number => typeof index === "number");
  if (typeof identityMatch === "number") {
    return identityMatch;
  }

  return -1;
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

const resolveMergedSendState = (
  current: Message,
  incoming: Message,
): Message["sendState"] => {
  const currentState = current.sendState;
  const incomingState = incoming.sendState;
  const incomingHasServerAck =
    incoming.status === MessageStatus.SENT ||
    incoming.status === MessageStatus.DELIVERED ||
    incoming.status === MessageStatus.READ ||
    !isTempMessageId(incoming.id);

  if (incomingHasServerAck && incomingState !== "failed") {
    return "sent";
  }
  if (incomingState === "failed") {
    return "failed";
  }
  if (incomingState) {
    return incomingState;
  }
  if (
    current.status === MessageStatus.SENT ||
    current.status === MessageStatus.DELIVERED ||
    current.status === MessageStatus.READ
  ) {
    return "sent";
  }
  return currentState;
};

const mergeMessageRecords = (current: Message, incoming: Message): Message => {
  const currentVersion = toFiniteNumber(current.version);
  const incomingVersion = toFiniteNumber(incoming.version);
  const currentUpdatedAt = Math.max(
    toDateValue(current.updatedAt),
    toDateValue(current.editedAt),
    toDateValue(current.readAt),
    toDateValue(current.deliveredAt),
  );
  const incomingUpdatedAt = Math.max(
    toDateValue(incoming.updatedAt),
    toDateValue(incoming.editedAt),
    toDateValue(incoming.readAt),
    toDateValue(incoming.deliveredAt),
  );
  const preferCurrent =
    currentVersion !== null &&
    incomingVersion !== null &&
    incomingVersion < currentVersion
      ? true
      : currentVersion === incomingVersion &&
          incomingUpdatedAt > 0 &&
          incomingUpdatedAt < currentUpdatedAt;

  const merged = preferCurrent
    ? mergeDefinedMessageFields(incoming, current)
    : mergeDefinedMessageFields(current, incoming);

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
  merged.version =
    Math.max(
      toFiniteNumber(current.version) ?? 0,
      toFiniteNumber(incoming.version) ?? 0,
    ) || undefined;
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
  merged.sendState = resolveMergedSendState(current, incoming);
  if (merged.sendState === "sent") {
    merged.queuedReason = undefined;
    merged.failureReason = undefined;
    merged.errorCode = undefined;
    merged.errorMessage = undefined;
  }

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

const mergeMessages = (current: Message[], incoming: Message[]): Message[] =>
  dedupeAndSortMessages([
    ...(Array.isArray(current) ? current : []),
    ...(Array.isArray(incoming) ? incoming : []),
  ]);

const replaceMessages = (
  current: Message[],
  incoming: Message[],
  options?: { preserveMessagesCreatedAfter?: Date },
): Message[] => {
  const existing = Array.isArray(current) ? current : [];
  const preserveMessagesCreatedAfterMs = options?.preserveMessagesCreatedAfter
    ? toDateValue(options.preserveMessagesCreatedAfter)
    : 0;
  const preservedMessages = existing.filter((message) => {
    const shouldPreserveBecauseCreatedAfterFetchStarted =
      preserveMessagesCreatedAfterMs > 0 &&
      toDateValue(message.createdAt) >= preserveMessagesCreatedAfterMs;
    const isLocalOnly =
      isTempMessageId(message.id) ||
      message.sendState === "sending" ||
      message.sendState === "queued" ||
      message.sendState === "retrying" ||
      message.sendState === "failed";

    if (isLocalOnly || shouldPreserveBecauseCreatedAfterFetchStarted) {
      return !incoming.some((candidate) => matchesMessage(candidate, message));
    }

    // Preserve websocket deltas that arrived while the initial snapshot was in
    // flight. Canonical snapshot can overwrite by identity, but it should not
    // drop a message simply because it landed before fetchStarted.
    return !incoming.some((candidate) => matchesMessage(candidate, message));
  });

  return mergeMessages(incoming, preservedMessages);
};

const prependMessages = (
  current: Message[],
  incoming: Message[],
): Message[] => {
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return Array.isArray(current) ? current : [];
  }

  return mergeMessages(incoming, current);
};

const appendMessages = (current: Message[], incoming: Message[]): Message[] => {
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return Array.isArray(current) ? current : [];
  }

  return mergeMessagesAfterCursor(current, incoming);
};

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
      (targetClientMessageId.length > 0 &&
        (itemClientMessageId === targetClientMessageId ||
          itemStableId === targetClientMessageId)) ||
      (targetStableId.length > 0 &&
        (itemStableId === targetStableId || itemLocalId === targetStableId)) ||
      (targetId.length > 0 &&
        (itemId === targetId || itemLocalId === targetId)) ||
      (targetLocalId.length > 0 &&
        (itemId === targetLocalId || itemLocalId === targetLocalId))
    );
  });

const compareAnchorIdsInConversation = (
  messages: Message[],
  currentAnchorId: string | undefined,
  nextAnchorId: string | undefined,
): number => {
  if (!currentAnchorId && !nextAnchorId) return 0;
  if (!currentAnchorId) return -1;
  if (!nextAnchorId) return 1;

  const sorted = sortMessages(Array.isArray(messages) ? messages : []);
  const currentIndex = sorted.findIndex((message) =>
    matchesMessageIdentityValue(message, currentAnchorId),
  );
  const nextIndex = sorted.findIndex((message) =>
    matchesMessageIdentityValue(message, nextAnchorId),
  );

  if (currentIndex >= 0 && nextIndex >= 0) {
    return currentIndex - nextIndex;
  }

  if (currentIndex < 0 && nextIndex >= 0) return -1;
  if (currentIndex >= 0 && nextIndex < 0) return 1;

  return currentAnchorId.localeCompare(nextAnchorId);
};

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

const toMessageSummary = (message: Message): Conversation["lastMessage"] =>
  ({
    id: message.id,
    senderId: message.senderId,
    senderName: message.senderName,
    content: message.content,
    type: message.type,
    isDeleted: message.isDeleted,
    createdAt: message.createdAt,
    ...(message.sendState ? { sendState: message.sendState } : {}),
    ...(message.status ? { status: message.status } : {}),
  }) as Conversation["lastMessage"];

const toConversationLastMessageStatus = (
  message: Message | null | undefined,
): Conversation["lastMessageStatus"] => {
  if (!message) return null;

  if (message.sendState === "failed" || message.status === MessageStatus.FAILED) {
    return "failed";
  }

  if (
    message.sendState === "queued" ||
    message.sendState === "sending" ||
    message.sendState === "retrying" ||
    message.status === MessageStatus.SENDING ||
    message.status === "uploading"
  ) {
    return "pending";
  }

  return "sent";
};

const isCanonicalConversationMessage = (
  message: Message | null | undefined,
): boolean => {
  if (!message) return false;

  if (
    message.sendState === "queued" ||
    message.sendState === "sending" ||
    message.sendState === "retrying" ||
    message.sendState === "failed" ||
    message.status === MessageStatus.SENDING ||
    message.status === MessageStatus.FAILED ||
    message.status === "uploading"
  ) {
    return false;
  }

  if (
    message.sendState === "sent" ||
    message.status === MessageStatus.SENT ||
    message.status === MessageStatus.DELIVERED ||
    message.status === MessageStatus.READ
  ) {
    return true;
  }

  return !isTempMessageId(message.id);
};

const attachReplySnapshots = (messages: Message[]): Message[] => {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  const messageByIdentity = new Map<string, Message>();
  messages.forEach((message) => {
    toMessageIdentityKeys(message).forEach((key) => {
      messageByIdentity.set(key, message);
    });
  });

  return messages.map((message) => {
    if (message.replyToMessage || !message.replyTo) {
      return message;
    }

    const replyTarget =
      messageByIdentity.get(`id:${message.replyTo}`) ??
      messageByIdentity.get(`local:${message.replyTo}`) ??
      messageByIdentity.get(`stable:${message.replyTo}`) ??
      messageByIdentity.get(`client:${message.replyTo}`);
    if (!replyTarget) {
      return message;
    }

    return {
      ...message,
      replyToMessage: createReplySnapshot(replyTarget),
    };
  });
};

const buildConversationMessageState = (
  state: Pick<
    ChatState,
    | "conversations"
    | "messages"
    | "messageById"
    | "messageIdsByConversation"
    | "messageAliasIndexByConversation"
    | "messagesHydratedByConversation"
    | "hasNewerMessagesByConversation"
  >,
  conversationId: string,
  nextMessages: Message[],
  options?: {
    hydrated?: boolean;
    hasNewer?: boolean;
  },
) => {
  const resolvedMessages = attachReplySnapshots(nextMessages);
  const lastMessage = resolvedMessages[resolvedMessages.length - 1];
  const latestCanonicalMessage = [...resolvedMessages]
    .reverse()
    .find((message) => isCanonicalConversationMessage(message));
  const nextAliasIndex = rebuildConversationMessageAliasIndex(resolvedMessages);
  const existingConversation =
    state.conversations.find((conversation) => conversation.id === conversationId) ??
    null;
  const conversations = existingConversation
    ? (() => {
        const nextConversation = !lastMessage
          ? (normalizeConversation({
              ...existingConversation,
              lastMessage: undefined,
              lastMessageStatus: null,
            }) ?? {
              ...existingConversation,
              lastMessage: undefined,
              lastMessageStatus: null,
            })
          : (() => {
              const canonicalMessage = latestCanonicalMessage ?? null;
              const updatedAt =
                canonicalMessage?.createdAt ??
                existingConversation.updatedAt ??
                lastMessage.createdAt;

              return (
                normalizeConversation({
                  ...existingConversation,
                  lastMessage: toMessageSummary(lastMessage),
                  updatedAt,
                  lastMessageAt:
                    canonicalMessage?.createdAt ??
                    existingConversation.lastMessageAt,
                  lastMessageSortAt:
                    canonicalMessage?.createdAt ??
                    existingConversation.lastMessageSortAt ??
                    existingConversation.lastMessageAt ??
                    updatedAt,
                  lastMessageId:
                    canonicalMessage?.id ??
                    existingConversation.lastMessageId ??
                    lastMessage.id,
                  lastMessageStatus: toConversationLastMessageStatus(lastMessage),
                }) ?? {
                  ...existingConversation,
                  lastMessage: toMessageSummary(lastMessage),
                  updatedAt,
                  lastMessageAt:
                    canonicalMessage?.createdAt ??
                    existingConversation.lastMessageAt,
                  lastMessageSortAt:
                    canonicalMessage?.createdAt ??
                    existingConversation.lastMessageSortAt ??
                    existingConversation.lastMessageAt ??
                    updatedAt,
                  lastMessageId:
                    canonicalMessage?.id ??
                    existingConversation.lastMessageId ??
                    lastMessage.id,
                  lastMessageStatus: toConversationLastMessageStatus(lastMessage),
                }
              );
            })();

        return replaceConversationInActivityOrder(
          state.conversations,
          nextConversation,
        );
      })()
    : state.conversations;

  const messageIndexState = buildConversationMessageIndexState(
    state,
    conversationId,
    resolvedMessages,
  );

  return {
    conversations,
    messages: {
      ...state.messages,
      [conversationId]: resolvedMessages,
    },
    ...messageIndexState,
    messageAliasIndexByConversation: {
      ...state.messageAliasIndexByConversation,
      [conversationId]: nextAliasIndex,
    },
    messagesHydratedByConversation: {
      ...state.messagesHydratedByConversation,
      [conversationId]:
        options?.hydrated ??
        state.messagesHydratedByConversation[conversationId] ??
        false,
    },
    hasNewerMessagesByConversation:
      options?.hasNewer === undefined
        ? state.hasNewerMessagesByConversation
        : {
            ...state.hasNewerMessagesByConversation,
            [conversationId]: options.hasNewer,
          },
    ...buildConversationCollectionState(conversations),
  };
};

const getResolvedMergedMessage = (
  nextMessages: Message[],
  incomingList: Message[],
): Message | null => {
  const mergedIncoming = incomingList[incomingList.length - 1];
  if (!mergedIncoming) {
    return nextMessages[nextMessages.length - 1] ?? null;
  }

  return (
    nextMessages.find((message) =>
      getMessageAliasCandidates(mergedIncoming).some((alias) =>
        matchesMessageIdentityValue(message, alias),
      ),
    ) ?? mergedIncoming
  );
};

const hasMessageIdentityMatch = (
  messages: Message[],
  incoming: Message,
): boolean =>
  messages.some((message) =>
    getMessageAliasCandidates(incoming).some((alias) =>
      matchesMessageIdentityValue(message, alias),
    ),
  );

const ingestConversationMessagesWithMetadata = (
  state: Pick<
    ChatState,
    | "conversations"
    | "messages"
    | "messageById"
    | "messageIdsByConversation"
    | "messageAliasIndexByConversation"
    | "messagesHydratedByConversation"
    | "hasNewerMessagesByConversation"
  >,
  conversationId: string,
  messages: Message | Message[],
  options?: {
    mode?: "replace" | "prepend" | "append" | "upsert";
    preserveMessagesCreatedAfter?: Date;
    hydrated?: boolean;
    hasNewer?: boolean;
    source?: string;
    incrementUnread?: boolean;
  },
) => {
  const incomingList = (Array.isArray(messages) ? messages : [messages])
    .map((item) => normalizeMessage(item, conversationId))
    .filter((item): item is Message => item !== null);
  if (incomingList.length === 0 && options?.mode !== "replace") {
    return {
      nextState: {
        ...state,
        ...buildConversationCollectionState(state.conversations),
      },
      metadata: {
        status: "ignored" as const,
        canonicalMessage: null,
        mergedMessage: null,
        unreadDelta: 0,
      },
    };
  }

  const currentMessages = state.messages[conversationId] || [];
  const hadExistingIdentity = incomingList.some((incoming) =>
    hasMessageIdentityMatch(currentMessages, incoming),
  );
  const nextMessages =
    options?.mode === "replace"
      ? replaceMessages(currentMessages, incomingList, {
          preserveMessagesCreatedAfter: options?.preserveMessagesCreatedAfter,
        })
      : options?.mode === "prepend"
        ? prependMessages(currentMessages, incomingList)
        : options?.mode === "append"
          ? appendMessages(currentMessages, incomingList)
          : mergeMessages(currentMessages, incomingList);
  const messageState = buildConversationMessageState(state, conversationId, nextMessages, {
    hydrated: options?.hydrated ?? true,
    hasNewer: options?.hasNewer,
  });
  const mergedMessage = getResolvedMergedMessage(nextMessages, incomingList);
  const unreadDelta =
    options?.incrementUnread && !hadExistingIdentity && mergedMessage ? 1 : 0;
  const conversations =
    unreadDelta > 0
      ? messageState.conversations.map((conversation) => {
          if (conversation.id !== conversationId || !mergedMessage) {
            return conversation;
          }

          return updateConversationActivitySummary(
            conversation,
            mergedMessage,
            Math.max(0, conversation.unreadCount || 0) + unreadDelta,
          );
        })
      : messageState.conversations;
  const nextState = {
    ...messageState,
    conversations,
    ...buildConversationCollectionState(conversations),
  };

  return {
    nextState,
    metadata: {
      status:
        incomingList.length === 0
          ? ("ignored" as const)
          : hadExistingIdentity
            ? ("merged" as const)
            : ("new" as const),
      canonicalMessage:
        mergedMessage && isCanonicalConversationMessage(mergedMessage)
          ? mergedMessage
          : null,
      mergedMessage,
      unreadDelta,
    },
  };
};

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

const normalizeConversationReadStateFromMeta = (
  responseMeta?: Record<string, unknown> | null,
): {
  unreadCount: number;
  lastReadMessageId: string | null;
  lastReadAt: string | null;
  firstUnreadMessageId: string | null;
  firstUnreadMessageAt: string | null;
} | null => {
  const payload = asRecord(responseMeta?.readState);
  if (!payload) {
    return null;
  }

  return {
    unreadCount: Math.max(0, asNumberValue(payload.unreadCount) ?? 0),
    lastReadMessageId: asStringValue(payload.lastReadMessageId) ?? null,
    lastReadAt: asStringValue(payload.lastReadAt) ?? null,
    firstUnreadMessageId: asStringValue(payload.firstUnreadMessageId) ?? null,
    firstUnreadMessageAt: asStringValue(payload.firstUnreadMessageAt) ?? null,
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
    resolveUserDisplayName(currentUser, {
      allowLegacyFallback: true,
    }) || i18n.t("chat:message.you");

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

const findMessageByQueueKey = (
  messages: Message[],
  queueKey: string,
): Message | undefined =>
  messages.find(
    (message) =>
      getMessageQueueKey(message.conversationId, message) === queueKey,
  );

export const useChatStore = create<ChatState>()(
  subscribeWithSelector((set, get) => {
    const setSendRestrictionInternal = (
      conversationId: string,
      restriction: SendRestriction,
    ): void => {
      if (!conversationId) return;
      set((state) => ({
        sendRestrictionsByConversation: {
          ...state.sendRestrictionsByConversation,
          [conversationId]: restriction,
        },
      }));
    };

    const clearSendRestrictionInternal = (conversationId: string): void => {
      if (!conversationId) return;
      set((state) => {
        if (!(conversationId in state.sendRestrictionsByConversation)) {
          return state;
        }
        const nextRestrictions = { ...state.sendRestrictionsByConversation };
        delete nextRestrictions[conversationId];
        return {
          sendRestrictionsByConversation: nextRestrictions,
        };
      });
    };

    const dequeueOutboxMessage = (
      conversationId: string,
      queueKey: string,
    ): void => {
      if (!conversationId || !queueKey) return;
      set((state) => {
        const current = state.outboxByConversation[conversationId] || [];
        if (current.length === 0 || !current.includes(queueKey)) {
          return state;
        }
        const nextMessages = current.filter((item) => item !== queueKey);
        const nextOutbox = { ...state.outboxByConversation };
        if (nextMessages.length > 0) {
          nextOutbox[conversationId] = nextMessages;
        } else {
          delete nextOutbox[conversationId];
        }
        return {
          outboxByConversation: nextOutbox,
        };
      });
    };

    const scheduleSendTimeout = (
      conversationId: string,
      queueKey: string,
    ): void => {
      clearMessageSendTimeout(queueKey);
      pendingMessageSendTimeouts.set(
        queueKey,
        setTimeout(() => {
          pendingMessageSendTimeouts.delete(queueKey);
          const currentMessage = findMessageByQueueKey(
            get().messages[conversationId] || EMPTY_MESSAGES,
            queueKey,
          );
          if (
            !currentMessage ||
            (currentMessage.sendState !== "sending" &&
              currentMessage.sendState !== "retrying")
          ) {
            return;
          }

          get().failOutgoingMessage(
            conversationId,
            currentMessage.clientMessageId ||
              currentMessage.stableId ||
              currentMessage.localId ||
              currentMessage.id,
            {
            sendState: "failed",
            status: MessageStatus.FAILED,
            queuedReason: undefined,
            failureReason: "timeout",
            errorCode: "REQUEST_TIMEOUT",
            errorMessage: i18n.t("chat:message.status.timeoutError", {
              defaultValue: "Message timed out. Please retry.",
            }),
            },
          );
        }, MESSAGE_SEND_TIMEOUT_MS),
      );
    };

    const dispatchExistingMessage = async (
      conversationId: string,
      message: Message,
      attemptState: "sending" | "retrying",
    ): Promise<SendMessageResult> => {
      const replyToId = getReplyToId(message.replyTo);
      const attachments = toAttachmentPayload(message.attachments);
      const sender = resolveSenderIdentity();
      const senderName = message.senderName?.trim() || sender.senderName;
      const senderAvatar = message.senderAvatar || sender.senderAvatar;
      const queueKey = getMessageQueueKey(conversationId, message);
      const nextAttemptCount = (message.sendAttempts ?? 0) + 1;
      const attemptedAt = new Date();
      logMessageDebug("chatStore", "send_request_started", {
        conversationId,
        queueKey,
        correlationKey: getCorrelationKeyForMessage(message),
        attemptState,
        messageId: message.id,
        localId: message.localId,
        clientMessageId: message.clientMessageId,
        stableId: message.stableId,
        contentLength: message.content.length,
        contentPreview: message.content.slice(0, 120),
        type: message.type,
        attachmentCount: attachments?.length ?? 0,
        replyToId,
        connectionMode: resolveConnectionSendMode(),
      });

      dequeueOutboxMessage(conversationId, queueKey);
      get().updateMessage(conversationId, message.id, {
        sendState: attemptState,
        status: MessageStatus.SENDING,
        queuedReason: undefined,
        failureReason: undefined,
        errorCode: undefined,
        errorMessage: undefined,
        sendAttempts: nextAttemptCount,
        lastSendAttemptAt: attemptedAt,
      });
      scheduleSendTimeout(conversationId, queueKey);

      try {
        const response = await messageApi.sendMessage(conversationId, {
          content: message.content,
          type: message.type,
          senderName,
          clientMessageId:
            message.clientMessageId || message.stableId || message.localId,
          tempId: message.localId || message.id,
          localId: message.localId || message.id,
          ...(senderAvatar ? { senderAvatar } : {}),
          ...(replyToId ? { replyToId } : {}),
          ...(attachments?.length ? { attachments } : {}),
        });
        clearMessageSendTimeout(queueKey);

        const sentMessage = normalizeMessage(
          unwrapApiSuccess(response),
          conversationId,
        );
        if (!sentMessage) {
          throw new Error(i18n.t("error:chat.invalidSendResponse"));
        }

        clearSendRestrictionInternal(conversationId);
        get().ackOutgoingMessage(conversationId, message.clientMessageId || "", {
          ...sentMessage,
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
            sentMessage.serverSeq !== undefined
              ? "synced_stream"
              : "acked_transport",
          sendState: "sent",
          sendAttempts: nextAttemptCount,
          lastSendAttemptAt: attemptedAt,
          queuedReason: undefined,
          failureReason: undefined,
          errorCode: undefined,
          errorMessage: undefined,
          status: sentMessage.status || MessageStatus.SENT,
        });
        logMessageDebug("chatStore", "send_request_succeeded", {
          conversationId,
          queueKey,
          correlationKey: getCorrelationKeyForMessage(message),
          tempMessageId: message.id,
          sentMessageId: sentMessage.id,
          responseClientMessageId: sentMessage.clientMessageId,
          responseLocalId: sentMessage.localId,
          responseContentPreview: sentMessage.content.slice(0, 120),
          serverSeq: sentMessage.serverSeq,
        });

        return {
          disposition: "sent",
          messageId: sentMessage.id,
        };
      } catch (error) {
        clearMessageSendTimeout(queueKey);
        const apiError = extractApiError(error);
        const errorCode = String(apiError.code || "").toUpperCase();

        if (errorCode === "SLOW_MODE_ACTIVE") {
          get().failOutgoingMessage(
            conversationId,
            message.clientMessageId || message.stableId || message.localId || message.id,
            {
            sendState: "failed",
            status: MessageStatus.FAILED,
            failureReason: "slow_mode",
            errorCode,
            errorMessage: i18n.t("chat:message.status.slowModeError", {
              defaultValue: "Slow mode is active. Please wait and retry.",
            }),
            },
          );
          logMessageDebug("chatStore", "send_request_failed", {
            conversationId,
            queueKey,
            correlationKey: getCorrelationKeyForMessage(message),
            messageId: message.id,
            errorCode,
            failureReason: "slow_mode",
            errorMessage: apiError.message || "slow_mode_active",
          });
          throw error;
        }

        if (
          errorCode === "FORBIDDEN" ||
          errorCode === "PERMISSION_DENIED" ||
          errorCode === "ROOM_INSUFFICIENT_PERMISSIONS" ||
          errorCode === "USER_BLOCKED" ||
          errorCode === "AUTH_FORBIDDEN"
        ) {
          setSendRestrictionInternal(conversationId, {
            code: errorCode,
            reason:
              apiError.message || i18n.t("chat:composer.permissionDenied"),
            kind: "permission",
          });
          get().failOutgoingMessage(
            conversationId,
            message.clientMessageId || message.stableId || message.localId || message.id,
            {
            sendState: "failed",
            status: MessageStatus.FAILED,
            failureReason: "permission",
            errorCode,
            errorMessage: i18n.t("chat:composer.permissionDenied", {
              defaultValue:
                "You can no longer send messages in this conversation.",
            }),
            },
          );
          logMessageDebug("chatStore", "send_request_failed", {
            conversationId,
            queueKey,
            correlationKey: getCorrelationKeyForMessage(message),
            messageId: message.id,
            errorCode,
            failureReason: "permission",
            errorMessage: apiError.message || "permission_denied",
          });
          throw error;
        }

        const descriptor = resolveSendFailureDescriptor(error, apiError);

        get().failOutgoingMessage(
          conversationId,
          message.clientMessageId || message.stableId || message.localId || message.id,
          {
          sendState: "failed",
          status: MessageStatus.FAILED,
          queuedReason: undefined,
          failureReason: descriptor.failureReason,
          errorCode: descriptor.errorCode,
          errorMessage: descriptor.errorMessage,
          },
        );
        logMessageDebug("chatStore", "send_request_failed", {
          conversationId,
          queueKey,
          correlationKey: getCorrelationKeyForMessage(message),
          messageId: message.id,
          errorCode,
          failureReason: descriptor.failureReason,
          userErrorCode: descriptor.errorCode,
          errorMessage: apiError.message || "send_failed",
        });
        throw error;
      }
    };

    return {
      ...initialState,

      setConversations: (conversations) => {
        const normalized = mergeConversationCollections(
          normalizeConversationsPayload(
            Array.isArray(conversations) ? conversations : [],
          ),
        );
        set({
          conversations: normalized,
          ...buildConversationCollectionState(normalized),
        });
      },

      addConversation: (conversation) => {
        const normalized = normalizeConversation(conversation);
        if (!normalized) return;

        set((state) => {
          const conversations = mergeConversationCollections([
            normalized,
            ...(Array.isArray(state.conversations) ? state.conversations : []),
          ]);

          return {
            conversations,
            ...buildConversationCollectionState(conversations),
          };
        });
      },

      upsertConversationSummary: (conversation) => {
        const normalized = normalizeConversation(conversation);
        if (!normalized) {
          return {
            applied: false,
            gapDetected: false,
            previousVersion: 0,
            nextVersion: 0,
          };
        }

        let result: {
          applied: boolean;
          gapDetected: boolean;
          previousVersion: number;
          nextVersion: number;
          reason?: "inserted" | "updated" | "stale_version" | "stale_timestamp";
        } = {
          applied: false,
          gapDetected: false,
          previousVersion: 0,
          nextVersion: toConversationVersion(normalized),
        };

        set((state) => {
          const conversations = Array.isArray(state.conversations)
            ? state.conversations
            : [];
          const existingIndex = conversations.findIndex(
            (item) => item.id === normalized.id,
          );

          if (existingIndex < 0) {
            const nextConversations = mergeConversationCollections([
              normalized,
              ...conversations,
            ]);
            result = {
              applied: true,
              gapDetected: false,
              previousVersion: 0,
              nextVersion: toConversationVersion(normalized),
              reason: "inserted",
            };
            return {
              conversations: nextConversations,
              ...buildConversationCollectionState(nextConversations),
            };
          }

          const current = conversations[existingIndex];
          const decision = shouldApplyConversationSummary(current, normalized);
          result = {
            applied: decision.apply,
            gapDetected: decision.gapDetected,
            previousVersion: decision.previousVersion,
            nextVersion: decision.nextVersion,
            reason: decision.reason,
          };
          if (!decision.apply) {
            return state;
          }

          const next = [...conversations];
          next[existingIndex] = mergeConversationSummary(current, normalized);
          const mergedConversations = mergeConversationCollections(next);

          return {
            conversations: mergedConversations,
            ...buildConversationCollectionState(mergedConversations),
          };
        });

        return result;
      },

      updateConversation: (id, updates) => {
        set((state) => {
          const conversations = mergeConversationCollections((Array.isArray(state.conversations)
            ? state.conversations
            : []
          ).map((conversation) =>
            conversation.id === id
              ? (normalizeConversation({ ...conversation, ...updates }) ?? {
                  ...conversation,
                  ...updates,
                })
              : conversation,
          ));

          return {
            conversations,
            ...buildConversationCollectionState(conversations),
          };
        });
      },

      removeConversation: (id) => {
        roomMessageFetchInFlight.delete(id);
        initialFetchSeqByConversation.delete(id);
        messageFetchGenerationByConversation.delete(id);
        Array.from(pendingMessageSendTimeouts.keys())
          .filter((key) => key.startsWith(`${id}:`))
          .forEach(clearMessageSendTimeout);
        set((state) => {
          const conversations = (Array.isArray(state.conversations)
            ? state.conversations
            : []
          ).filter((conversation) => conversation.id !== id);
          return {
            conversations,
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
            hasNewerMessagesByConversation: Object.fromEntries(
              Object.entries(state.hasNewerMessagesByConversation).filter(
                ([key]) => key !== id,
              ),
            ),
            outboxByConversation: Object.fromEntries(
              Object.entries(state.outboxByConversation).filter(
                ([key]) => key !== id,
              ),
            ),
            sendRestrictionsByConversation: Object.fromEntries(
              Object.entries(state.sendRestrictionsByConversation).filter(
                ([key]) => key !== id,
              ),
            ),
            messageErrors: Object.fromEntries(
              Object.entries(state.messageErrors).filter(([key]) => key !== id),
            ),
            selectedConversationId:
              state.selectedConversationId === id
                ? null
                : state.selectedConversationId,
            ...buildConversationCollectionState(conversations),
          };
        });
      },

      selectConversation: (id) => {
        set((state) =>
          state.selectedConversationId === id
            ? state
            : { selectedConversationId: id },
        );
      },

      markAsRead: async (conversationId, lastVisibleMessageId) => {
        if (!lastVisibleMessageId || lastVisibleMessageId.startsWith("temp-")) {
          return Promise.resolve();
        }

        const currentConversation = get().conversations.find(
          (conversation) => conversation.id === conversationId,
        );
        if (
          currentConversation?.lastReadMessageId &&
          compareAnchorIdsInConversation(
            get().messages[conversationId] || EMPTY_MESSAGES,
            currentConversation.lastReadMessageId,
            lastVisibleMessageId,
          ) >= 0
        ) {
          return Promise.resolve();
        }

        const existingRequest = markAsReadInFlight.get(conversationId);
        if (existingRequest) {
          const compareQueuedAnchor = compareAnchorIdsInConversation(
            get().messages[conversationId] || EMPTY_MESSAGES,
            existingRequest.queuedAnchorId ?? existingRequest.anchorId,
            lastVisibleMessageId,
          );
          if (compareQueuedAnchor < 0) {
            existingRequest.queuedAnchorId = lastVisibleMessageId;
          }
          return existingRequest.promise;
        }

        const runMarkAsRead = async (anchorId: string): Promise<void> => {
          get().applyOptimisticConversationRead(conversationId, anchorId);
          const request = conversationApi.markAsRead(conversationId, anchorId);
          markAsReadInFlight.set(conversationId, {
            promise: request,
            anchorId,
          });

          try {
            await request;
          } finally {
            const pending = markAsReadInFlight.get(conversationId);
            const queuedAnchorId = pending?.queuedAnchorId;
            markAsReadInFlight.delete(conversationId);

            if (queuedAnchorId && queuedAnchorId !== anchorId) {
              await runMarkAsRead(queuedAnchorId);
            }
          }
        };

        return runMarkAsRead(lastVisibleMessageId);
      },

      applyUnreadSummary: (summary, options) => {
        const summaryByConversationId = new Map(
          (summary.conversations || []).map((item) => [item.conversationId, item]),
        );
        const requestedAtMs =
          typeof options?.requestedAtMs === "number" &&
          Number.isFinite(options.requestedAtMs)
            ? options.requestedAtMs
            : 0;
        const appliedAtMs =
          typeof options?.appliedAtMs === "number" &&
          Number.isFinite(options.appliedAtMs)
            ? options.appliedAtMs
            : Date.now();

        set((state) => {
          const conversations = (Array.isArray(state.conversations)
            ? state.conversations
            : []
          ).map((conversation) => {
            const unreadSnapshot = summaryByConversationId.get(conversation.id);
            const summaryWasUpdatedAfterRequest =
              requestedAtMs > 0 &&
              getConversationCursorTimestamp(conversation) > requestedAtMs;
            if (summaryWasUpdatedAfterRequest) {
              return conversation;
            }

            if (!unreadSnapshot) {
              return normalizeConversation({
                ...conversation,
                unreadCount: 0,
                firstUnreadMessageId: null,
                firstUnreadMessageAt: null,
              }) as Conversation;
            }

            return normalizeConversation({
              ...conversation,
              unreadCount: unreadSnapshot.unreadCount,
              lastReadMessageId: unreadSnapshot.lastReadMessageId,
              lastReadAt: unreadSnapshot.lastReadAt,
              ...(unreadSnapshot.unreadCount > 0
                ? {}
                : {
                    firstUnreadMessageId: null,
                    firstUnreadMessageAt: null,
                  }),
            }) as Conversation;
          });

          return {
            conversations,
            lastUnreadSummaryAppliedAt: appliedAtMs,
            ...buildConversationCollectionState(conversations),
          };
        });

      },

      applyIncomingConversationMessage: (conversationId, message, options) => {
        if (!conversationId) return;

        set((state) => {
          const conversations = (Array.isArray(state.conversations)
            ? state.conversations
            : []
          ).map((conversation) => {
            if (conversation.id !== conversationId) {
              return conversation;
            }

            const nextUnreadCount = options?.incrementUnread
              ? Math.max(0, conversation.unreadCount || 0) + 1
              : Math.max(0, conversation.unreadCount || 0);
            const nextConversation = updateConversationActivitySummary(
              conversation,
              message,
              nextUnreadCount,
            );
            if (
              options?.incrementUnread &&
              (conversation.unreadCount ?? 0) <= 0 &&
              !conversation.firstUnreadMessageId
            ) {
              return normalizeConversation({
                ...nextConversation,
                firstUnreadMessageId: message.id,
                firstUnreadMessageAt: message.createdAt,
              }) as Conversation;
            }

            return nextConversation;
          });

          return {
            conversations,
            ...buildConversationCollectionState(conversations),
          };
        });
      },

      applyOptimisticConversationRead: (
        conversationId,
        lastReadMessageId,
        options,
      ) => {
        if (!conversationId || !lastReadMessageId) return;

        set((state) => {
          const currentMessages = state.messages[conversationId] || EMPTY_MESSAGES;
          const conversations = (Array.isArray(state.conversations)
            ? state.conversations
            : []
          ).map((conversation) => {
            if (conversation.id !== conversationId) {
              return conversation;
            }

            if (
              conversation.lastReadMessageId &&
              compareAnchorIdsInConversation(
                currentMessages,
                conversation.lastReadMessageId,
                lastReadMessageId,
              ) >= 0
            ) {
              return conversation;
            }

            return updateConversationReadProgress(
              conversation,
              lastReadMessageId,
              options?.readAt,
            );
          });

          return {
            conversations,
            ...buildConversationCollectionState(conversations),
          };
        });
      },

      fetchConversations: async () => {
        if (conversationsFetchPromise) {
          return conversationsFetchPromise;
        }

        set({ isLoadingConversations: true, conversationsError: null });

        conversationsFetchPromise = (async () => {
          try {
            const response = await conversationApi.getConversations(1, 100);
            const conversations = normalizeConversationsPayload(
              unwrapApiSuccess(response),
            );
            const mergedConversations = mergeConversationCollections(conversations);
            set({
              conversations: mergedConversations,
              ...buildConversationCollectionState(mergedConversations),
              isLoadingConversations: false,
              hasFetchedConversationsOnce: true,
            });
          } catch (error: unknown) {
            const apiError = extractApiError(error);
            const errorMessage =
              apiError.message || i18n.t("error:chat.fetchConversationsFailed");
            set({
              conversationsError: errorMessage,
              error: errorMessage,
              isLoadingConversations: false,
              hasFetchedConversationsOnce: true,
            });
          } finally {
            conversationsFetchPromise = null;
          }
        })();

        return conversationsFetchPromise;
      },

      ingestMessages: (conversationId, messages, options) => {
        set((state) => {
          const { nextState, metadata } = ingestConversationMessagesWithMetadata(
            state,
            conversationId,
            messages,
            options,
          );

          if (metadata.mergedMessage) {
            logMessageDebug("chatStore", "message_ingested", {
              conversationId,
              source: options?.source ?? "unknown",
              mode: options?.mode ?? "upsert",
              correlationKey: getCorrelationKeyForMessage(metadata.mergedMessage),
              mergedId: metadata.mergedMessage.id,
              mergedLocalId: metadata.mergedMessage.localId,
              mergedClientMessageId: metadata.mergedMessage.clientMessageId,
              sendState: metadata.mergedMessage.sendState,
              nextCount: nextState.messages[conversationId]?.length ?? 0,
            });
          }

          return nextState;
        });
      },

      setMessages: (conversationId, messages) => {
        get().ingestMessages(conversationId, messages, {
          mode: "replace",
          hydrated: true,
          hasNewer: false,
          source: "setMessages",
        });
      },

      addMessage: (conversationId, message) => {
        get().ingestMessages(conversationId, message, {
          mode: "upsert",
          hydrated: true,
          source: "addMessage",
        });
      },

      ackOutgoingMessage: (conversationId, clientMessageId, serverMessage) => {
        const normalized = normalizeMessage(serverMessage, conversationId);
        if (!normalized) return;

        get().ingestMessages(
          conversationId,
          {
            ...normalized,
            stableId:
              clientMessageId ||
              normalized.stableId ||
              normalized.clientMessageId ||
              normalized.localId ||
              normalized.id,
            clientMessageId:
              clientMessageId ||
              normalized.clientMessageId ||
              normalized.localId ||
              normalized.id,
          },
          {
            mode: "upsert",
            hydrated: true,
            source: "ackOutgoingMessage",
          },
        );
      },

      ingestConversationMessageEvent: (conversationId, message, options) => {
        let metadata: {
          status: "new" | "merged" | "ignored";
          canonicalMessage: Message | null;
          mergedMessage: Message | null;
          unreadDelta: number;
        } = {
          status: "ignored",
          canonicalMessage: null,
          mergedMessage: null,
          unreadDelta: 0,
        };

        set((state) => {
          const result = ingestConversationMessagesWithMetadata(
            state,
            conversationId,
            message,
            {
              mode: "upsert",
              hydrated: options?.hydrated ?? true,
              source: options?.source ?? "realtime",
              incrementUnread: options?.incrementUnread,
            },
          );
          metadata = result.metadata;
          return result.nextState;
        });

        return metadata;
      },

      failOutgoingMessage: (conversationId, clientMessageId, updates) => {
        get().updateMessage(conversationId, clientMessageId, updates);
      },

      removeMessageAlias: (conversationId, identity) => {
        if (!identity) return;
        set((state) => {
          const nextConversationAliasIndex = {
            ...(state.messageAliasIndexByConversation[conversationId] || {}),
          };
          delete nextConversationAliasIndex[identity];
          return {
            messageAliasIndexByConversation: {
              ...state.messageAliasIndexByConversation,
              [conversationId]: nextConversationAliasIndex,
            },
          };
        });
      },

      updateMessage: (conversationId, messageId, updates) => {
        set((state) => {
          const currentMessages = state.messages[conversationId] || [];
          const aliasIndex = state.messageAliasIndexByConversation[conversationId];
          const resolvedMessageId = resolveCanonicalMessageIdentity(
            currentMessages,
            aliasIndex,
            messageId,
          );
          const matchedMessage = currentMessages.find((message) =>
            matchesMessageIdentityValue(message, resolvedMessageId),
          );
          const updatedMessages = dedupeAndSortMessages(
            currentMessages.map((message) =>
              matchesMessageIdentityValue(message, resolvedMessageId)
                ? ({ ...message, ...updates } as Message)
                : message,
            ),
          );
          logMessageDebug("chatStore", "message_updated", {
            conversationId,
            messageId,
            resolvedMessageId,
            matchedId: matchedMessage?.id,
            matchedLocalId: matchedMessage?.localId,
            updates,
          });

          return buildConversationMessageState(state, conversationId, updatedMessages, {
            hydrated: true,
          });
        });
      },

      markMessagesReadUpTo: (conversationId, lastMessageId, readerId) => {
        const currentUserId = useAuthStore.getState().user?.id;
        if (!currentUserId) return;
        if (readerId && readerId === currentUserId) return;

        set((state) => {
          const currentMessages = state.messages[conversationId] || [];
          const sortedMessages = sortMessages(currentMessages);
          const boundaryIndex = sortedMessages.findIndex((message) =>
            matchesMessageIdentityValue(message, lastMessageId),
          );
          const readAt = new Date();

          const updatedMessages = sortedMessages.map((message, index) => {
            if (message.senderId !== currentUserId) return message;
            if (message.status === MessageStatus.READ) return message;

            if (boundaryIndex < 0) {
              return matchesMessageIdentityValue(message, lastMessageId)
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
        const currentMessages = get().messages[conversationId] || EMPTY_MESSAGES;
        const resolvedMessageId = resolveCanonicalMessageIdentity(
          currentMessages,
          get().messageAliasIndexByConversation[conversationId],
          messageId,
        );
        const currentMessage = currentMessages.find((message) =>
          matchesMessageIdentityValue(message, resolvedMessageId),
        );
        logMessageDebug("chatStore", "message_removed", {
          conversationId,
          messageId,
          resolvedMessageId,
          matchedId: currentMessage?.id,
          matchedLocalId: currentMessage?.localId,
        });
        if (currentMessage) {
          clearMessageSendTimeout(
            getMessageQueueKey(conversationId, currentMessage),
          );
          dequeueOutboxMessage(
            conversationId,
            getMessageQueueKey(conversationId, currentMessage),
          );
        }
        set((state) => {
          const updatedMessages = (state.messages[conversationId] || []).filter(
            (message) => !matchesMessageIdentityValue(message, resolvedMessageId),
          );
          const nextState = buildConversationMessageState(
            state,
            conversationId,
            updatedMessages,
            { hydrated: true },
          );
          if (currentMessage) {
            const nextAliasIndex = {
              ...(nextState.messageAliasIndexByConversation[conversationId] || {}),
            };
            getMessageAliasCandidates(currentMessage).forEach((alias) => {
              delete nextAliasIndex[alias];
            });
            nextState.messageAliasIndexByConversation[conversationId] =
              nextAliasIndex;
          }

          return nextState;
        });
      },

      fetchMessages: async (conversationId, before, after, options) => {
        const isInitialFetch = !before && !after;
        const fetchMode: FetchMessagesResult["mode"] = after
          ? "newer"
          : before
            ? "older"
            : "initial";
        const fetchRequestedAt = new Date();
        const syncReason = options?.syncReason;
        const forceRefresh = options?.force === true;
        if (
          fetchMode === "newer" &&
          syncReason === "initial-sync" &&
          get().messagesHydratedByConversation[conversationId] &&
          get().hasNewerMessagesByConversation[conversationId] === false
        ) {
          logMessageDebug("chatStore", "fetch_blocked_known_latest", {
            conversationId,
            fetchMode,
            syncReason,
            before,
            after,
            beforeId: options?.beforeId,
            afterId: options?.afterId,
          });
          return {
            loaded: 0,
            hasMore: false,
            hasNext: false,
            hasPrev: get().hasMoreMessages[conversationId] ?? false,
            mode: fetchMode,
            applied: false,
          };
        }
        if (
          isInitialFetch &&
          !forceRefresh &&
          get().messagesHydratedByConversation[conversationId]
        ) {
          return {
            loaded: 0,
            hasMore: get().hasMoreMessages[conversationId] ?? false,
            hasNext:
              get().hasNewerMessagesByConversation[conversationId] ?? false,
            hasPrev: get().hasMoreMessages[conversationId] ?? false,
            mode: fetchMode,
            applied: false,
          };
        }

        const currentInFlight =
          roomMessageFetchInFlight.get(conversationId) ?? 0;
        roomMessageFetchInFlight.set(conversationId, currentInFlight + 1);
        const initialFetchSeq = isInitialFetch
          ? (initialFetchSeqByConversation.get(conversationId) ?? 0) + 1
          : null;
        const fetchGeneration = isInitialFetch
          ? (messageFetchGenerationByConversation.get(conversationId) ?? 0) + 1
          : (messageFetchGenerationByConversation.get(conversationId) ?? 0);

        if (initialFetchSeq !== null) {
          initialFetchSeqByConversation.set(conversationId, initialFetchSeq);
        }
        if (isInitialFetch) {
          messageFetchGenerationByConversation.set(
            conversationId,
            fetchGeneration,
          );
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
          logMessageDebug("chatStore", "fetch_requested", {
            conversationId,
            fetchMode,
            syncReason,
            forceRefresh,
            fetchRequestedAt: fetchRequestedAt.toISOString(),
            before,
            after,
            beforeId,
            afterId,
            limit,
            initialFetchSeq,
            fetchGeneration,
          });

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
          let readState = normalizeConversationReadStateFromMeta(responseMeta);

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
                const retryMeta =
                  asRecord(asRecord(retryResp)?.meta) ?? responseMeta;
                const retryNormalized = normalizeMessagesResponse(
                  retryPayload,
                  retryMeta,
                );
                const retryReadState =
                  normalizeConversationReadStateFromMeta(retryMeta);
                if (
                  Array.isArray(retryNormalized.messages) &&
                  retryNormalized.messages.length > 0
                ) {
                  normalized = retryNormalized;
                  readState = retryReadState ?? readState;
                }
              }
            } catch {
              // ignore retry errors
            }
          }
          const hasMoreForDirection = after
            ? normalized.hasNext
            : normalized.hasPrev;

          set((state) => {
            if (
              initialFetchSeq !== null &&
              initialFetchSeqByConversation.get(conversationId) !==
                initialFetchSeq
            ) {
              logMessageDebug("chatStore", "fetch_stale_initial_ignored", {
                conversationId,
                fetchMode,
                initialFetchSeq,
                activeInitialFetchSeq:
                  initialFetchSeqByConversation.get(conversationId) ?? null,
              });
              return state;
            }
            if (
              messageFetchGenerationByConversation.get(conversationId) !==
              fetchGeneration
            ) {
              logMessageDebug("chatStore", "fetch_stale_generation_ignored", {
                conversationId,
                fetchMode,
                fetchGeneration,
                activeGeneration:
                  messageFetchGenerationByConversation.get(conversationId) ??
                  null,
              });
              return state;
            }

            const existingMessages = state.messages[conversationId] || [];
            const nextMessages =
              fetchMode === "initial"
                ? replaceMessages(existingMessages, normalized.messages, {
                    preserveMessagesCreatedAfter: fetchRequestedAt,
                  })
                : fetchMode === "older"
                  ? prependMessages(existingMessages, normalized.messages)
                  : appendMessages(existingMessages, normalized.messages);
            const mergedMessages = nextMessages;
            const messageState = buildConversationMessageState(
              state,
              conversationId,
              mergedMessages,
              {
                hydrated: true,
                hasNewer:
                  fetchMode === "initial" || fetchMode === "newer"
                    ? normalized.hasNext
                    : undefined,
              },
            );
            const currentConversation = messageState.conversationById[conversationId];
            const readStateConversation =
              readState && currentConversation
                ? applyConversationReadState(currentConversation, readState)
                : null;

            return {
              ...messageState,
              ...(readStateConversation
                ? {
                    conversations: messageState.conversations.map((conversation) =>
                      conversation.id === conversationId
                        ? readStateConversation
                        : conversation,
                    ),
                    conversationById: {
                      ...messageState.conversationById,
                      [conversationId]: readStateConversation,
                    },
                  }
                : {}),
              hasMoreMessages: {
                ...state.hasMoreMessages,
                [conversationId]:
                  before || (!before && !after)
                    ? normalized.hasPrev
                    : (state.hasMoreMessages[conversationId] ?? false),
              },
            };
          });
          logMessageDebug("chatStore", "fetch_applied", {
            conversationId,
            fetchMode,
            syncReason,
            loaded: normalized.messages.length,
            hasNext: normalized.hasNext,
            hasPrev: normalized.hasPrev,
            fetchGeneration,
            initialFetchSeq,
          });

          return {
            loaded: normalized.messages.length,
            hasMore: hasMoreForDirection,
            hasNext: normalized.hasNext,
            hasPrev: normalized.hasPrev,
            mode: fetchMode,
            applied:
              messageFetchGenerationByConversation.get(conversationId) ===
                fetchGeneration &&
              (initialFetchSeq === null ||
                initialFetchSeqByConversation.get(conversationId) ===
                  initialFetchSeq),
          };
        } catch (error: unknown) {
          const apiError = extractApiError(error);
          const errorMessage =
            apiError.message || i18n.t("error:chat.fetchMessagesFailed");
          logMessageDebug("chatStore", "fetch_failed", {
            conversationId,
            fetchMode,
            syncReason,
            before,
            after,
            beforeId: options?.beforeId,
            afterId: options?.afterId,
            errorMessage,
          });
          set((state) => ({
            error: errorMessage,
            messageErrors: {
              ...state.messageErrors,
              [conversationId]: errorMessage,
            },
          }));
          return {
            loaded: 0,
            hasMore: false,
            hasNext: false,
            hasPrev: false,
            mode: fetchMode,
            applied: false,
          };
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
        logMessageDebug("chatStore", "send_intent_received", {
          conversationId,
          contentLength: text.length,
          messageContentLength: messageContent.length,
          contentPreview: messageContent.slice(0, 120),
          type,
          attachmentCount: fileMetaArr?.length ?? 0,
          replyToId,
        });
        if (!messageContent) {
          logMessageDebug("chatStore", "send_blocked_empty", {
            conversationId,
          });
          throw new Error(i18n.t("error:chat.sendFailed"));
        }

        const conversation = get().conversations.find(
          (item) => item.id === conversationId,
        );
        if (conversation?.isBlocked) {
          const reason = i18n.t("chat:composer.blockedConversation", {
            defaultValue: "You cannot send messages in this conversation.",
          });
          setSendRestrictionInternal(conversationId, {
            kind: "blocked",
            reason,
            code: "CONVERSATION_BLOCKED",
          });
          logMessageDebug("chatStore", "send_blocked_conversation", {
            conversationId,
            reason,
          });
          throw new Error(reason);
        }
        const activeRestriction =
          get().sendRestrictionsByConversation[conversationId];
        if (activeRestriction) {
          logMessageDebug("chatStore", "send_blocked_restriction", {
            conversationId,
            restrictionKind: activeRestriction.kind,
            restrictionCode: activeRestriction.code,
            reason: activeRestriction.reason,
          });
          throw new Error(activeRestriction.reason);
        }

        const sender = resolveSenderIdentity();
        const sendMode = resolveConnectionSendMode();
        const browserOnline = getBrowserOnlineState();

        const localOrder = allocateLocalMessageOrder();
        const clientMessageId = generateClientMessageId(conversationId);
        const tempId = generateTempMessageId();
        const tempMessage: Message = {
          id: tempId,
          stableId: clientMessageId,
          clientMessageId,
          localId: tempId,
          localOrder,
          transportStatus: "optimistic",
          sendState: "sending",
          queuedReason: undefined,
          sendAttempts: 0,
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
        logMessageDebug("chatStore", "optimistic_message_created", {
          conversationId,
          correlationKey: getCorrelationKeyForMessage(tempMessage),
          tempId,
          clientMessageId,
          contentPreview: messageContent.slice(0, 120),
          sendMode,
          browserOnline,
          attachmentCount: fileMetaArr?.length ?? 0,
        });

        return dispatchExistingMessage(conversationId, tempMessage, "sending");
      },

      resendMessage: async (conversationId: string, message: Message) => {
        const activeRestriction =
          get().sendRestrictionsByConversation[conversationId];
        if (activeRestriction) {
          throw new Error(activeRestriction.reason);
        }

        return dispatchExistingMessage(conversationId, message, "sending");
      },

      flushQueuedMessages: async (conversationId?: string) => {
        const conversationIds = conversationId
          ? [conversationId]
          : Object.keys(get().outboxByConversation);

        logMessageDebug("chatStore", "offline_queue_flush_started", {
          conversationIds,
          connectionMode: resolveConnectionSendMode(),
        });

        for (const currentConversationId of conversationIds) {
          const queueKeys = [
            ...(get().outboxByConversation[currentConversationId] || []),
          ];
          const queuedMessages = queueKeys
            .map((queueKey) =>
              findMessageByQueueKey(
                get().messages[currentConversationId] || EMPTY_MESSAGES,
                queueKey,
              ),
            )
            .filter((item): item is Message => item !== undefined)
            .filter((item) => item.sendState === "queued")
            .sort((a, b) => (a.localOrder ?? 0) - (b.localOrder ?? 0));

          logMessageDebug("chatStore", "offline_queue_flush_conversation", {
            conversationId: currentConversationId,
            queueKeyCount: queueKeys.length,
            queuedMessageCount: queuedMessages.length,
          });

          for (const queuedMessage of queuedMessages) {
            try {
              await dispatchExistingMessage(
                currentConversationId,
                queuedMessage,
                queuedMessage.sendAttempts && queuedMessage.sendAttempts > 0
                  ? "retrying"
                  : "sending",
              );
            } catch {
              // Best effort flush. Terminal errors are reflected on the message row.
            }
          }
        }

        logMessageDebug("chatStore", "offline_queue_flushed", {
          conversationIds,
          connectionMode: resolveConnectionSendMode(),
        });
      },

      setSendRestriction: (conversationId, restriction) => {
        setSendRestrictionInternal(conversationId, restriction);
      },

      clearSendRestriction: (conversationId) => {
        clearSendRestrictionInternal(conversationId);
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

      clearError: () => set({ error: null, conversationsError: null }),

      reset: () => {
        roomMessageFetchInFlight.clear();
        initialFetchSeqByConversation.clear();
        messageFetchGenerationByConversation.clear();
        markAsReadInFlight.clear();
        conversationsFetchPromise = null;
        clearAllMessageSendTimeouts();
        set(initialState);
      },
    };
  }),
);

export const useSelectedConversation = () => {
  return useChatStore((state) => {
    if (!state.selectedConversationId) return null;
    return state.conversationById[state.selectedConversationId] ?? null;
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
    let filtered = state.orderedConversationIds
      .map((conversationId) => state.conversationById[conversationId])
      .filter((conversation): conversation is Conversation =>
        Boolean(conversation),
      );

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
      case "direct":
        filtered = filtered.filter((conversation) => {
          const type = normalizeRoomType(
            conversation.type,
            conversation.participants?.length,
          );
          return type === "direct" || type === "private";
        });
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

    return filtered;
  });
};

export const useTotalUnreadCount = () => {
  return useChatStore((state) => state.totalUnreadCount);
};

export const selectConversationMessagesFromState = (() => {
  let lastConversationId: string | null = null;
  let lastMessageIdsRef: string[] | undefined;
  let lastMessageByIdRef: ChatState["messageById"] | null = null;
  let lastResult: Message[] = EMPTY_MESSAGES;

  return (
    state: Pick<
      ChatState,
      "messageById" | "messageIdsByConversation" | "messages"
    >,
    conversationId: string | null,
  ): Message[] => {
    if (!conversationId) {
      lastConversationId = null;
      lastMessageIdsRef = undefined;
      lastMessageByIdRef = null;
      lastResult = EMPTY_MESSAGES;
      return EMPTY_MESSAGES;
    }

    const messageIds = state.messageIdsByConversation[conversationId];
    if (
      conversationId === lastConversationId &&
      messageIds === lastMessageIdsRef &&
      state.messageById === lastMessageByIdRef
    ) {
      return lastResult;
    }

    const nextResult =
      Array.isArray(messageIds) && messageIds.length > 0
        ? messageIds
            .map((messageId) => state.messageById[messageId])
            .filter((message): message is Message => Boolean(message))
        : (state.messages[conversationId] ?? EMPTY_MESSAGES);

    lastConversationId = conversationId;
    lastMessageIdsRef = messageIds;
    lastMessageByIdRef = state.messageById;
    lastResult = nextResult;

    return nextResult;
  };
})();

export const useCurrentMessages = () =>
  useChatStore(
    useShallow((state) => {
    const id = state.selectedConversationId;
      return selectConversationMessagesFromState(state, id);
    }),
  );

export const useMessagesByConversation = (conversationId: string | null) =>
  useChatStore(
    useShallow((state) =>
      selectConversationMessagesFromState(state, conversationId),
    ),
  );

export const useConversationCount = () =>
  useChatStore((state) => state.orderedConversationIds.length);

export const useHasConversation = (conversationId: string | null) =>
  useChatStore((state) =>
    conversationId ? Boolean(state.conversationById[conversationId]) : false,
  );

export const useAdjacentConversationIds = (conversationId: string | null) =>
  useChatStore(
    useShallow((state) => {
      const ordered = state.orderedConversationIds;
      if (!conversationId) {
        return [null, null] as [string | null, string | null];
      }

      const currentIndex = ordered.findIndex((id) => id === conversationId);
      if (currentIndex < 0) {
        return [null, null] as [string | null, string | null];
      }

      return [
        ordered[currentIndex - 1] ?? null,
        ordered[currentIndex + 1] ?? null,
      ] as [string | null, string | null];
    }),
  );

registerStoreResetter("chat", () => {
  useChatStore.getState().reset();
});
