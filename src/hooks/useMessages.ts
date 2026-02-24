/**
 * @fileoverview useMessages hook
 * Custom hook quản lý messages trong một conversation
 */

import { useEffect, useCallback, useRef } from "react";
import {
  useChatStore,
  useCurrentMessages,
  useCurrentTypingStatus,
} from "../stores";
import { useWebSocket } from "./useWebSocket";
import { toast } from "../components/ui";
import type { Message } from "../types";
import { MessageType } from "../types";

interface UseMessagesOptions {
  conversationId: string | null;
  autoLoad?: boolean;
}

interface UseMessagesReturn {
  messages: Message[];
  isLoading: boolean;
  hasMore: boolean;
  error: string | null;
  typingStatus: { userId: string; userName: string; isTyping: boolean } | null;

  // Actions
  loadMessages: () => Promise<void>;
  loadMore: () => Promise<void>;
  sendMessage: (content: string, replyToId?: string) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  sendTyping: () => void;
  stopTyping: () => void;
}

export const useMessages = ({
  conversationId,
  autoLoad = true,
}: UseMessagesOptions): UseMessagesReturn => {
  const messages = useCurrentMessages();
  const typingStatus = useCurrentTypingStatus();
  const {
    isLoadingMessages,
    isLoadingMessagesByConversation,
    hasMoreMessages,
    error,
    fetchMessages,
    sendMessage: storeSendMessage,
    updateMessage,
    removeMessage,
    clearError,
  } = useChatStore();

  const {
    joinRoom,
    leaveRoom,
    sendTyping: wsSendTyping,
    stopTyping: wsStopTyping,
    emit,
  } = useWebSocket({ autoConnect: false });

  const previousConversationRef = useRef<string | null>(null);

  // Join room khi conversation thay đổi
  useEffect(() => {
    if (conversationId) {
      // Leave previous room
      if (
        previousConversationRef.current &&
        previousConversationRef.current !== conversationId
      ) {
        leaveRoom(previousConversationRef.current);
      }

      // Join new room
      joinRoom(conversationId);
      previousConversationRef.current = conversationId;

      // Load messages nếu chưa có
      if (autoLoad && !messages.length) {
        fetchMessages(conversationId);
      }
    }

    return () => {
      if (conversationId) {
        leaveRoom(conversationId);
      }
    };
  }, [
    conversationId,
    joinRoom,
    leaveRoom,
    autoLoad,
    fetchMessages,
    messages.length,
  ]);

  // Load messages
  const loadMessages = useCallback(async () => {
    if (conversationId) {
      clearError();
      await fetchMessages(conversationId);
    }
  }, [conversationId, fetchMessages, clearError]);

  // Load more (pagination)
  const loadMore = useCallback(async () => {
    if (
      conversationId &&
      hasMoreMessages[conversationId] &&
      !isLoadingMessagesByConversation[conversationId]
    ) {
      const oldestMessage = messages[0];
      if (oldestMessage) {
        await fetchMessages(
          conversationId,
          new Date(oldestMessage.createdAt).toISOString(),
        );
      }
    }
  }, [
    conversationId,
    hasMoreMessages,
    isLoadingMessagesByConversation,
    messages,
    fetchMessages,
  ]);

  // Send message
  const sendMessage = useCallback(
    async (content: string, replyToId?: string) => {
      if (!conversationId || !content.trim()) return;

      try {
        await storeSendMessage(
          conversationId,
          content.trim(),
          MessageType.TEXT,
          undefined,
          replyToId,
        );
      } catch {
        toast.error("Không thể gửi tin nhắn. Vui lòng thử lại.");
      }
    },
    [conversationId, storeSendMessage],
  );

  // Edit message
  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      if (!conversationId || !content.trim()) return;

      try {
        // Optimistic update
        updateMessage(conversationId, messageId, {
          content: content.trim(),
          isEdited: true,
        });

        // Emit qua WebSocket
        emit("message:edit", {
          roomId: conversationId,
          messageId,
          content: content.trim(),
        });

        toast.success("Đã chỉnh sửa tin nhắn");
      } catch {
        toast.error("Không thể chỉnh sửa tin nhắn");
      }
    },
    [conversationId, updateMessage, emit],
  );

  // Delete message
  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!conversationId) return;

      try {
        // Optimistic update
        removeMessage(conversationId, messageId);

        // Emit qua WebSocket
        emit("message:delete", {
          roomId: conversationId,
          messageId,
        });

        toast.success("Đã xóa tin nhắn");
      } catch {
        toast.error("Không thể xóa tin nhắn");
        // TODO: Rollback optimistic update
      }
    },
    [conversationId, removeMessage, emit],
  );

  // Typing indicators
  const sendTyping = useCallback(() => {
    if (conversationId) {
      wsSendTyping(conversationId);
    }
  }, [conversationId, wsSendTyping]);

  const stopTyping = useCallback(() => {
    if (conversationId) {
      wsStopTyping(conversationId);
    }
  }, [conversationId, wsStopTyping]);

  return {
    messages,
    isLoading:
      conversationId !== null
        ? Boolean(isLoadingMessagesByConversation[conversationId])
        : isLoadingMessages,
    hasMore: conversationId ? (hasMoreMessages[conversationId] ?? true) : false,
    error,
    typingStatus: typingStatus || null,
    loadMessages,
    loadMore,
    sendMessage,
    editMessage,
    deleteMessage,
    sendTyping,
    stopTyping,
  };
};

export default useMessages;

