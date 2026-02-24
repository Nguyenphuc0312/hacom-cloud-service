/**
 * @fileoverview Chat store (Zustand)
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

import apiClient from "../lib/axios";
import type { ApiResponse } from "@hacom/chat-shared-types";
import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";
import { toast } from "../utils/toast";
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
  hasMoreMessages: Record<string, boolean>;
  error: string | null;

  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  removeConversation: (id: string) => void;
  selectConversation: (id: string | null) => void;
  markAsRead: (conversationId: string) => void;
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
  ) => Promise<void>;
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

const initialState = {
  conversations: [],
  messages: {},
  selectedConversationId: null,
  typingStatuses: [],
  searchQuery: "",
  activeFilter: "all" as ConversationFilter,
  isLoadingConversations: false,
  isLoadingMessages: false,
  hasMoreMessages: {},
  error: null,
};

const EMPTY_MESSAGES: Message[] = [];

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
  return a.id.localeCompare(b.id);
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
    source.localId === target.localId);

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
): { messages: Message[]; hasMore: boolean } => {
  if (Array.isArray(rawData)) {
    return { messages: rawData as Message[], hasMore: false };
  }

  const payload = asRecord(rawData);
  if (!payload) {
    return { messages: [], hasMore: false };
  }

  const messages = Array.isArray(payload.messages)
    ? (payload.messages as Message[])
    : [];

  if (typeof payload.hasMore === "boolean") {
    return { messages, hasMore: payload.hasMore };
  }

  const pagination = asRecord(payload.pagination);
  return {
    messages,
    hasMore: Boolean(pagination?.hasNextPage),
  };
};

const toAttachmentPayload = (attachments?: Attachment[]) =>
  attachments?.map((attachment) => ({
    fileId: attachment.id,
    type: attachment.type,
  }));

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

    markAsRead: (conversationId) => {
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

      apiClient.post(`/rooms/${conversationId}/messages/read`, payload).catch(() => {
        // no-op
      });
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
        const errorMessage = apiError.message || "Khong the tai danh sach hoi thoai";
        set({
          error: errorMessage,
          isLoadingConversations: false,
        });
      }
    },

    setMessages: (conversationId, messages) => {
      const normalized = mergeMessages([], Array.isArray(messages) ? messages : []);
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: normalized,
        },
      }));
    },

    addMessage: (conversationId, message) => {
      set((state) => {
        const currentMessages = state.messages[conversationId] || [];
        const { messages, inserted, mergedMessage } = upsertMessage(
          currentMessages,
          message,
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
      set({ isLoadingMessages: true, error: null });

      try {
        const params = new URLSearchParams({ limit: "50" });
        if (before) params.set("before", before);
        if (after) params.set("after", after);

        const response = await apiClient.get<ApiResponse<unknown>>(
          `/rooms/${conversationId}/messages?${params.toString()}`,
        );
        const payload = unwrapApiSuccess(response.data);
        const normalized = normalizeMessagesResponse(payload);

        set((state) => {
          const existingMessages = state.messages[conversationId] || [];
          const optimisticMessages = existingMessages.filter(
            (message) =>
              isTempMessageId(message.id) ||
              message.status === MessageStatus.SENDING ||
              message.status === MessageStatus.FAILED,
          );
          const mergedMessages =
            before || after
              ? mergeMessages(existingMessages, normalized.messages)
              : mergeMessages(optimisticMessages, normalized.messages);
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
            isLoadingMessages: false,
          };
        });
      } catch (error: unknown) {
        const apiError = extractApiError(error);
        const errorMessage = apiError.message || "Khong the tai tin nhan";
        set({
          error: errorMessage,
          isLoadingMessages: false,
        });
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

      const currentUser = useAuthStore.getState().user;
      const tempId = `temp-${Date.now()}-${Math.random()}`;
      const tempMessage: Message = {
        id: tempId,
        localId: tempId,
        conversationId,
        senderId: currentUser?.id || "current-user",
        senderName:
          `${currentUser?.firstName || ""} ${currentUser?.lastName || ""}`.trim() ||
          currentUser?.username ||
          "Ban",
        senderAvatar: currentUser?.avatar,
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
            tempId,
            ...(replyToId ? { replyTo: replyToId } : {}),
            ...(attachments?.length ? { attachments } : {}),
          },
        );
        const message = unwrapApiSuccess(response.data);

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

      try {
        const response = await apiClient.post<ApiResponse<Message>>(
          `/rooms/${conversationId}/messages`,
          {
            content: message.content,
            type: message.type,
            tempId: message.localId || message.id,
            ...(replyToId ? { replyTo: replyToId } : {}),
            ...(attachments?.length ? { attachments } : {}),
          },
        );
        const resentMessage = unwrapApiSuccess(response.data);

        get().addMessage(conversationId, {
          ...resentMessage,
          localId: message.localId || message.id,
          status: resentMessage.status || MessageStatus.SENT,
        });
        toast.success("Gui lai thanh cong");
      } catch {
        get().updateMessage(conversationId, message.id, {
          status: MessageStatus.FAILED,
        });
        toast.error("Gui lai khong thanh cong");
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

    reset: () => set(initialState),
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
