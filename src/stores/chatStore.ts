/**
 * @fileoverview Chat Store (Zustand)
 * Quản lý state cho chat rooms, messages, typing indicators
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { shallow } from "zustand/shallow";
import apiClient from "../lib/axios";
import type { ApiResponse } from "../lib/axios";
import type {
  Conversation,
  Message,
  TypingStatus,
  ConversationFilter,
} from "../types";
import { MessageType, MessageStatus } from "../types";

// ============================================
// TYPES
// ============================================

interface MessagesResponse {
  messages: Message[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

interface ChatState {
  // State
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

  // Actions - Conversations
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  removeConversation: (id: string) => void;
  selectConversation: (id: string | null) => void;
  markAsRead: (conversationId: string) => void;
  fetchConversations: () => Promise<void>;

  // Actions - Messages
  setMessages: (conversationId: string, messages: Message[]) => void;
  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (
    conversationId: string,
    messageId: string,
    updates: Partial<Message>,
  ) => void;
  removeMessage: (conversationId: string, messageId: string) => void;
  fetchMessages: (conversationId: string, before?: string) => Promise<void>;
  sendMessage: (
    conversationId: string,
    content: string,
    replyToId?: string,
  ) => Promise<void>;

  // Actions - Typing
  setTyping: (status: TypingStatus) => void;
  clearTyping: (conversationId: string, userId: string) => void;

  // Actions - Filters
  setSearchQuery: (query: string) => void;
  setActiveFilter: (filter: ConversationFilter) => void;

  // Actions - Utils
  clearError: () => void;
  reset: () => void;
}

// ============================================
// INITIAL STATE
// ============================================

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

// ============================================
// STORE
// ============================================

export const useChatStore = create<ChatState>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // ============================================
    // CONVERSATION ACTIONS
    // ============================================

    setConversations: (conversations) => {
      set({ conversations });
    },

    addConversation: (conversation) => {
      set((state) => ({
        conversations: [conversation, ...state.conversations],
      }));
    },

    updateConversation: (id, updates) => {
      set((state) => ({
        conversations: state.conversations.map((conv) =>
          conv.id === id ? { ...conv, ...updates } : conv,
        ),
      }));
    },

    removeConversation: (id) => {
      set((state) => ({
        conversations: state.conversations.filter((conv) => conv.id !== id),
        messages: Object.fromEntries(
          Object.entries(state.messages).filter(([key]) => key !== id),
        ),
        selectedConversationId:
          state.selectedConversationId === id
            ? null
            : state.selectedConversationId,
      }));
    },

    selectConversation: (id) => {
      set({ selectedConversationId: id });

      // Đánh dấu đã đọc khi chọn conversation
      if (id) {
        get().markAsRead(id);
      }
    },

    markAsRead: (conversationId) => {
      set((state) => ({
        conversations: state.conversations.map((conv) =>
          conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv,
        ),
      }));

      // Gọi API mark as read (fire and forget)
      apiClient.post(`/rooms/${conversationId}/messages/read`).catch(() => {
        // Bỏ qua lỗi
      });
    },

    fetchConversations: async () => {
      set({ isLoadingConversations: true, error: null });

      try {
        const response =
          await apiClient.get<ApiResponse<Conversation[]>>("/rooms");
        set({
          conversations: response.data.data,
          isLoadingConversations: false,
        });
      } catch (error: unknown) {
        const errorMessage =
          (error as { response?: { data?: { error?: { message?: string } } } })
            ?.response?.data?.error?.message ||
          "Không thể tải danh sách hội thoại";
        set({
          error: errorMessage,
          isLoadingConversations: false,
        });
      }
    },

    // ============================================
    // MESSAGE ACTIONS
    // ============================================

    setMessages: (conversationId, messages) => {
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: messages,
        },
      }));
    },

    addMessage: (conversationId, message) => {
      set((state) => {
        const currentMessages = state.messages[conversationId] || [];

        // Kiểm tra message đã tồn tại chưa (tránh duplicate)
        if (currentMessages.some((m) => m.id === message.id)) {
          return state;
        }

        return {
          messages: {
            ...state.messages,
            [conversationId]: [...currentMessages, message],
          },
          // Cập nhật lastMessage trong conversation
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? { ...conv, lastMessage: message, updatedAt: new Date() }
              : conv,
          ),
        };
      });
    },

    updateMessage: (conversationId, messageId, updates) => {
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: (state.messages[conversationId] || []).map((msg) =>
            msg.id === messageId ? { ...msg, ...updates } : msg,
          ),
        },
      }));
    },

    removeMessage: (conversationId, messageId) => {
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: (state.messages[conversationId] || []).filter(
            (msg) => msg.id !== messageId,
          ),
        },
      }));
    },

    fetchMessages: async (conversationId, before) => {
      set({ isLoadingMessages: true, error: null });

      try {
        const params = new URLSearchParams({
          limit: "50",
          ...(before && { before }),
        });

        const response = await apiClient.get<ApiResponse<MessagesResponse>>(
          `/rooms/${conversationId}/messages?${params}`,
        );

        const { messages: newMessages, pagination } = response.data.data;

        set((state) => {
          const existingMessages = before
            ? state.messages[conversationId] || []
            : [];

          return {
            messages: {
              ...state.messages,
              [conversationId]: before
                ? [...newMessages, ...existingMessages]
                : newMessages,
            },
            hasMoreMessages: {
              ...state.hasMoreMessages,
              [conversationId]: pagination.hasNextPage,
            },
            isLoadingMessages: false,
          };
        });
      } catch (error: unknown) {
        const errorMessage =
          (error as { response?: { data?: { error?: { message?: string } } } })
            ?.response?.data?.error?.message || "Không thể tải tin nhắn";
        set({
          error: errorMessage,
          isLoadingMessages: false,
        });
      }
    },

    sendMessage: async (conversationId, content, replyToId) => {
      const tempId = `temp-${Date.now()}`;

      // Tạo message tạm (optimistic update)
      const tempMessage: Message = {
        id: tempId,
        conversationId,
        senderId: "current-user", // Sẽ được replace bởi server
        senderName: "Bạn",
        content,
        type: MessageType.TEXT,
        status: MessageStatus.SENDING,
        isEdited: false,
        isPinned: false,
        isDeleted: false,
        isSystem: false,
        createdAt: new Date(),
        ...(replyToId && { replyToId }),
      };

      // Add message ngay lập tức
      get().addMessage(conversationId, tempMessage);

      try {
        const response = await apiClient.post<ApiResponse<Message>>(
          `/rooms/${conversationId}/messages`,
          {
            content,
            type: "text",
            ...(replyToId && { replyTo: replyToId }),
          },
        );

        // Replace temp message với message thật
        set((state) => ({
          messages: {
            ...state.messages,
            [conversationId]: (state.messages[conversationId] || []).map(
              (msg) => (msg.id === tempId ? response.data.data : msg),
            ),
          },
        }));
      } catch {
        // Đánh dấu message failed
        get().updateMessage(conversationId, tempId, {
          status: "failed" as Message["status"],
        });
      }
    },

    // ============================================
    // TYPING ACTIONS
    // ============================================

    setTyping: (status) => {
      set((state) => {
        // Kiểm tra đã có typing status này chưa
        const exists = state.typingStatuses.some(
          (t) =>
            t.conversationId === status.conversationId &&
            t.userId === status.userId,
        );

        if (exists) {
          return {
            typingStatuses: state.typingStatuses.map((t) =>
              t.conversationId === status.conversationId &&
              t.userId === status.userId
                ? status
                : t,
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
          (t) => !(t.conversationId === conversationId && t.userId === userId),
        ),
      }));
    },

    // ============================================
    // FILTER ACTIONS
    // ============================================

    setSearchQuery: (query) => {
      set({ searchQuery: query });
    },

    setActiveFilter: (filter) => {
      set({ activeFilter: filter });
    },

    // ============================================
    // UTILITY ACTIONS
    // ============================================

    clearError: () => set({ error: null }),

    reset: () => set(initialState),
  })),
);

// ============================================
// SELECTORS
// ============================================

/**
 * Selector lấy conversation đang được chọn
 */
export const useSelectedConversation = () => {
  return useChatStore((state) => {
    if (!state.selectedConversationId) return null;
    return state.conversations.find(
      (c) => c.id === state.selectedConversationId,
    );
  });
};

/**
 * Selector lấy messages của conversation đang chọn
 * (implemented below with `shallow` equality)
 */

/**
 * Selector lấy typing status của conversation đang chọn
 */
export const useCurrentTypingStatus = () => {
  return useChatStore((state) => {
    if (!state.selectedConversationId) return null;
    return state.typingStatuses.find(
      (t) => t.conversationId === state.selectedConversationId && t.isTyping,
    );
  });
};

/**
 * Selector lấy conversations đã filter
 */
export const useFilteredConversations = () => {
  return useChatStore((state) => {
    let filtered = state.conversations;

    // Filter theo tab
    switch (state.activeFilter) {
      case "unread":
        filtered = filtered.filter((c) => c.unreadCount > 0);
        break;
      case "groups":
        filtered = filtered.filter((c) => c.type === "group");
        break;
      case "channels":
        filtered = filtered.filter((c) => c.type === "channel");
        break;
    }

    // Filter theo search query
    if (state.searchQuery.trim()) {
      const query = state.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.name?.toLowerCase().includes(query) ||
          c.lastMessage?.content?.toLowerCase().includes(query),
      );
    }

    // Sort: pinned first, then by updatedAt
    // Use a copy to avoid mutating the original state array (causes infinite updates)
    return filtered.slice().sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  });
};

/**
 * Selector đếm tổng unread
 */
export const useTotalUnreadCount = () => {
  return useChatStore((state) =>
    state.conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
  );
};

/**
 * Selector lấy messages của conversation đang chọn
 * Use `shallow` equality to avoid returning new array references
 */

export const useCurrentMessages = () =>
  useChatStore((state) => {
    const id = state.selectedConversationId;
    if (!id) return EMPTY_MESSAGES;
    return state.messages[id] || EMPTY_MESSAGES;
  });
