/**
 * @fileoverview Chat store (Zustand)
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

import apiClient from "../lib/axios";
import type { ApiResponse } from "@hacom/chat-shared-types";
import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";
import { toast } from "../utils/toast";
import i18n from "../i18n";
import { useAuthStore } from "./authStore";
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
  ) => Promise<FetchMessagesResult>;
  sendMessage: (
    conversationId: string,
    content: string,
    type?: MessageType,
    fileMeta?: Attachment,
    replyToId?: string,
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

const initialState = {
  conversations: [],
  messages: {},
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

const buildLoadingStateFromInFlightMap = (): {
  isLoadingMessages: boolean;
  isLoadingMessagesByConversation: Record<string, boolean>;
} => {
  const isLoadingMessagesByConversation = Object.fromEntries(
    Array.from(roomMessageFetchInFlight.entries()).map(([conversationId, count]) => [
      conversationId,
      count > 0,
    ]),
  );
  return {
    isLoadingMessages: Array.from(roomMessageFetchInFlight.values()).some(
      (count) => count > 0,
    ),
    isLoadingMessagesByConversation,
  };
};

const toConversationArray = (data: unknown): Conversation[] => {
  if (Array.isArray(data)) return data as Conversation[];
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.conversations))
      return record.conversations as Conversation[];
    if (Array.isArray(record.rooms)) return record.rooms as Conversation[];
  }
  return [];
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;

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

      const id = asStringValue(attachment.id) ?? asStringValue(attachment.fileId);
      const url = asStringValue(attachment.url) ?? asStringValue(attachment.fileUrl);
      if (!id || !url) return null;

      return {
        id,
        type: (asStringValue(attachment.type) ?? "other") as Attachment["type"],
        url,
        fileName:
          asStringValue(attachment.fileName) ??
          asStringValue(attachment.filename) ??
          asStringValue(attachment.originalName),
        mimeType:
          asStringValue(attachment.mimeType) ?? asStringValue(attachment.mimetype),
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

  return {
    id,
    localId:
      asStringValue(source.localId) ??
      asStringValue(source.tempId) ??
      asStringValue(source.clientMessageId),
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
      ? (source.mentions.filter((item): item is string => typeof item === "string") as string[])
      : [],
    status,
    isEdited: Boolean(source.isEdited),
    isPinned: Boolean(source.isPinned),
    isDeleted: Boolean(source.isDeleted),
    isSystem: Boolean(source.isSystem),
    metadata: asRecord(source.metadata) ?? undefined,
    createdAt: toDateObject(source.createdAt),
    editedAt: source.editedAt ? toDateObject(source.editedAt) : undefined,
    deliveredAt: source.deliveredAt ? toDateObject(source.deliveredAt) : undefined,
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

const compareMessages = (a: Message, b: Message): number => {
  const timeDiff = toDateValue(a.createdAt) - toDateValue(b.createdAt);
  if (timeDiff !== 0) return timeDiff;
  const aId = typeof a.id === "string" ? a.id : "";
  const bId = typeof b.id === "string" ? b.id : "";
  return aId.localeCompare(bId);
};

const sortMessages = (messages: Message[]): Message[] =>
  [...messages].sort(compareMessages);

const isTempMessageId = (id: string | undefined): boolean =>
  typeof id === "string" && id.startsWith("temp-");

const matchesMessage = (source: Message, target: Message): boolean =>
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
  if (!source.conversationId || source.conversationId !== target.conversationId) {
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
  messages.findIndex(
    (item) => matchesMessage(item, target),
  );

const mergeMessageRecords = (current: Message, incoming: Message): Message => {
  const merged = { ...current, ...incoming } as Message;

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

  return merged;
};

const dedupeAndSortMessages = (messages: Message[]): Message[] => {
  const deduped: Message[] = [];

  for (const message of messages) {
    const existingIndex = deduped.findIndex((item) =>
      matchesMessage(item, message),
    );
    if (existingIndex < 0) {
      deduped.push(message);
      continue;
    }

    deduped[existingIndex] = mergeMessageRecords(
      deduped[existingIndex],
      message,
    );
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
): { messages: Message[]; hasMore: boolean } => {
  const hasMoreFromMeta = (): boolean | null => {
    if (!responseMeta) return null;
    if (typeof responseMeta.hasMore === "boolean") return responseMeta.hasMore;
    if (typeof responseMeta.hasNext === "boolean") return responseMeta.hasNext;
    if (typeof responseMeta.hasNextPage === "boolean") return responseMeta.hasNextPage;
    return null;
  };

  if (Array.isArray(rawData)) {
    return {
      messages: rawData
        .map((item) => normalizeMessage(item))
        .filter((item): item is Message => item !== null),
      hasMore: hasMoreFromMeta() ?? false,
    };
  }

  const payload = asRecord(rawData);
  if (!payload) {
    return { messages: [], hasMore: false };
  }

  const rawMessages = Array.isArray(payload.messages)
    ? payload.messages
    : Array.isArray(payload.items)
      ? payload.items
      : [];
  const messages = rawMessages
    .map((item) => normalizeMessage(item))
    .filter((item): item is Message => item !== null);

  if (typeof payload.hasMore === "boolean") {
    return { messages, hasMore: payload.hasMore };
  }

  const hasMoreByMeta = hasMoreFromMeta();
  if (typeof hasMoreByMeta === "boolean") {
    return { messages, hasMore: hasMoreByMeta };
  }

  const pagination = asRecord(payload.pagination);
  return {
    messages,
    hasMore: Boolean(pagination?.hasNextPage),
  };
};

const toAttachmentPayload = (attachments?: Attachment[]) =>
  attachments?.map((attachment) => ({
    id: attachment.id,
    type: attachment.type,
    url: attachment.url,
    filename: attachment.fileName || "attachment",
    mimetype: attachment.mimeType || "application/octet-stream",
    size:
      typeof attachment.fileSize === "number" && attachment.fileSize >= 0
        ? attachment.fileSize
        : 0,
    ...(typeof attachment.width === "number" ? { width: attachment.width } : {}),
    ...(typeof attachment.height === "number" ? { height: attachment.height } : {}),
    ...(typeof attachment.duration === "number"
      ? { duration: attachment.duration }
      : {}),
    ...(attachment.thumbnailUrl ? { thumbnailUrl: attachment.thumbnailUrl } : {}),
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
        conversations: Array.isArray(conversations) ? conversations : [],
      });
    },

    addConversation: (conversation) => {
      set((state) => ({
        conversations: [
          conversation,
          ...(Array.isArray(state.conversations) ? state.conversations : []),
        ],
      }));
    },

    updateConversation: (id, updates) => {
      set((state) => ({
        conversations: (Array.isArray(state.conversations)
          ? state.conversations
          : []
        ).map((conversation) =>
          conversation.id === id ? { ...conversation, ...updates } : conversation,
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
        selectedConversationId:
          state.selectedConversationId === id ? null : state.selectedConversationId,
      }));
    },

    selectConversation: (id) => {
      set({ selectedConversationId: id });
    },

    markAsRead: async (conversationId) => {
      const previousUnreadCount =
        get().conversations.find((conversation) => conversation.id === conversationId)
          ?.unreadCount ?? 0;

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

      const currentMessages = sortMessages(get().messages[conversationId] || []);
      const latestReadableMessage = [...currentMessages]
        .reverse()
        .find((message) => !isTempMessageId(message.id));
      const payload =
        typeof latestReadableMessage?.id === "string" &&
        latestReadableMessage.id.length > 0
          ? { messageId: latestReadableMessage.id }
          : {};

      try {
        await apiClient.post(`/rooms/${conversationId}/messages/read`, payload);
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
        const response = await apiClient.get<ApiResponse<unknown>>("/rooms");
        const payload = unwrapApiSuccess(response.data);
        const conversations = toConversationArray(payload);
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
        const isOpenConversation = state.selectedConversationId === conversationId;

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
        };
      });
    },

    fetchMessages: async (conversationId, before, after) => {
      const currentInFlight = roomMessageFetchInFlight.get(conversationId) ?? 0;
      roomMessageFetchInFlight.set(conversationId, currentInFlight + 1);
      const isInitialFetch = !before && !after;
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
        const params = new URLSearchParams({ limit: "50" });
        if (before) params.set("before", before);
        if (after) params.set("after", after);

        const response = await apiClient.get<ApiResponse<unknown>>(
          `/rooms/${conversationId}/messages?${params.toString()}`,
        );
        const responseEnvelope = asRecord(response.data);
        const responseMeta = asRecord(responseEnvelope?.meta);
        const payload = unwrapApiSuccess(response.data);
        const normalized = normalizeMessagesResponse(payload, responseMeta);

        set((state) => {
          if (
            initialFetchSeq !== null &&
            initialFetchSeqByConversation.get(conversationId) !== initialFetchSeq
          ) {
            return state;
          }

          const existingMessages = state.messages[conversationId] || [];
          const mergedMessages = mergeMessages(existingMessages, normalized.messages);
          const latestMessage = mergedMessages[mergedMessages.length - 1];

          const updatedConversations = state.conversations.map((conversation) => {
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
          });

          return {
            conversations: updatedConversations,
            messages: {
              ...state.messages,
              [conversationId]: mergedMessages,
            },
            hasMoreMessages: {
              ...state.hasMoreMessages,
              [conversationId]:
                before || (!before && !after)
                  ? normalized.hasMore
                  : state.hasMoreMessages[conversationId] ?? false,
            },
          };
        });

        return { loaded: normalized.messages.length, hasMore: normalized.hasMore };
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
    ) => {
      const text = content.trim();
      const messageContent = text || fileMeta?.fileName || "";
      if (!messageContent) return;

      const sender = resolveSenderIdentity();

      const tempId = `temp-${Date.now()}-${Math.random()}`;
      const tempMessage: Message = {
        id: tempId,
        localId: tempId,
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
        ...(fileMeta ? { attachments: [fileMeta] } : {}),
      };

      get().addMessage(conversationId, tempMessage);

      try {
        const attachments = fileMeta ? toAttachmentPayload([fileMeta]) : undefined;
        const response = await apiClient.post<ApiResponse<Message>>(
          `/rooms/${conversationId}/messages`,
          {
            content: messageContent,
            type,
            senderName: sender.senderName,
            ...(sender.senderAvatar ? { senderAvatar: sender.senderAvatar } : {}),
            tempId,
            ...(replyToId ? { replyTo: replyToId } : {}),
            ...(attachments?.length ? { attachments } : {}),
          },
        );
        const message = normalizeMessage(
          unwrapApiSuccess(response.data),
          conversationId,
        );
        if (!message) {
          throw new Error(i18n.t("error:chat.invalidSendResponse"));
        }

        get().addMessage(conversationId, {
          ...message,
          localId: tempId,
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
        const response = await apiClient.post<ApiResponse<Message>>(
          `/rooms/${conversationId}/messages`,
          {
            content: message.content,
            type: message.type,
            senderName,
            ...(senderAvatar ? { senderAvatar } : {}),
            tempId: message.localId || message.id,
            ...(replyToId ? { replyTo: replyToId } : {}),
            ...(attachments?.length ? { attachments } : {}),
          },
        );
        const resentMessage = normalizeMessage(
          unwrapApiSuccess(response.data),
          conversationId,
        );
        if (!resentMessage) {
          throw new Error(i18n.t("error:chat.invalidResendResponse"));
        }

        get().addMessage(conversationId, {
          ...resentMessage,
          localId: message.localId || message.id,
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
              typing.conversationId === conversationId && typing.userId === userId
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
    return state.typingStatuses.find(
      (typing) =>
        typing.conversationId === state.selectedConversationId && typing.isTyping,
    );
  });
};

export const useFilteredConversations = () => {
  return useChatStore((state) => {
    let filtered = Array.isArray(state.conversations) ? state.conversations : [];

    switch (state.activeFilter) {
      case "unread":
        filtered = filtered.filter((conversation) => conversation.unreadCount > 0);
        break;
      case "groups":
        filtered = filtered.filter((conversation) => conversation.type === "group");
        break;
      case "channels":
        filtered = filtered.filter(
          (conversation) => conversation.type === "channel",
        );
        break;
    }

    if (state.searchQuery.trim()) {
      const query = state.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (conversation) =>
          conversation.name?.toLowerCase().includes(query) ||
          conversation.lastMessage?.content?.toLowerCase().includes(query),
      );
    }

    return filtered.slice().sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return toDateValue(b.updatedAt) - toDateValue(a.updatedAt);
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
