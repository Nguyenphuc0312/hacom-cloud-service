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
import { resolveConversationId } from "../lib/conversationIdentity";
import i18n from "../i18n";
import { useAuthStore } from "./authStore";
import { registerStoreResetter } from "./storeResetRegistry";
import { conversationApi, messageApi } from "../services/api";
import { useChatSidebarStore } from "../features/chat/state/chatSidebarStore";
import { createChatOutboxController } from "./chatStoreOutbox";
import { createChatUnreadController } from "./chatStoreUnread";
import {
  removeConversationTypingStatuses,
  removeTypingStatus,
  selectCurrentTypingStatusFromState,
  upsertTypingStatus,
} from "./chatStoreTyping";
import type {
  Conversation,
  Message,
  TypingStatus,
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
  messageWindowByConversation: Record<string, ConversationMessageWindow>;
  messagesHydratedByConversation: Record<string, boolean>;
  historyStageByConversation: Record<string, HistoryStage>;
  hasAuthoritativeHistoryByConversation: Record<string, boolean>;
  prefetchedWindowByConversation: Record<string, boolean>;
  historyScopeKeyByConversation: Record<string, string | null>;
  latestHistoryRequestByConversation: Record<
    string,
    ConversationHistoryRequest | undefined
  >;
  selectedConversationId: string | null;
  typingStatuses: TypingStatus[];
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
  mergeConversationPage: (conversations: Conversation[]) => void;
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
  applyConversationParticipantSummary: (
    conversationId: string,
    participant: Record<string, unknown>,
  ) => void;
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
  refreshUnreadSummarySnapshot: () => Promise<void>;
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
      senderProfiles?: Record<string, SenderProfileSummary>;
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
      incrementUnread?: boolean;
      stage?: HistoryStage;
      hasAuthoritativeHistory?: boolean;
      prefetchedWindow?: boolean;
      historyScopeKey?: string | null;
      requestContext?: ConversationHistoryRequest;
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
    lastReadSeq?: number | null,
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
  clearConversationTypingStatuses: (conversationId: string) => void;

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

export type HistoryStage =
  | "empty"
  | "partial_unread_bootstrap"
  | "partial_prefetch"
  | "authoritative_initial_window"
  | "paginating_older"
  | "live_realtime";

export type HistoryQueryType =
  | "authoritative_open"
  | "prefetch"
  | "pagination_older"
  | "pagination_newer"
  | "room_refresh"
  | "unread_feed"
  | "optimistic"
  | "websocket";

interface ConversationHistoryRequest {
  requestId: string;
  queryType: HistoryQueryType;
  source: string;
  selectedConversationIdAtDispatch: string | null;
  historyScopeKey: string | null;
}

interface ConversationMessageWindow {
  oldestLoadedMessageId: string | null;
  oldestLoadedAt: string | null;
  newestLoadedMessageId: string | null;
  newestLoadedAt: string | null;
}

interface FetchMessagesOptions {
  force?: boolean;
  limit?: number;
  beforeId?: string;
  afterId?: string;
  syncReason?: "initial-sync" | "reconnect" | "conversation-refresh";
  source?: string;
  queryType?: HistoryQueryType;
  requestId?: string;
  selectedConversationIdAtDispatch?: string | null;
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
  messageWindowByConversation: {},
  messagesHydratedByConversation: {},
  historyStageByConversation: {},
  hasAuthoritativeHistoryByConversation: {},
  prefetchedWindowByConversation: {},
  historyScopeKeyByConversation: {},
  latestHistoryRequestByConversation: {},
  selectedConversationId: null,
  typingStatuses: [],
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
let activeAuthoritativeHistoryAbortController: AbortController | null = null;
let conversationsFetchPromise: Promise<void> | null = null;
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

const isCanceledRequestError = (error: unknown): boolean => {
  if (axios.isCancel(error)) {
    return true;
  }

  if (!error || typeof error !== "object") {
    return false;
  }

  const value = error as { code?: string; name?: string };
  return (
    value.code === "ERR_CANCELED" ||
    value.name === "AbortError" ||
    value.name === "CanceledError"
  );
};

const buildHistoryRequestId = (
  conversationId: string,
  queryType: HistoryQueryType,
): string =>
  `${queryType}:${conversationId}:${Date.now()}:${Math.random()
    .toString(36)
    .slice(2, 8)}`;

const buildHistoryScopeKey = (conversationId: string): string | null => {
  const currentUserId = useAuthStore.getState().user?.id;
  if (!currentUserId) {
    return null;
  }

  return ["global", "global", "global", currentUserId, conversationId].join(
    "|",
  );
};

const isAuthoritativeHistoryStage = (stage: HistoryStage | undefined): boolean =>
  stage === "authoritative_initial_window" || stage === "live_realtime";

const resolveHistoryStage = (
  currentStage: HistoryStage | undefined,
  options?: {
    stage?: HistoryStage;
    hasAuthoritativeHistory?: boolean;
  },
): HistoryStage => {
  if (options?.hasAuthoritativeHistory) {
    return options.stage ?? "authoritative_initial_window";
  }

  if (options?.stage) {
    return options.stage;
  }

  return currentStage ?? "empty";
};

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
  const conversationId = resolveConversationId(source, {
    source: "chatStore.normalizeMessage",
    fallbackConversationId: fallbackConversationId ?? null,
  });

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

const replaceConversationsInState = (
  _state: Pick<ChatState, "conversations">,
  conversations: Conversation[] | null | undefined,
) => {
  const normalized = mergeConversationCollections(
    normalizeConversationsPayload(
      Array.isArray(conversations) ? conversations : [],
    ),
  );

  return {
    conversations: normalized,
    ...buildConversationCollectionState(normalized),
  };
};

const mergeConversationPageIntoState = (
  state: Pick<ChatState, "conversations">,
  conversations: Conversation[] | null | undefined,
) => {
  const normalizedIncoming = mergeConversationCollections(
    normalizeConversationsPayload(
      Array.isArray(conversations) ? conversations : [],
    ),
  );
  const nextConversations = mergeConversationCollections([
    ...(Array.isArray(state.conversations) ? state.conversations : []),
    ...normalizedIncoming,
  ]);

  return {
    conversations: nextConversations,
    ...buildConversationCollectionState(nextConversations),
  };
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
    lastReadSeq?: number;
    lastReadMessageId: string | null;
    lastReadAt: string | null;
    firstUnreadMessageId?: string | null;
    firstUnreadMessageAt?: string | null;
  },
): Conversation =>
  (normalizeConversation({
    ...conversation,
    unreadCount: Math.max(0, readState.unreadCount ?? conversation.unreadCount ?? 0),
    lastReadSeq: readState.lastReadSeq ?? conversation.lastReadSeq ?? 0,
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
    lastReadSeq: readState.lastReadSeq ?? conversation.lastReadSeq ?? 0,
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

const buildConversationMessageWindow = (
  messages: Message[],
): ConversationMessageWindow => {
  const canonicalMessages = messages.filter((message) =>
    isCanonicalConversationMessage(message),
  );
  const oldestLoadedMessage = canonicalMessages[0] ?? null;
  const newestLoadedMessage =
    canonicalMessages[canonicalMessages.length - 1] ?? null;

  return {
    oldestLoadedMessageId: oldestLoadedMessage?.id ?? null,
    oldestLoadedAt: oldestLoadedMessage?.createdAt
      ? new Date(oldestLoadedMessage.createdAt).toISOString()
      : null,
    newestLoadedMessageId: newestLoadedMessage?.id ?? null,
    newestLoadedAt: newestLoadedMessage?.createdAt
      ? new Date(newestLoadedMessage.createdAt).toISOString()
      : null,
  };
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

const EMPTY_MESSAGE_WINDOW: ConversationMessageWindow = {
  oldestLoadedMessageId: null,
  oldestLoadedAt: null,
  newestLoadedMessageId: null,
  newestLoadedAt: null,
};

const updateConversationForLatestMessage = (
  conversation: Conversation,
  lastMessage: Message | null | undefined,
  latestCanonicalMessage: Message | null | undefined,
): Conversation =>
  !lastMessage
    ? ((normalizeConversation({
        ...conversation,
        lastMessage: undefined,
        lastMessageStatus: null,
      }) ?? {
        ...conversation,
        lastMessage: undefined,
        lastMessageStatus: null,
      }) as Conversation)
    : ((() => {
        const updatedAt =
          latestCanonicalMessage?.createdAt ??
          conversation.updatedAt ??
          lastMessage.createdAt;

        return (
          normalizeConversation({
            ...conversation,
            lastMessage: toMessageSummary(lastMessage),
            updatedAt,
            lastMessageAt:
              latestCanonicalMessage?.createdAt ?? conversation.lastMessageAt,
            lastMessageSortAt:
              latestCanonicalMessage?.createdAt ??
              conversation.lastMessageSortAt ??
              conversation.lastMessageAt ??
              updatedAt,
            lastMessageId:
              latestCanonicalMessage?.id ??
              conversation.lastMessageId ??
              lastMessage.id,
            lastMessageStatus: toConversationLastMessageStatus(lastMessage),
          }) ?? {
            ...conversation,
            lastMessage: toMessageSummary(lastMessage),
            updatedAt,
            lastMessageAt:
              latestCanonicalMessage?.createdAt ?? conversation.lastMessageAt,
            lastMessageSortAt:
              latestCanonicalMessage?.createdAt ??
              conversation.lastMessageSortAt ??
              conversation.lastMessageAt ??
              updatedAt,
            lastMessageId:
              latestCanonicalMessage?.id ??
              conversation.lastMessageId ??
              lastMessage.id,
            lastMessageStatus: toConversationLastMessageStatus(lastMessage),
          }
        );
      })() as Conversation);

const appendMessageAliasIndex = (
  aliasIndex: Record<string, string> | undefined,
  message: Message,
): Record<string, string> => {
  const canonicalId = getStableMessageId(message);
  const nextAliasIndex = {
    ...(aliasIndex || {}),
  };

  getMessageAliasCandidates(message).forEach((alias) => {
    nextAliasIndex[alias] = canonicalId;
  });

  return nextAliasIndex;
};

const appendMessageWindow = (
  currentWindow: ConversationMessageWindow | undefined,
  message: Message,
): ConversationMessageWindow => {
  if (!isCanonicalConversationMessage(message)) {
    return currentWindow ?? EMPTY_MESSAGE_WINDOW;
  }

  const nextTimestamp = message.createdAt
    ? new Date(message.createdAt).toISOString()
    : null;

  return {
    oldestLoadedMessageId:
      currentWindow?.oldestLoadedMessageId ?? message.id,
    oldestLoadedAt: currentWindow?.oldestLoadedAt ?? nextTimestamp,
    newestLoadedMessageId: message.id,
    newestLoadedAt: nextTimestamp,
  };
};

const resolveNewestCanonicalConversationMessage = (
  state: Pick<
    ChatState,
    | "messages"
    | "messageById"
    | "messageWindowByConversation"
  >,
  conversationId: string,
  currentMessages?: Message[],
): Message | null => {
  const newestCanonicalId =
    state.messageWindowByConversation[conversationId]?.newestLoadedMessageId;
  if (newestCanonicalId) {
    return state.messageById[newestCanonicalId] ?? null;
  }

  const sourceMessages = currentMessages ?? state.messages[conversationId] ?? [];
  for (let index = sourceMessages.length - 1; index >= 0; index -= 1) {
    const candidate = sourceMessages[index];
    if (candidate && isCanonicalConversationMessage(candidate)) {
      return candidate;
    }
  }

  return null;
};

const canAppendMessageAtTail = (
  currentMessages: Message[],
  incoming: Message,
): boolean => {
  const lastMessage = currentMessages[currentMessages.length - 1];
  if (!lastMessage) {
    return true;
  }

  return compareMessages(lastMessage, incoming) <= 0;
};

const canUseAppendOnlyMessageFastPath = (
  currentMessages: Message[],
  incomingList: Message[],
  hadExistingIdentity: boolean,
  options?: {
    mode?: "replace" | "prepend" | "append" | "upsert";
  },
): boolean => {
  if (hadExistingIdentity || incomingList.length !== 1) {
    return false;
  }

  if (options?.mode === "replace" || options?.mode === "prepend") {
    return false;
  }

  const incoming = incomingList[0];
  if (incoming.replyTo && !incoming.replyToMessage) {
    return false;
  }

  return canAppendMessageAtTail(currentMessages, incoming);
};

const buildAppendOnlyConversationMessageState = (
  state: Pick<
    ChatState,
    | "conversations"
    | "messages"
    | "messageById"
    | "messageIdsByConversation"
    | "messageAliasIndexByConversation"
    | "messageWindowByConversation"
    | "messagesHydratedByConversation"
    | "hasNewerMessagesByConversation"
    | "historyStageByConversation"
    | "hasAuthoritativeHistoryByConversation"
    | "prefetchedWindowByConversation"
    | "historyScopeKeyByConversation"
    | "latestHistoryRequestByConversation"
  >,
  conversationId: string,
  incomingMessage: Message,
  options?: {
    hydrated?: boolean;
    hasNewer?: boolean;
    stage?: HistoryStage;
    hasAuthoritativeHistory?: boolean;
    prefetchedWindow?: boolean;
    historyScopeKey?: string | null;
    requestContext?: ConversationHistoryRequest;
  },
) => {
  const currentMessages = state.messages[conversationId] || [];
  const nextMessages = [...currentMessages, incomingMessage];
  const stableMessageId = getStableMessageId(incomingMessage);
  const existingConversation =
    state.conversations.find((conversation) => conversation.id === conversationId) ??
    null;
  const previousCanonicalMessage = resolveNewestCanonicalConversationMessage(
    state,
    conversationId,
    currentMessages,
  );
  const latestCanonicalMessage = isCanonicalConversationMessage(incomingMessage)
    ? incomingMessage
    : previousCanonicalMessage;
  const conversations =
    existingConversation === null
      ? state.conversations
      : replaceConversationInActivityOrder(
          state.conversations,
          updateConversationForLatestMessage(
            existingConversation,
            incomingMessage,
            latestCanonicalMessage,
          ),
        );

  const nextHistoryScopeKey =
    options?.historyScopeKey ??
    state.historyScopeKeyByConversation[conversationId] ??
    buildHistoryScopeKey(conversationId);
  const nextHasAuthoritativeHistory =
    options?.hasAuthoritativeHistory ??
    state.hasAuthoritativeHistoryByConversation[conversationId] ??
    false;
  const nextHistoryStage = resolveHistoryStage(
    state.historyStageByConversation[conversationId],
    {
      stage: options?.stage,
      hasAuthoritativeHistory: nextHasAuthoritativeHistory,
    },
  );
  const nextPrefetchedWindow =
    options?.prefetchedWindow ??
    (nextHasAuthoritativeHistory
      ? false
      : state.prefetchedWindowByConversation[conversationId] ?? false);
  const nextHydrated =
    options?.hydrated ??
    (nextHasAuthoritativeHistory && Boolean(nextHistoryScopeKey));

  return {
    conversations,
    messages: {
      ...state.messages,
      [conversationId]: nextMessages,
    },
    messageById: {
      ...state.messageById,
      [stableMessageId]: incomingMessage,
    },
    messageIdsByConversation: {
      ...state.messageIdsByConversation,
      [conversationId]: [
        ...(state.messageIdsByConversation[conversationId] ?? []),
        stableMessageId,
      ],
    },
    messageAliasIndexByConversation: {
      ...state.messageAliasIndexByConversation,
      [conversationId]: appendMessageAliasIndex(
        state.messageAliasIndexByConversation[conversationId],
        incomingMessage,
      ),
    },
    messageWindowByConversation: {
      ...state.messageWindowByConversation,
      [conversationId]: appendMessageWindow(
        state.messageWindowByConversation[conversationId],
        incomingMessage,
      ),
    },
    messagesHydratedByConversation: {
      ...state.messagesHydratedByConversation,
      [conversationId]: nextHydrated,
    },
    hasNewerMessagesByConversation:
      options?.hasNewer === undefined
        ? state.hasNewerMessagesByConversation
        : {
            ...state.hasNewerMessagesByConversation,
            [conversationId]: options.hasNewer,
          },
    historyStageByConversation: {
      ...state.historyStageByConversation,
      [conversationId]: nextHistoryStage,
    },
    hasAuthoritativeHistoryByConversation: {
      ...state.hasAuthoritativeHistoryByConversation,
      [conversationId]: nextHasAuthoritativeHistory,
    },
    prefetchedWindowByConversation: {
      ...state.prefetchedWindowByConversation,
      [conversationId]: nextPrefetchedWindow,
    },
    historyScopeKeyByConversation: {
      ...state.historyScopeKeyByConversation,
      [conversationId]: nextHistoryScopeKey,
    },
    latestHistoryRequestByConversation: {
      ...state.latestHistoryRequestByConversation,
      ...(options?.requestContext
        ? { [conversationId]: options.requestContext }
        : {}),
    },
    ...buildConversationCollectionState(conversations),
  };
};

const FAST_MESSAGE_PATCH_FIELDS = new Set<string>([
  "deliveredAt",
  "errorCode",
  "errorMessage",
  "failureReason",
  "lastSendAttemptAt",
  "queuedReason",
  "readAt",
  "readBy",
  "sendAttempts",
  "sendState",
  "serverSeq",
  "serverTs",
  "status",
  "transportStatus",
  "updatedAt",
  "version",
]);

const canUseFastMessagePatch = (updates: Partial<Message>): boolean => {
  const keys = Object.keys(updates);
  return (
    keys.length > 0 &&
    keys.every((key) => FAST_MESSAGE_PATCH_FIELDS.has(key))
  );
};

const buildPatchedConversationMessageState = (
  state: Pick<
    ChatState,
    | "conversations"
    | "messages"
    | "messageById"
    | "messageIdsByConversation"
    | "messageAliasIndexByConversation"
    | "messageWindowByConversation"
    | "messagesHydratedByConversation"
    | "hasNewerMessagesByConversation"
    | "historyStageByConversation"
    | "hasAuthoritativeHistoryByConversation"
    | "prefetchedWindowByConversation"
    | "historyScopeKeyByConversation"
    | "latestHistoryRequestByConversation"
  >,
  conversationId: string,
  resolvedMessageId: string,
  updates: Partial<Message>,
) => {
  if (!canUseFastMessagePatch(updates)) {
    return null;
  }

  const currentMessages = state.messages[conversationId] || [];
  const targetIndex = currentMessages.findIndex((message) =>
    matchesMessageIdentityValue(message, resolvedMessageId),
  );
  if (targetIndex < 0) {
    return null;
  }

  const currentMessage = currentMessages[targetIndex];
  const nextMessage = { ...currentMessage, ...updates } as Message;
  const nextMessages = [...currentMessages];
  nextMessages[targetIndex] = nextMessage;

  const currentConversation =
    state.conversations.find((conversation) => conversation.id === conversationId) ??
    null;
  const shouldPatchConversationSummary =
    currentConversation?.lastMessage?.id === currentMessage.id;
  const conversations =
    currentConversation && shouldPatchConversationSummary
      ? replaceConversationInActivityOrder(
          state.conversations,
          (normalizeConversation({
            ...currentConversation,
            lastMessage: toMessageSummary(nextMessage),
            lastMessageStatus: toConversationLastMessageStatus(nextMessage),
          }) ?? {
            ...currentConversation,
            lastMessage: toMessageSummary(nextMessage),
            lastMessageStatus: toConversationLastMessageStatus(nextMessage),
          }),
        )
      : state.conversations;

  return {
    conversations,
    messages: {
      ...state.messages,
      [conversationId]: nextMessages,
    },
    messageById: {
      ...state.messageById,
      [getStableMessageId(currentMessage)]: nextMessage,
    },
    messageIdsByConversation: state.messageIdsByConversation,
    messageAliasIndexByConversation: state.messageAliasIndexByConversation,
    messageWindowByConversation: state.messageWindowByConversation,
    messagesHydratedByConversation: state.messagesHydratedByConversation,
    hasNewerMessagesByConversation: state.hasNewerMessagesByConversation,
    historyStageByConversation: state.historyStageByConversation,
    hasAuthoritativeHistoryByConversation:
      state.hasAuthoritativeHistoryByConversation,
    prefetchedWindowByConversation: state.prefetchedWindowByConversation,
    historyScopeKeyByConversation: state.historyScopeKeyByConversation,
    latestHistoryRequestByConversation: state.latestHistoryRequestByConversation,
    ...buildConversationCollectionState(conversations),
  };
};

const buildConversationMessageState = (
  state: Pick<
    ChatState,
    | "conversations"
    | "messages"
    | "messageById"
    | "messageIdsByConversation"
    | "messageAliasIndexByConversation"
    | "messageWindowByConversation"
    | "messagesHydratedByConversation"
    | "hasNewerMessagesByConversation"
    | "historyStageByConversation"
    | "hasAuthoritativeHistoryByConversation"
    | "prefetchedWindowByConversation"
    | "historyScopeKeyByConversation"
    | "latestHistoryRequestByConversation"
  >,
  conversationId: string,
  nextMessages: Message[],
  options?: {
    hydrated?: boolean;
    hasNewer?: boolean;
    stage?: HistoryStage;
    hasAuthoritativeHistory?: boolean;
    prefetchedWindow?: boolean;
    historyScopeKey?: string | null;
    requestContext?: ConversationHistoryRequest;
  },
) => {
  const resolvedMessages = attachReplySnapshots(nextMessages);
  const lastMessage = resolvedMessages[resolvedMessages.length - 1];
  const latestCanonicalMessage = [...resolvedMessages]
    .reverse()
    .find((message) => isCanonicalConversationMessage(message));
  const nextAliasIndex = rebuildConversationMessageAliasIndex(resolvedMessages);
  const nextMessageWindow = buildConversationMessageWindow(resolvedMessages);
  const existingConversation =
    state.conversations.find((conversation) => conversation.id === conversationId) ??
    null;
  const conversations = existingConversation
    ? replaceConversationInActivityOrder(
        state.conversations,
        updateConversationForLatestMessage(
          existingConversation,
          lastMessage,
          latestCanonicalMessage,
        ),
      )
    : state.conversations;

  const messageIndexState = buildConversationMessageIndexState(
    state,
    conversationId,
    resolvedMessages,
  );

  const nextHistoryScopeKey =
    options?.historyScopeKey ??
    state.historyScopeKeyByConversation[conversationId] ??
    buildHistoryScopeKey(conversationId);
  const nextHasAuthoritativeHistory =
    options?.hasAuthoritativeHistory ??
    state.hasAuthoritativeHistoryByConversation[conversationId] ??
    false;
  const nextHistoryStage = resolveHistoryStage(
    state.historyStageByConversation[conversationId],
    {
      stage: options?.stage,
      hasAuthoritativeHistory: nextHasAuthoritativeHistory,
    },
  );
  const nextPrefetchedWindow =
    options?.prefetchedWindow ??
    (nextHasAuthoritativeHistory
      ? false
      : state.prefetchedWindowByConversation[conversationId] ?? false);
  const nextHydrated =
    options?.hydrated ??
    (nextHasAuthoritativeHistory && Boolean(nextHistoryScopeKey));

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
    messageWindowByConversation: {
      ...state.messageWindowByConversation,
      [conversationId]: nextMessageWindow,
    },
    messagesHydratedByConversation: {
      ...state.messagesHydratedByConversation,
      [conversationId]: nextHydrated,
    },
    hasNewerMessagesByConversation:
      options?.hasNewer === undefined
        ? state.hasNewerMessagesByConversation
        : {
            ...state.hasNewerMessagesByConversation,
            [conversationId]: options.hasNewer,
          },
    historyStageByConversation: {
      ...state.historyStageByConversation,
      [conversationId]: nextHistoryStage,
    },
    hasAuthoritativeHistoryByConversation: {
      ...state.hasAuthoritativeHistoryByConversation,
      [conversationId]: nextHasAuthoritativeHistory,
    },
    prefetchedWindowByConversation: {
      ...state.prefetchedWindowByConversation,
      [conversationId]: nextPrefetchedWindow,
    },
    historyScopeKeyByConversation: {
      ...state.historyScopeKeyByConversation,
      [conversationId]: nextHistoryScopeKey,
    },
    latestHistoryRequestByConversation: {
      ...state.latestHistoryRequestByConversation,
      ...(options?.requestContext
        ? { [conversationId]: options.requestContext }
        : {}),
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
    | "messageWindowByConversation"
    | "messagesHydratedByConversation"
    | "hasNewerMessagesByConversation"
    | "historyStageByConversation"
    | "hasAuthoritativeHistoryByConversation"
    | "prefetchedWindowByConversation"
    | "historyScopeKeyByConversation"
    | "latestHistoryRequestByConversation"
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
    stage?: HistoryStage;
    hasAuthoritativeHistory?: boolean;
    prefetchedWindow?: boolean;
    historyScopeKey?: string | null;
    requestContext?: ConversationHistoryRequest;
    senderProfiles?: Record<string, SenderProfileSummary>;
  },
) => {
  const incomingList = applySenderProfilesToMessages(
    (Array.isArray(messages) ? messages : [messages])
      .map((item) => normalizeMessage(item, conversationId))
      .filter((item): item is Message => item !== null),
    options?.senderProfiles ?? {},
  );
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
  if (
    canUseAppendOnlyMessageFastPath(
      currentMessages,
      incomingList,
      hadExistingIdentity,
      options,
    )
  ) {
    const mergedMessage = incomingList[0];
    const messageState = buildAppendOnlyConversationMessageState(
      state,
      conversationId,
      mergedMessage,
      {
        hydrated: options?.hydrated,
        hasNewer: options?.hasNewer,
        stage: options?.stage,
        hasAuthoritativeHistory: options?.hasAuthoritativeHistory,
        prefetchedWindow: options?.prefetchedWindow,
        historyScopeKey: options?.historyScopeKey,
        requestContext: options?.requestContext,
      },
    );
    const unreadDelta =
      options?.incrementUnread && mergedMessage ? 1 : 0;
    const conversations =
      unreadDelta > 0
        ? messageState.conversations.map((conversation) => {
            if (conversation.id !== conversationId) {
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
        status: "new" as const,
        canonicalMessage: isCanonicalConversationMessage(mergedMessage)
          ? mergedMessage
          : null,
        mergedMessage,
        unreadDelta,
      },
    };
  }

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
    hydrated: options?.hydrated,
    hasNewer: options?.hasNewer,
    stage: options?.stage,
    hasAuthoritativeHistory: options?.hasAuthoritativeHistory,
    prefetchedWindow: options?.prefetchedWindow,
    historyScopeKey: options?.historyScopeKey,
    requestContext: options?.requestContext,
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

type SenderProfileSummary = {
  id: string;
  username: string;
  displayName: string;
  avatar?: string | null;
  status?: string | null;
};

const normalizeSenderProfileSummary = (
  value: unknown,
  fallbackUserId?: string,
): SenderProfileSummary | null => {
  const source = asRecord(value);
  if (!source) {
    return null;
  }

  const id =
    asStringValue(source.id) ??
    asStringValue(source.userId) ??
    asStringValue(source.user_id) ??
    fallbackUserId;
  if (!id) {
    return null;
  }

  const username =
    asStringValue(source.username) ??
    asStringValue(source.employeeCode) ??
    asStringValue(source.employee_code) ??
    id;
  const displayName =
    resolveUserDisplayName(
      {
        ...source,
        id,
        username,
      },
      { allowLegacyFallback: false },
    ) ?? username;

  return {
    id,
    username,
    displayName,
    avatar: asStringValue(source.avatar) ?? null,
    status: asStringValue(source.status) ?? null,
  };
};

const normalizeSenderProfiles = (
  value: unknown,
): Record<string, SenderProfileSummary> => {
  const source = asRecord(value);
  if (!source) {
    return {};
  }

  return Object.entries(source).reduce<Record<string, SenderProfileSummary>>(
    (accumulator, [userId, rawProfile]) => {
      const normalized = normalizeSenderProfileSummary(rawProfile, userId);
      if (!normalized) {
        return accumulator;
      }

      accumulator[normalized.id] = normalized;
      return accumulator;
    },
    {},
  );
};

const applySenderProfilesToMessage = (
  message: Message,
  senderProfiles: Record<string, SenderProfileSummary>,
): Message => {
  if (!message || Object.keys(senderProfiles).length === 0) {
    return message;
  }

  const senderProfile = senderProfiles[message.senderId];
  const replySenderProfile = message.replyToMessage
    ? senderProfiles[message.replyToMessage.senderId]
    : undefined;
  const nextSenderName = senderProfile?.displayName ?? message.senderName;
  const nextSenderAvatar =
    senderProfile?.avatar && senderProfile.avatar.trim().length > 0
      ? senderProfile.avatar
      : message.senderAvatar;
  const nextReplySenderName =
    replySenderProfile?.displayName ?? message.replyToMessage?.senderName;
  const nextReplySenderAvatar =
    replySenderProfile?.avatar && replySenderProfile.avatar.trim().length > 0
      ? replySenderProfile.avatar
      : message.replyToMessage?.senderAvatar;

  const senderUnchanged =
    nextSenderName === message.senderName &&
    nextSenderAvatar === message.senderAvatar;
  const replyUnchanged =
    !message.replyToMessage ||
    (nextReplySenderName === message.replyToMessage.senderName &&
      nextReplySenderAvatar === message.replyToMessage.senderAvatar);

  if (senderUnchanged && replyUnchanged) {
    return message;
  }

  return {
    ...message,
    senderName: nextSenderName,
    senderAvatar: nextSenderAvatar,
    ...(message.replyToMessage
      ? {
          replyToMessage: {
            ...message.replyToMessage,
            senderName:
              nextReplySenderName ?? message.replyToMessage.senderName,
            senderAvatar: nextReplySenderAvatar,
          },
        }
      : {}),
  };
};

const applySenderProfilesToMessages = (
  messages: Message[],
  senderProfiles: Record<string, SenderProfileSummary>,
): Message[] => {
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages;
  }

  let changed = false;
  const nextMessages = messages.map((message) => {
    const nextMessage = applySenderProfilesToMessage(message, senderProfiles);
    if (nextMessage !== message) {
      changed = true;
    }
    return nextMessage;
  });

  return changed ? nextMessages : messages;
};

const applySenderProfilesToConversation = (
  conversation: Conversation,
  senderProfiles: Record<string, SenderProfileSummary>,
): Conversation => {
  if (!conversation || Object.keys(senderProfiles).length === 0) {
    return conversation;
  }

  let changed = false;

  const nextParticipants = Array.isArray(conversation.participants)
    ? conversation.participants.map((participant) => {
        const senderProfile = senderProfiles[participant.id];
        if (!senderProfile) {
          return participant;
        }

        const nextDisplayName =
          senderProfile.displayName || participant.displayName;
        const nextAvatar =
          senderProfile.avatar && senderProfile.avatar.trim().length > 0
            ? senderProfile.avatar
            : participant.avatar;
        const nextStatus =
          senderProfile.status && senderProfile.status.trim().length > 0
            ? senderProfile.status
            : participant.status;
        const nextUsername =
          senderProfile.username || participant.username;

        if (
          nextDisplayName === participant.displayName &&
          nextAvatar === participant.avatar &&
          nextStatus === participant.status &&
          nextUsername === participant.username
        ) {
          return participant;
        }

        changed = true;
        return {
          ...participant,
          displayName: nextDisplayName,
          avatar: nextAvatar,
          status: nextStatus as typeof participant.status,
          username: nextUsername,
        };
      })
    : conversation.participants;

  const otherUserProfile =
    conversation.otherUser?.id &&
    senderProfiles[conversation.otherUser.id]
      ? senderProfiles[conversation.otherUser.id]
      : null;
  const nextOtherUser =
    otherUserProfile && conversation.otherUser
      ? {
          ...conversation.otherUser,
          displayName:
            otherUserProfile.displayName || conversation.otherUser.displayName,
          avatar:
            otherUserProfile.avatar && otherUserProfile.avatar.trim().length > 0
              ? otherUserProfile.avatar
              : conversation.otherUser.avatar,
          status:
            (otherUserProfile.status &&
            otherUserProfile.status.trim().length > 0
              ? otherUserProfile.status
              : conversation.otherUser.status) as typeof conversation.otherUser.status,
          username:
            otherUserProfile.username || conversation.otherUser.username,
        }
      : conversation.otherUser;

  if (nextOtherUser !== conversation.otherUser) {
    changed = true;
  }

  const lastMessageProfile =
    conversation.lastMessage?.senderId &&
    senderProfiles[conversation.lastMessage.senderId]
      ? senderProfiles[conversation.lastMessage.senderId]
      : null;
  const nextLastMessage =
    lastMessageProfile && conversation.lastMessage
      ? {
          ...conversation.lastMessage,
          senderName:
            lastMessageProfile.displayName || conversation.lastMessage.senderName,
        }
      : conversation.lastMessage;

  if (nextLastMessage !== conversation.lastMessage) {
    changed = true;
  }

  const nextDisplayName =
    conversation.type === "direct" || conversation.type === "private"
      ? nextOtherUser?.displayName ?? conversation.displayName
      : conversation.displayName;
  const nextDisplayAvatar =
    conversation.type === "direct" || conversation.type === "private"
      ? nextOtherUser?.avatar ?? conversation.displayAvatar
      : conversation.displayAvatar;

  if (
    nextDisplayName !== conversation.displayName ||
    nextDisplayAvatar !== conversation.displayAvatar
  ) {
    changed = true;
  }

  if (!changed) {
    return conversation;
  }

  return {
    ...conversation,
    ...(nextParticipants ? { participants: nextParticipants } : {}),
    ...(nextOtherUser ? { otherUser: nextOtherUser } : {}),
    ...(nextLastMessage ? { lastMessage: nextLastMessage } : {}),
    ...(nextDisplayName ? { displayName: nextDisplayName } : {}),
    ...(nextDisplayAvatar !== undefined
      ? { displayAvatar: nextDisplayAvatar ?? null }
      : {}),
  };
};

const normalizeMessagesResponse = (
  rawData: unknown,
  responseMeta?: Record<string, unknown> | null,
): {
  messages: Message[];
  hasNext: boolean;
  hasPrev: boolean;
  senderProfiles: Record<string, SenderProfileSummary>;
} => {
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
      senderProfiles: {},
    };
  }

  const payload = asRecord(rawData);
  if (!payload) {
    return { messages: [], hasNext: false, hasPrev: false, senderProfiles: {} };
  }

  const rawMessages = Array.isArray(payload.messages)
    ? payload.messages
    : Array.isArray(payload.items)
      ? payload.items
      : [];
  const senderProfiles = normalizeSenderProfiles(payload.senderProfiles);
  const messages = applySenderProfilesToMessages(
    rawMessages
    .map((item) => normalizeMessage(item))
    .filter((item): item is Message => item !== null),
    senderProfiles,
  );
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
    senderProfiles,
  };
};

const normalizeConversationReadStateFromMeta = (
  responseMeta?: Record<string, unknown> | null,
): {
  unreadCount: number;
  lastReadSeq: number;
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
    lastReadSeq: Math.max(0, asNumberValue(payload.lastReadSeq) ?? 0),
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

export const useChatStore = create<ChatState>()(
  subscribeWithSelector((set, get) => {
    const outboxController = createChatOutboxController<ChatState>({
      set,
      get,
      emptyMessages: EMPTY_MESSAGES,
      sendMessageRequest: (conversationId, payload) =>
        messageApi.sendMessage(conversationId, payload),
      normalizeMessage,
      resolveSendFailureDescriptor,
      getMessageQueueKey,
      getCorrelationKeyForMessage,
      getReplyToId,
      toAttachmentPayload,
      resolveSenderIdentity,
      resolveConnectionSendMode,
      updateMessage: (conversationId, messageId, updates) =>
        get().updateMessage(conversationId, messageId, updates),
      ackOutgoingMessage: (conversationId, clientMessageId, serverMessage) =>
        get().ackOutgoingMessage(conversationId, clientMessageId, serverMessage),
      failOutgoingMessage: (conversationId, clientMessageId, updates) =>
        get().failOutgoingMessage(conversationId, clientMessageId, updates),
    });

    const unreadController = createChatUnreadController<ChatState>({
      set,
      get,
      emptyMessages: EMPTY_MESSAGES,
      markConversationAsRead: (conversationId, anchorId) =>
        conversationApi.markAsRead(conversationId, anchorId),
      getUnreadSummary: () => conversationApi.getUnreadSummary(),
      compareAnchorIdsInConversation,
      normalizeConversation,
      buildConversationCollectionState,
      getConversationCursorTimestamp,
      updateConversationReadProgress,
    });

    return {
      ...initialState,

      setConversations: (conversations) => {
        set((state) => replaceConversationsInState(state, conversations));
        conversations.forEach((conversation) => {
          if (conversation.canCurrentUserSend === true) {
            outboxController.clearSendRestriction(conversation.id);
          }
        });
      },

      mergeConversationPage: (conversations) => {
        set((state) => mergeConversationPageIntoState(state, conversations));
        conversations.forEach((conversation) => {
          if (conversation.canCurrentUserSend === true) {
            outboxController.clearSendRestriction(conversation.id);
          }
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

        if (normalized.canCurrentUserSend === true) {
          outboxController.clearSendRestriction(normalized.id);
        }
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

        if (normalized.canCurrentUserSend === true) {
          outboxController.clearSendRestriction(normalized.id);
        }

        return result;
      },

      updateConversation: (id, updates) => {
        const nextConversation = normalizeConversation({ id, ...updates });
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

        if (nextConversation?.canCurrentUserSend === true) {
          outboxController.clearSendRestriction(id);
        }
      },

      applyConversationParticipantSummary: (conversationId, participant) => {
        const normalizedParticipant = normalizeSenderProfileSummary(participant);
        if (!normalizedParticipant) {
          return;
        }

        set((state) => {
          const senderProfiles = {
            [normalizedParticipant.id]: normalizedParticipant,
          };
          const currentMessages = state.messages[conversationId] || EMPTY_MESSAGES;
          const nextMessages = applySenderProfilesToMessages(
            currentMessages,
            senderProfiles,
          );
          const messagesChanged = nextMessages !== currentMessages;
          const currentConversation = state.conversationById[conversationId];
          const nextConversation = currentConversation
            ? applySenderProfilesToConversation(currentConversation, senderProfiles)
            : null;
          const conversationChanged = nextConversation !== currentConversation;

          if (!messagesChanged && !conversationChanged) {
            return state;
          }

          const nextMessageById = messagesChanged
            ? nextMessages.reduce<Record<string, Message>>((accumulator, message) => {
                accumulator[message.id] = message;
                return accumulator;
              }, {
                ...state.messageById,
              })
            : state.messageById;

          const nextConversations = conversationChanged
            ? mergeConversationCollections(
                (Array.isArray(state.conversations) ? state.conversations : []).map(
                  (conversation) =>
                    conversation.id === conversationId && nextConversation
                      ? nextConversation
                      : conversation,
                ),
              )
            : state.conversations;

          return {
            ...(messagesChanged
              ? {
                  messages: {
                    ...state.messages,
                    [conversationId]: nextMessages,
                  },
                  messageById: nextMessageById,
                }
              : {}),
            ...(conversationChanged
              ? {
                  conversations: nextConversations,
                  ...buildConversationCollectionState(nextConversations),
                }
              : {}),
          };
        });
      },

      removeConversation: (id) => {
        roomMessageFetchInFlight.delete(id);
        initialFetchSeqByConversation.delete(id);
        messageFetchGenerationByConversation.delete(id);
        outboxController.clearConversationTracking(id);
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
            messageWindowByConversation: Object.fromEntries(
              Object.entries(state.messageWindowByConversation).filter(
                ([key]) => key !== id,
              ),
            ),
            messagesHydratedByConversation: Object.fromEntries(
              Object.entries(state.messagesHydratedByConversation).filter(
                ([key]) => key !== id,
              ),
            ),
            historyStageByConversation: Object.fromEntries(
              Object.entries(state.historyStageByConversation).filter(
                ([key]) => key !== id,
              ),
            ),
            hasAuthoritativeHistoryByConversation: Object.fromEntries(
              Object.entries(state.hasAuthoritativeHistoryByConversation).filter(
                ([key]) => key !== id,
              ),
            ),
            prefetchedWindowByConversation: Object.fromEntries(
              Object.entries(state.prefetchedWindowByConversation).filter(
                ([key]) => key !== id,
              ),
            ),
            historyScopeKeyByConversation: Object.fromEntries(
              Object.entries(state.historyScopeKeyByConversation).filter(
                ([key]) => key !== id,
              ),
            ),
            latestHistoryRequestByConversation: Object.fromEntries(
              Object.entries(state.latestHistoryRequestByConversation).filter(
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
            ...outboxController.buildConversationCleanupState(state, id),
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

      markAsRead: unreadController.markAsRead,

      applyUnreadSummary: unreadController.applyUnreadSummary,

      refreshUnreadSummarySnapshot: unreadController.refreshUnreadSummarySnapshot,

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

      applyOptimisticConversationRead:
        unreadController.applyOptimisticConversationRead,

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
            set((state) => ({
              ...mergeConversationPageIntoState(state, conversations),
              isLoadingConversations: false,
              hasFetchedConversationsOnce: true,
            }));
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
          hasAuthoritativeHistory: true,
          stage: "authoritative_initial_window",
          hasNewer: false,
          source: "setMessages",
          historyScopeKey: buildHistoryScopeKey(conversationId),
        });
      },

      addMessage: (conversationId, message) => {
        get().ingestMessages(conversationId, message, {
          mode: "upsert",
          stage: isAuthoritativeHistoryStage(
            get().historyStageByConversation[conversationId],
          )
            ? "live_realtime"
            : get().historyStageByConversation[conversationId] ?? "empty",
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
            stage: isAuthoritativeHistoryStage(
              get().historyStageByConversation[conversationId],
            )
              ? "live_realtime"
              : get().historyStageByConversation[conversationId] ?? "empty",
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
              stage:
                options?.source === "message:new" ||
                options?.source === "message:updated" ||
                options?.source === "realtime"
                  ? isAuthoritativeHistoryStage(
                      state.historyStageByConversation[conversationId],
                    )
                    ? "live_realtime"
                    : state.historyStageByConversation[conversationId] ?? "empty"
                  : state.historyStageByConversation[conversationId] ?? "empty",
              hasAuthoritativeHistory:
                state.hasAuthoritativeHistoryByConversation[conversationId] ??
                false,
              source: options?.source ?? "realtime",
              incrementUnread: options?.incrementUnread,
              senderProfiles: options?.senderProfiles,
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

          const fastPatchedState = buildPatchedConversationMessageState(
            state,
            conversationId,
            resolvedMessageId,
            updates,
          );
          if (fastPatchedState) {
            return fastPatchedState;
          }

          return buildConversationMessageState(state, conversationId, updatedMessages, {
            stage:
              state.historyStageByConversation[conversationId] ??
              (state.hasAuthoritativeHistoryByConversation[conversationId]
                ? "authoritative_initial_window"
                : "empty"),
            hasAuthoritativeHistory:
              state.hasAuthoritativeHistoryByConversation[conversationId] ??
              false,
          });
        });
      },

      markMessagesReadUpTo: (conversationId, lastMessageId, readerId, lastReadSeq) => {
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
            const messageSeq = toFiniteNumber(message.serverSeq);
            const withinSeqBoundary =
              typeof lastReadSeq === "number" &&
              Number.isFinite(lastReadSeq) &&
              messageSeq !== null &&
              messageSeq <= lastReadSeq;

            if (boundaryIndex < 0) {
              return withinSeqBoundary || matchesMessageIdentityValue(message, lastMessageId)
                ? { ...message, status: MessageStatus.READ, readAt }
                : message;
            }

            return withinSeqBoundary || index <= boundaryIndex
              ? { ...message, status: MessageStatus.READ, readAt }
              : message;
          });

          return buildConversationMessageState(state, conversationId, updatedMessages, {
            hydrated:
              state.hasAuthoritativeHistoryByConversation[conversationId] ??
              false,
            hasAuthoritativeHistory:
              state.hasAuthoritativeHistoryByConversation[conversationId] ??
              false,
            stage:
              state.historyStageByConversation[conversationId] ??
              (state.hasAuthoritativeHistoryByConversation[conversationId]
                ? "live_realtime"
                : "empty"),
          });
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
          outboxController.clearMessageTracking(conversationId, currentMessage);
        }
        set((state) => {
          const updatedMessages = (state.messages[conversationId] || []).filter(
            (message) => !matchesMessageIdentityValue(message, resolvedMessageId),
          );
          const nextState = buildConversationMessageState(
            state,
            conversationId,
            updatedMessages,
            {
              stage:
                state.historyStageByConversation[conversationId] ??
                (state.hasAuthoritativeHistoryByConversation[conversationId]
                  ? "authoritative_initial_window"
                  : "empty"),
              hasAuthoritativeHistory:
                state.hasAuthoritativeHistoryByConversation[conversationId] ??
                false,
            },
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
        const beforeId = asStringValue(options?.beforeId);
        const afterId = asStringValue(options?.afterId);
        const hasBeforeCursor = Boolean(beforeId || before);
        const hasAfterCursor = Boolean(afterId || after);
        const isInitialFetch = !hasBeforeCursor && !hasAfterCursor;
        const fetchMode: FetchMessagesResult["mode"] = hasAfterCursor
          ? "newer"
          : hasBeforeCursor
            ? "older"
            : "initial";
        const fetchRequestedAt = new Date();
        const syncReason = options?.syncReason;
        const forceRefresh = options?.force === true;
        const selectedConversationIdAtDispatch =
          options?.selectedConversationIdAtDispatch ??
          get().selectedConversationId;
        const queryType: HistoryQueryType =
          options?.queryType ??
          (fetchMode === "older"
            ? "pagination_older"
            : fetchMode === "newer"
              ? "pagination_newer"
              : "authoritative_open");
        const requestId =
          options?.requestId ?? buildHistoryRequestId(conversationId, queryType);
        const historyScopeKey = buildHistoryScopeKey(conversationId);
        const requestContext: ConversationHistoryRequest = {
          requestId,
          queryType,
          source: options?.source ?? queryType,
          selectedConversationIdAtDispatch,
          historyScopeKey,
        };
        const hasAuthoritativeHistory =
          get().hasAuthoritativeHistoryByConversation[conversationId] === true;
        if (
          fetchMode === "newer" &&
          syncReason === "initial-sync" &&
          hasAuthoritativeHistory &&
          get().hasNewerMessagesByConversation[conversationId] === false
        ) {
          logMessageDebug("chatStore", "fetch_blocked_known_latest", {
            conversationId,
            fetchMode,
            queryType,
            requestId,
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
          queryType === "authoritative_open" &&
          hasAuthoritativeHistory
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
          latestHistoryRequestByConversation: {
            ...state.latestHistoryRequestByConversation,
            [conversationId]: requestContext,
          },
        }));

        const abortController =
          queryType === "authoritative_open" ? new AbortController() : null;
        if (abortController) {
          activeAuthoritativeHistoryAbortController?.abort(
            "superseded_authoritative_history_request",
          );
          activeAuthoritativeHistoryAbortController = abortController;
        }

        try {
          const limit =
            typeof options?.limit === "number" &&
            Number.isFinite(options.limit) &&
            options.limit > 0
              ? Math.min(100, Math.floor(options.limit))
              : 50;
          const params = new URLSearchParams({ limit: String(limit) });
          if (beforeId) params.set("beforeId", beforeId);
          if (afterId) params.set("afterId", afterId);
          logMessageDebug("chatStore", "fetch_requested", {
            conversationId,
            fetchMode,
            queryType,
            requestId,
            source: requestContext.source,
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
            selectedConversationIdAtDispatch,
            historyScopeKey,
          }, {
            alwaysOn: queryType === "authoritative_open",
            level: "info",
          });

          const response = await messageApi.getMessages(conversationId, {
            limit,
            ...(beforeId ? { beforeId } : {}),
            ...(afterId ? { afterId } : {}),
            ...(abortController ? { signal: abortController.signal } : {}),
          });
          const responseEnvelope = asRecord(response);
          const responseMeta = asRecord(responseEnvelope?.meta);
          const payload = unwrapApiSuccess(response);
          const normalized = normalizeMessagesResponse(payload, responseMeta);
          const readState = normalizeConversationReadStateFromMeta(responseMeta);
          const hasMoreForDirection = hasAfterCursor
            ? normalized.hasNext
            : normalized.hasPrev;

          set((state) => {
            const selectedConversationIdAtCommit =
              state.selectedConversationId ?? null;
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
                queryType,
                requestId,
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
                queryType,
                requestId,
              });
              return state;
            }
            if (
              queryType === "authoritative_open" &&
              selectedConversationIdAtDispatch === conversationId &&
              selectedConversationIdAtCommit !== conversationId
            ) {
              logMessageDebug("chatStore", "fetch_stale_room_switch_ignored", {
                conversationId,
                fetchMode,
                queryType,
                requestId,
                selectedConversationIdAtDispatch,
                selectedConversationIdAtCommit,
              }, {
                alwaysOn: true,
                level: "warn",
              });
              return state;
            }

            const existingMessages = state.messages[conversationId] || [];
            const currentlyAuthoritative =
              state.hasAuthoritativeHistoryByConversation[conversationId] ===
              true;
            const currentStage =
              state.historyStageByConversation[conversationId] ?? "empty";
            const shouldPromoteToAuthoritative =
              queryType === "authoritative_open" &&
              Boolean(historyScopeKey) &&
              selectedConversationIdAtCommit === conversationId;
            const isAuthoritativeWindowResolved =
              normalized.messages.length > 0 ||
              (queryType === "authoritative_open" &&
                normalized.hasPrev === false &&
                normalized.hasNext === false);
            const shouldIgnorePartialCommit =
              queryType === "prefetch" && currentlyAuthoritative;
            if (shouldIgnorePartialCommit) {
              logMessageDebug("chatStore", "fetch_partial_ignored", {
                conversationId,
                fetchMode,
                queryType,
                requestId,
                reason: "authoritative_history_already_present",
                responseCount: normalized.messages.length,
              }, {
                alwaysOn: true,
                level: "info",
              });
              return {
                ...state,
                latestHistoryRequestByConversation: {
                  ...state.latestHistoryRequestByConversation,
                  [conversationId]: requestContext,
                },
              };
            }

            const nextMessages =
              queryType === "authoritative_open"
                ? replaceMessages(existingMessages, normalized.messages, {
                    preserveMessagesCreatedAfter: fetchRequestedAt,
                  })
                : fetchMode === "older"
                  ? prependMessages(existingMessages, normalized.messages)
                  : fetchMode === "newer"
                    ? appendMessages(existingMessages, normalized.messages)
                    : mergeMessages(existingMessages, normalized.messages);
            const mergedMessages = nextMessages;
            const nextStage: HistoryStage =
              shouldPromoteToAuthoritative
                ? "authoritative_initial_window"
                : queryType === "prefetch"
                  ? "partial_prefetch"
                  : queryType === "pagination_older"
                    ? "paginating_older"
                    : queryType === "pagination_newer" ||
                        queryType === "room_refresh"
                      ? currentlyAuthoritative
                        ? "live_realtime"
                        : currentStage
                      : currentStage;
            const messageState = buildConversationMessageState(
              state,
              conversationId,
              mergedMessages,
              {
                hydrated:
                  shouldPromoteToAuthoritative &&
                  isAuthoritativeWindowResolved,
                hasNewer:
                  fetchMode === "initial" || fetchMode === "newer"
                    ? normalized.hasNext
                    : undefined,
                stage: nextStage,
                hasAuthoritativeHistory:
                  shouldPromoteToAuthoritative
                    ? isAuthoritativeWindowResolved
                    : currentlyAuthoritative,
                prefetchedWindow:
                  queryType === "prefetch"
                    ? true
                    : shouldPromoteToAuthoritative
                      ? false
                      : state.prefetchedWindowByConversation[conversationId] ??
                        false,
                historyScopeKey,
                requestContext,
              },
            );
            const currentConversation = messageState.conversationById[conversationId];
            const resolvedConversation = currentConversation
              ? applySenderProfilesToConversation(
                  currentConversation,
                  normalized.senderProfiles,
                )
              : null;
            const readStateConversation =
              readState && resolvedConversation
                ? applyConversationReadState(resolvedConversation, readState)
                : null;
            const finalConversation =
              readStateConversation ?? resolvedConversation ?? currentConversation;
            const nextConversationById =
              finalConversation && finalConversation !== currentConversation
                ? {
                    ...messageState.conversationById,
                    [conversationId]: finalConversation,
                  }
                : messageState.conversationById;
            const nextConversations =
              finalConversation && finalConversation !== currentConversation
                ? messageState.conversations.map((conversation) =>
                    conversation.id === conversationId
                      ? finalConversation
                      : conversation,
                  )
                : messageState.conversations;

            return {
              ...messageState,
              ...(finalConversation && finalConversation !== currentConversation
                ? {
                    conversations: nextConversations,
                    conversationById: nextConversationById,
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
            queryType,
            requestId,
            source: requestContext.source,
            syncReason,
            loaded: normalized.messages.length,
            hasNext: normalized.hasNext,
            hasPrev: normalized.hasPrev,
            fetchGeneration,
            initialFetchSeq,
            selectedConversationIdAtDispatch,
            selectedConversationIdAtCommit:
              get().selectedConversationId ?? null,
            historyStageAfter:
              get().historyStageByConversation[conversationId] ?? "empty",
            hasAuthoritativeHistoryAfter:
              get().hasAuthoritativeHistoryByConversation[conversationId] ??
              false,
          }, {
            alwaysOn: queryType === "authoritative_open",
            level: "info",
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
          if (isCanceledRequestError(error)) {
            logMessageDebug("chatStore", "fetch_cancelled", {
              conversationId,
              fetchMode,
              queryType,
              requestId,
              syncReason,
              before,
              after,
              beforeId: options?.beforeId,
              afterId: options?.afterId,
              selectedConversationIdAtDispatch,
            }, {
              alwaysOn: queryType === "authoritative_open",
              level: "info",
            });
            return {
              loaded: 0,
              hasMore: false,
              hasNext: false,
              hasPrev: false,
              mode: fetchMode,
              applied: false,
            };
          }

          const apiError = extractApiError(error);
          const errorMessage =
            apiError.message || i18n.t("error:chat.fetchMessagesFailed");
          logMessageDebug("chatStore", "fetch_failed", {
            conversationId,
            fetchMode,
            queryType,
            requestId,
            syncReason,
            before,
            after,
            beforeId: options?.beforeId,
            afterId: options?.afterId,
            errorMessage,
            selectedConversationIdAtDispatch,
          }, {
            alwaysOn: queryType === "authoritative_open",
            level: "warn",
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
          if (abortController && activeAuthoritativeHistoryAbortController === abortController) {
            activeAuthoritativeHistoryAbortController = null;
          }
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
          outboxController.setSendRestriction(conversationId, {
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
        if (conversation?.canCurrentUserSend === false) {
          const reason = i18n.t("chat:composer.readonlyGroup", {
            defaultValue: "Only group admins can send messages right now.",
          });
          outboxController.setSendRestriction(conversationId, {
            kind: "readonly",
            reason,
            code: "GROUP_READ_ONLY",
          });
          logMessageDebug("chatStore", "send_blocked_readonly_group", {
            conversationId,
            reason,
            currentUserRole: conversation.currentUserRole ?? null,
            allowMemberMessaging: conversation.allowMemberMessaging ?? null,
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

        return outboxController.dispatchExistingMessage(
          conversationId,
          tempMessage,
          "sending",
        );
      },

      resendMessage: async (conversationId: string, message: Message) => {
        const activeRestriction =
          get().sendRestrictionsByConversation[conversationId];
        if (activeRestriction) {
          throw new Error(activeRestriction.reason);
        }

        return outboxController.dispatchExistingMessage(
          conversationId,
          message,
          "sending",
        );
      },

      flushQueuedMessages: outboxController.flushQueuedMessages,

      setSendRestriction: (conversationId, restriction) => {
        outboxController.setSendRestriction(conversationId, restriction);
      },

      clearSendRestriction: (conversationId) => {
        outboxController.clearSendRestriction(conversationId);
      },

      setTyping: (status) => {
        set((state) => ({
          typingStatuses: upsertTypingStatus(state.typingStatuses, status),
        }));
      },

      clearTyping: (conversationId, userId) => {
        set((state) => ({
          typingStatuses: removeTypingStatus(
            state.typingStatuses,
            conversationId,
            userId,
          ),
        }));
      },

      clearConversationTypingStatuses: (conversationId) => {
        set((state) => ({
          typingStatuses: removeConversationTypingStatuses(
            state.typingStatuses,
            conversationId,
          ),
        }));
      },

      clearError: () => set({ error: null, conversationsError: null }),

      reset: () => {
        roomMessageFetchInFlight.clear();
        initialFetchSeqByConversation.clear();
        messageFetchGenerationByConversation.clear();
        activeAuthoritativeHistoryAbortController?.abort("chat_store_reset");
        activeAuthoritativeHistoryAbortController = null;
        unreadController.reset();
        conversationsFetchPromise = null;
        outboxController.reset();
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
  return useChatStore(selectCurrentTypingStatusFromState);
};

export const useFilteredConversations = () => {
  const activeFilter = useChatSidebarStore((state) => state.filter);
  const searchQuery = useChatSidebarStore((state) => state.searchQuery);

  return useChatStore((state) => {
    let filtered = state.orderedConversationIds
      .map((conversationId) => state.conversationById[conversationId])
      .filter((conversation): conversation is Conversation =>
        Boolean(conversation),
      );

    switch (activeFilter) {
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
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
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

export const selectConversationMessageIdsFromState = (
  state: Pick<ChatState, "messageIdsByConversation">,
  conversationId: string | null,
): string[] => {
  if (!conversationId) {
    return [];
  }

  return state.messageIdsByConversation[conversationId] ?? [];
};

export const selectMessageEntityFromState = (
  state: Pick<ChatState, "messageById">,
  messageId: string | null,
): Message | undefined => {
  if (!messageId) {
    return undefined;
  }

  return state.messageById[messageId];
};

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

export const useConversationMessageIds = (conversationId: string | null) =>
  useChatStore((state) =>
    selectConversationMessageIdsFromState(state, conversationId),
  );

export const useConversationMessageCount = (conversationId: string | null) =>
  useChatStore((state) =>
    conversationId
      ? (state.messageIdsByConversation[conversationId]?.length ?? 0)
      : 0,
  );

export const useMessageEntity = (messageId: string | null) =>
  useChatStore((state) => selectMessageEntityFromState(state, messageId));

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
