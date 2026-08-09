/**
 * @fileoverview Chat store (Zustand)
 */

import axios from "axios";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";
import {
  normalizeConversation,
  normalizeConversationsPayload,
  normalizeRoomType,
} from "../lib/conversationAdapter";
import {
  buildMessageCorrelationKey,
  generateClientMessageId,
  generateTempMessageId,
} from "../utils/messageIdFactory";
import { logMessageDebug } from "../utils/messageDebug";
import { markChatPerformance } from "../utils/chatPerformance";
import { beginImagePerformanceTrace } from "../utils/imagePerformanceTelemetry";
import { createReplySnapshot } from "../utils/messageTimeline";
import {
  createConversationActivityComparator,
  getPinnedConversationIdSet,
  sortConversationsByActivity,
} from "../utils/conversationRanking";
import { isTempMessageId } from "../features/chat/domain/messageIdentityMatching";
import {
  asNumberValue,
  asRecord,
  asStringValue,
  normalizeAttachments,
  normalizeLocationPayload,
  normalizeMentions,
  normalizeReactions,
  toDateObject,
} from "./messageNormalizer";
import {
  mergeConversationSummary,
  shouldApplyConversationSummary,
} from "./conversationSummaryMerge";
import {
  compareMessages,
  matchesMessage,
  sortMessages,
  toMessageIdentityKeys,
} from "./messageOrdering";
import {
  allocateLocalMessageOrder,
  dedupeAndSortMessages,
  mergeMessageRecords,
  mergeMessages,
} from "./messageMergeRecords";
import {
  getBrowserOnlineState,
  resolveConnectionSendMode,
  resolveSendFailureDescriptor,
} from "./sendFailure";
import {
  getMessageAliasCandidates,
  getMessageQueueKey,
  getStableMessageId,
  matchesMessageIdentityValue,
  rebuildConversationMessageAliasIndex,
  resolveCanonicalMessageIdentity,
} from "./messageAliasIndex";
import {
  applyConversationReadState,
  toConversationLastMessageStatus,
  toMessageSummary,
  updateConversationActivitySummary,
  updateConversationReadProgress,
} from "./conversationSummaryState";
import {
  buildConversationMessageWindow,
  isCanonicalConversationMessage,
  trimInactiveConversationMessages,
  type ConversationMessageWindow,
} from "./messageWindow";
import {
  applySenderProfilesToConversation,
  applySenderProfilesToMessages,
  normalizeSenderProfileSummary,
  normalizeSenderProfiles,
  type SenderProfileSummary,
} from "./senderProfiles";
import {
  buildConversationIndexState,
  computeCanonicalTotalUnreadCount,
  computeConversationCursor,
  computeConversationUpdatedAfterCursor,
  getConversationCursorTimestamp,
  toConversationVersion,
  toDateValue,
  toFiniteNumber,
} from "./conversationCursor";
import { resolveUserDisplayName } from "../features/chat/identity/resolveUserDisplayName";
import { resolveConversationId } from "../lib/conversationIdentity";
import i18n from "../i18n";
import { useAuthStore } from "./authStore";
import { registerStoreResetter } from "./storeResetRegistry";
import { conversationApi, messageApi } from "../services/api";
import { useChatSidebarStore } from "../features/chat/state/chatSidebarStore";
import { createChatOutboxController } from "./chatStoreOutbox";
import {
  createChatUnreadController,
  type MarkAsReadInput,
} from "./chatStoreUnread";
import {
  removeConversationTypingStatuses,
  removeTypingStatus,
  selectCurrentTypingStatusFromState,
  selectCurrentTypingStatusesFromState,
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
  upsertConversationSummary: (conversation: Conversation) => {
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
    input?: string | MarkAsReadInput,
  ) => Promise<void>;
  applyUnreadSummary: (
    summary: {
      totalUnreadCount: number;
      conversations: Array<{
        conversationId: string;
        unreadCount: number;
        lastReadSeq?: number | null;
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
    input: MarkAsReadInput,
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


interface FetchMessagesOptions {
  force?: boolean;
  limit?: number;
  beforeId?: string;
  afterId?: string;
  beforeSeq?: number;
  afterSeq?: number;
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
const EMPTY_MESSAGE_IDS: string[] = [];

const roomMessageFetchInFlight = new Map<string, number>();
const initialFetchSeqByConversation = new Map<string, number>();
const messageFetchGenerationByConversation = new Map<string, number>();
let activeAuthoritativeHistoryAbortController: AbortController | null = null;
let conversationsFetchPromise: Promise<void> | null = null;

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

const isAuthoritativeHistoryStage = (
  stage: HistoryStage | undefined,
): boolean =>
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
    asNumberValue(source.messageSeq) ??
    asNumberValue(source.server_seq) ??
    asNumberValue(source.message_seq) ??
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
    mentions: normalizeMentions(source.mentions),
    location: normalizeLocationPayload(source),
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

export const __normalizeMessageForTest = normalizeMessage;

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
  // Dựng comparator một lần: findIndex gọi nó lặp trên mảng.
  const compare = createConversationActivityComparator(
    getPinnedConversationIdSet(),
  );
  const insertIndex = next.findIndex(
    (conversation) => compare(nextConversation, conversation) < 0,
  );
  if (insertIndex < 0) {
    next.push(nextConversation);
    return next;
  }

  next.splice(insertIndex, 0, nextConversation);
  return next;
};

const mergeConversationCollections = (
  conversations: Conversation[] | null | undefined,
): Conversation[] => {
  const mergedById = new Map<string, Conversation>();

  (Array.isArray(conversations) ? conversations : []).forEach(
    (conversation) => {
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

      mergedById.set(
        normalized.id,
        mergeConversationSummary(existing, normalized),
      );
    },
  );

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

const buildInactiveMessageTrimState = (
  state: ChatState,
  activeConversationId: string | null,
): Partial<ChatState> | null => {
  let changed = false;
  const nextMessages: Record<string, Message[]> = {};

  Object.entries(state.messages).forEach(([conversationId, messages]) => {
    if (conversationId === activeConversationId) {
      nextMessages[conversationId] = messages;
      return;
    }

    const trimmed = trimInactiveConversationMessages(messages);
    if (trimmed !== messages) {
      changed = true;
    }
    nextMessages[conversationId] = trimmed;
  });

  if (!changed) {
    return null;
  }

  const nextMessageById: Record<string, Message> = {};
  const nextMessageIdsByConversation: Record<string, string[]> = {};
  const nextMessageAliasIndexByConversation: Record<
    string,
    Record<string, string>
  > = {};
  const nextMessageWindowByConversation: Record<
    string,
    ConversationMessageWindow
  > = {};

  Object.entries(nextMessages).forEach(([conversationId, messages]) => {
    nextMessageIdsByConversation[conversationId] = messages.map((message) => {
      const stableId = getStableMessageId(message);
      nextMessageById[stableId] = message;
      nextMessageById[message.id] = message;
      return stableId;
    });
    nextMessageAliasIndexByConversation[conversationId] =
      rebuildConversationMessageAliasIndex(messages);
    nextMessageWindowByConversation[conversationId] =
      buildConversationMessageWindow(messages);
  });

  return {
    messages: nextMessages,
    messageById: nextMessageById,
    messageIdsByConversation: nextMessageIdsByConversation,
    messageAliasIndexByConversation: nextMessageAliasIndexByConversation,
    messageWindowByConversation: nextMessageWindowByConversation,
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

  const nextWindow: ConversationMessageWindow = {
    oldestLoadedMessageId: currentWindow?.oldestLoadedMessageId ?? message.id,
    oldestLoadedAt: currentWindow?.oldestLoadedAt ?? nextTimestamp,
    newestLoadedMessageId: message.id,
    newestLoadedAt: nextTimestamp,
  };
  if (typeof currentWindow?.oldestLoadedSeq === "number") {
    nextWindow.oldestLoadedSeq = currentWindow.oldestLoadedSeq;
  } else if (typeof message.serverSeq === "number") {
    nextWindow.oldestLoadedSeq = message.serverSeq;
  }
  if (typeof message.serverSeq === "number") {
    nextWindow.newestLoadedSeq = message.serverSeq;
  }
  return nextWindow;
};

const resolveNewestCanonicalConversationMessage = (
  state: Pick<
    ChatState,
    "messages" | "messageById" | "messageWindowByConversation"
  >,
  conversationId: string,
  currentMessages?: Message[],
): Message | null => {
  const newestCanonicalId =
    state.messageWindowByConversation[conversationId]?.newestLoadedMessageId;
  if (newestCanonicalId) {
    return state.messageById[newestCanonicalId] ?? null;
  }

  const sourceMessages =
    currentMessages ?? state.messages[conversationId] ?? [];
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
    state.conversations.find(
      (conversation) => conversation.id === conversationId,
    ) ?? null;
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
      : (state.prefetchedWindowByConversation[conversationId] ?? false));
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
    keys.length > 0 && keys.every((key) => FAST_MESSAGE_PATCH_FIELDS.has(key))
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
    state.conversations.find(
      (conversation) => conversation.id === conversationId,
    ) ?? null;
  const shouldPatchConversationSummary =
    currentConversation?.lastMessage?.id === currentMessage.id;
  const conversations =
    currentConversation && shouldPatchConversationSummary
      ? replaceConversationInActivityOrder(
          state.conversations,
          normalizeConversation({
            ...currentConversation,
            lastMessage: toMessageSummary(nextMessage),
            lastMessageStatus: toConversationLastMessageStatus(nextMessage),
          }) ?? {
            ...currentConversation,
            lastMessage: toMessageSummary(nextMessage),
            lastMessageStatus: toConversationLastMessageStatus(nextMessage),
          },
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
    latestHistoryRequestByConversation:
      state.latestHistoryRequestByConversation,
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
    state.conversations.find(
      (conversation) => conversation.id === conversationId,
    ) ?? null;
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
      : (state.prefetchedWindowByConversation[conversationId] ?? false));
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
    const unreadDelta = options?.incrementUnread && mergedMessage ? 1 : 0;
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
  const messageState = buildConversationMessageState(
    state,
    conversationId,
    nextMessages,
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
    mimeType: attachment.mimeType || "",
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
        get().ackOutgoingMessage(
          conversationId,
          clientMessageId,
          serverMessage,
        ),
      failOutgoingMessage: (conversationId, clientMessageId, updates) =>
        get().failOutgoingMessage(conversationId, clientMessageId, updates),
    });

    const unreadController = createChatUnreadController<ChatState>({
      set,
      get,
      emptyMessages: EMPTY_MESSAGES,
      markConversationAsRead: (conversationId, input) =>
        conversationApi.markAsRead(conversationId, input),
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
          const conversations = mergeConversationCollections(
            (Array.isArray(state.conversations) ? state.conversations : []).map(
              (conversation) =>
                conversation.id === id
                  ? (normalizeConversation({ ...conversation, ...updates }) ?? {
                      ...conversation,
                      ...updates,
                    })
                  : conversation,
            ),
          );

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
        const normalizedParticipant =
          normalizeSenderProfileSummary(participant);
        if (!normalizedParticipant) {
          return;
        }

        set((state) => {
          const senderProfiles = {
            [normalizedParticipant.id]: normalizedParticipant,
          };
          const currentMessages =
            state.messages[conversationId] || EMPTY_MESSAGES;
          const nextMessages = applySenderProfilesToMessages(
            currentMessages,
            senderProfiles,
          );
          const messagesChanged = nextMessages !== currentMessages;
          const currentConversation = state.conversationById[conversationId];
          const nextConversation = currentConversation
            ? applySenderProfilesToConversation(
                currentConversation,
                senderProfiles,
              )
            : null;
          const conversationChanged = nextConversation !== currentConversation;

          if (!messagesChanged && !conversationChanged) {
            return state;
          }

          const nextMessageById = messagesChanged
            ? nextMessages.reduce<Record<string, Message>>(
                (accumulator, message) => {
                  accumulator[message.id] = message;
                  return accumulator;
                },
                {
                  ...state.messageById,
                },
              )
            : state.messageById;

          const nextConversations = conversationChanged
            ? mergeConversationCollections(
                (Array.isArray(state.conversations)
                  ? state.conversations
                  : []
                ).map((conversation) =>
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
          const conversations = (
            Array.isArray(state.conversations) ? state.conversations : []
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
              Object.entries(
                state.hasAuthoritativeHistoryByConversation,
              ).filter(([key]) => key !== id),
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
              Object.entries(state.hasMoreMessages).filter(
                ([key]) => key !== id,
              ),
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
        if (id && get().selectedConversationId !== id) {
          beginImagePerformanceTrace(id, {
            hasCachedTimeline:
              get().hasAuthoritativeHistoryByConversation[id] === true,
          });
        }
        set((state) => {
          const trimState = buildInactiveMessageTrimState(state, id);
          if (state.selectedConversationId === id) {
            return trimState ?? state;
          }
          return {
            ...(trimState ?? {}),
            selectedConversationId: id,
          };
        });
      },

      markAsRead: unreadController.markAsRead,

      applyUnreadSummary: unreadController.applyUnreadSummary,

      refreshUnreadSummarySnapshot:
        unreadController.refreshUnreadSummarySnapshot,

      applyIncomingConversationMessage: (conversationId, message, options) => {
        if (!conversationId) return;

        set((state) => {
          const conversations = (
            Array.isArray(state.conversations) ? state.conversations : []
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
          const { nextState, metadata } =
            ingestConversationMessagesWithMetadata(
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
              correlationKey: getCorrelationKeyForMessage(
                metadata.mergedMessage,
              ),
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
            : (get().historyStageByConversation[conversationId] ?? "empty"),
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
              : (get().historyStageByConversation[conversationId] ?? "empty"),
            source: "ackOutgoingMessage",
          },
        );
      },

      ingestConversationMessageEvent: (conversationId, message, options) => {
        if (
          options?.source === "message:new" ||
          options?.source === "message:updated" ||
          options?.source === "realtime"
        ) {
          markChatPerformance("realtime-message-received", conversationId, {
            source: options.source,
          });
        }

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
                    : (state.historyStageByConversation[conversationId] ??
                      "empty")
                  : (state.historyStageByConversation[conversationId] ??
                    "empty"),
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
          const aliasIndex =
            state.messageAliasIndexByConversation[conversationId];
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

          return buildConversationMessageState(
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
        });
      },

      markMessagesReadUpTo: (
        conversationId,
        lastMessageId,
        readerId,
        lastReadSeq,
      ) => {
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
            const messageSeq =
              toFiniteNumber(
                (message as { messageSeq?: unknown }).messageSeq,
              ) ?? toFiniteNumber(message.serverSeq);
            const withinSeqBoundary =
              typeof lastReadSeq === "number" &&
              Number.isFinite(lastReadSeq) &&
              messageSeq !== null &&
              messageSeq <= lastReadSeq;

            if (boundaryIndex < 0) {
              return withinSeqBoundary ||
                matchesMessageIdentityValue(message, lastMessageId)
                ? { ...message, status: MessageStatus.READ, readAt }
                : message;
            }

            return withinSeqBoundary || index <= boundaryIndex
              ? { ...message, status: MessageStatus.READ, readAt }
              : message;
          });

          return buildConversationMessageState(
            state,
            conversationId,
            updatedMessages,
            {
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
            },
          );
        });
      },

      removeMessage: (conversationId, messageId) => {
        const currentMessages =
          get().messages[conversationId] || EMPTY_MESSAGES;
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
            (message) =>
              !matchesMessageIdentityValue(message, resolvedMessageId),
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
              ...(nextState.messageAliasIndexByConversation[conversationId] ||
                {}),
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
        const beforeSeq =
          typeof options?.beforeSeq === "number" &&
          Number.isFinite(options.beforeSeq)
            ? Math.floor(options.beforeSeq)
            : undefined;
        const afterSeq =
          typeof options?.afterSeq === "number" &&
          Number.isFinite(options.afterSeq)
            ? Math.floor(options.afterSeq)
            : undefined;
        const hasBeforeCursor = Boolean(beforeSeq || beforeId || before);
        const hasAfterCursor = Boolean(afterSeq || afterId || after);
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
          options?.requestId ??
          buildHistoryRequestId(conversationId, queryType);
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
            beforeSeq,
            afterSeq,
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
          if (typeof beforeSeq === "number")
            params.set("beforeSeq", String(beforeSeq));
          if (typeof afterSeq === "number")
            params.set("afterSeq", String(afterSeq));
          if (beforeId) params.set("beforeId", beforeId);
          if (afterId) params.set("afterId", afterId);
          logMessageDebug(
            "chatStore",
            "fetch_requested",
            {
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
              beforeSeq,
              afterSeq,
              beforeId,
              afterId,
              limit,
              initialFetchSeq,
              fetchGeneration,
              selectedConversationIdAtDispatch,
              historyScopeKey,
            },
            {
              alwaysOn: queryType === "authoritative_open",
              level: "info",
            },
          );

          const isUnreadFeedQuery = queryType === "unread_feed";
          const response = isUnreadFeedQuery
            ? await conversationApi.getUnreadFeed(conversationId, limit)
            : await messageApi.getMessages(conversationId, {
                limit,
                ...(typeof beforeSeq === "number" ? { beforeSeq } : {}),
                ...(typeof afterSeq === "number" ? { afterSeq } : {}),
                ...(beforeId ? { beforeId } : {}),
                ...(afterId ? { afterId } : {}),
                ...(abortController ? { signal: abortController.signal } : {}),
              });
          const responseEnvelope = asRecord(response);
          const responseMeta = asRecord(responseEnvelope?.meta);
          const payload = unwrapApiSuccess(response as never);
          const unreadPayload = isUnreadFeedQuery ? asRecord(payload) : null;
          const unreadReadState = isUnreadFeedQuery
            ? asRecord(unreadPayload?.readState)
            : null;
          const normalized = normalizeMessagesResponse(
            payload,
            isUnreadFeedQuery
              ? {
                  hasNext: false,
                  hasPrev: unreadPayload?.hasMore === true,
                  ...(unreadReadState ? { readState: unreadReadState } : {}),
                }
              : responseMeta,
          );
          const readState = normalizeConversationReadStateFromMeta(
            isUnreadFeedQuery
              ? unreadReadState
                ? { readState: unreadReadState }
                : null
              : responseMeta,
          );
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
              logMessageDebug(
                "chatStore",
                "fetch_stale_room_switch_ignored",
                {
                  conversationId,
                  fetchMode,
                  queryType,
                  requestId,
                  selectedConversationIdAtDispatch,
                  selectedConversationIdAtCommit,
                },
                {
                  alwaysOn: true,
                  level: "warn",
                },
              );
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
              logMessageDebug(
                "chatStore",
                "fetch_partial_ignored",
                {
                  conversationId,
                  fetchMode,
                  queryType,
                  requestId,
                  reason: "authoritative_history_already_present",
                  responseCount: normalized.messages.length,
                },
                {
                  alwaysOn: true,
                  level: "info",
                },
              );
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
            const nextStage: HistoryStage = shouldPromoteToAuthoritative
              ? "authoritative_initial_window"
              : queryType === "unread_feed"
                ? "partial_unread_bootstrap"
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
                  shouldPromoteToAuthoritative && isAuthoritativeWindowResolved,
                hasNewer:
                  fetchMode === "initial" || fetchMode === "newer"
                    ? normalized.hasNext
                    : undefined,
                stage: nextStage,
                hasAuthoritativeHistory: shouldPromoteToAuthoritative
                  ? isAuthoritativeWindowResolved
                  : currentlyAuthoritative,
                prefetchedWindow:
                  queryType === "prefetch"
                    ? true
                    : shouldPromoteToAuthoritative
                      ? false
                      : (state.prefetchedWindowByConversation[conversationId] ??
                        false),
                historyScopeKey,
                requestContext,
              },
            );
            const currentConversation =
              messageState.conversationById[conversationId];
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
              readStateConversation ??
              resolvedConversation ??
              currentConversation;
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
          logMessageDebug(
            "chatStore",
            "fetch_applied",
            {
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
            },
            {
              alwaysOn: queryType === "authoritative_open",
              level: "info",
            },
          );

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
            logMessageDebug(
              "chatStore",
              "fetch_cancelled",
              {
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
              },
              {
                alwaysOn: queryType === "authoritative_open",
                level: "info",
              },
            );
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
          logMessageDebug(
            "chatStore",
            "fetch_failed",
            {
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
            },
            {
              alwaysOn: queryType === "authoritative_open",
              level: "warn",
            },
          );
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
          if (
            abortController &&
            activeAuthoritativeHistoryAbortController === abortController
          ) {
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

      sendMessage: (
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
          if (conversation.sendRestriction?.code === "FRIENDSHIP_REQUIRED") {
            const reason =
              conversation.sendRestriction.reason === "UNFRIENDED"
                ? i18n.t("chat:composer.unfriendedRestriction", {
                    defaultValue:
                      "You are no longer friends. Add this person as a friend again to continue messaging.",
                  })
                : i18n.t("chat:composer.friendshipRequiredRestriction", {
                    defaultValue:
                      "You can only message friends. Send a friend request to start the conversation.",
                  });
            outboxController.setSendRestriction(conversationId, {
              kind: "permission",
              reason,
              code: "DIRECT_CHAT_FRIENDSHIP_REQUIRED",
            });
            logMessageDebug("chatStore", "send_blocked_friendship_required", {
              conversationId,
              reason,
              restrictionReason: conversation.sendRestriction.reason ?? null,
            });
            throw new Error(reason);
          }
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

        if (browserOnline === false) {
          return Promise.resolve(
            outboxController.queueExistingMessage(
              conversationId,
              tempMessage,
              "offline",
            ),
          );
        }

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

        if (getBrowserOnlineState() === false) {
          return outboxController.queueExistingMessage(
            conversationId,
            message,
            "manual_retry",
          );
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

export const useCurrentTypingStatuses = () => {
  return useChatStore(useShallow(selectCurrentTypingStatusesFromState));
};

export const useFilteredConversations = () => {
  const activeFilter = useChatSidebarStore((state) => state.filter);
  const searchQuery = useChatSidebarStore((state) => state.searchQuery);

  return useChatStore(
    useShallow((state) => {
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
    }),
  );
};

export const useTotalUnreadCount = () => {
  return useChatStore((state) => state.totalUnreadCount);
};

export const selectConversationMessagesFromState = (() => {
  const MAX_SELECTOR_CACHE_ENTRIES = 200;
  const cacheByConversation = new Map<
    string,
    {
      messageIdsRef: string[] | undefined;
      messagesRef: Message[] | undefined;
      result: Message[];
    }
  >();

  return (
    state: Pick<
      ChatState,
      "messageById" | "messageIdsByConversation" | "messages"
    >,
    conversationId: string | null,
  ): Message[] => {
    if (!conversationId) {
      return EMPTY_MESSAGES;
    }

    const messageIds = state.messageIdsByConversation[conversationId];
    const messagesRef = state.messages[conversationId];
    const cached = cacheByConversation.get(conversationId);
    if (
      cached &&
      cached.messageIdsRef === messageIds &&
      cached.messagesRef === messagesRef
    ) {
      cacheByConversation.delete(conversationId);
      cacheByConversation.set(conversationId, cached);
      return cached.result;
    }

    const nextResult =
      Array.isArray(messageIds) && messageIds.length > 0
        ? messageIds
            .map((messageId) => state.messageById[messageId])
            .filter((message): message is Message => Boolean(message))
        : (messagesRef ?? EMPTY_MESSAGES);

    cacheByConversation.set(conversationId, {
      messageIdsRef: messageIds,
      messagesRef,
      result: nextResult,
    });
    if (cacheByConversation.size > MAX_SELECTOR_CACHE_ENTRIES) {
      const oldestKey = cacheByConversation.keys().next().value;
      if (oldestKey) {
        cacheByConversation.delete(oldestKey);
      }
    }

    return nextResult;
  };
})();

export const selectConversationMessageIdsFromState = (
  state: Pick<ChatState, "messageIdsByConversation">,
  conversationId: string | null,
): string[] => {
  if (!conversationId) {
    return EMPTY_MESSAGE_IDS;
  }

  return state.messageIdsByConversation[conversationId] ?? EMPTY_MESSAGE_IDS;
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
