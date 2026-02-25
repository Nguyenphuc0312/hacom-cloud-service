/**
 * @fileoverview useMessages hook
 * Custom hook quan ly messages trong mot conversation
 */

import { useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  useChatStore,
  useMessagesByConversation,
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
  const { t } = useTranslation();
  const messages = useMessagesByConversation(conversationId);
  const typingStatus = useChatStore((state) => {
    if (!conversationId) return null;
    return (
      state.typingStatuses.find(
        (typing) => typing.conversationId === conversationId && typing.isTyping,
      ) || null
    );
  });
  const isLoading = useChatStore((state) =>
    conversationId !== null
      ? Boolean(state.isLoadingMessagesByConversation[conversationId])
      : state.isLoadingMessages,
  );
  const hasMore = useChatStore((state) =>
    conversationId ? (state.hasMoreMessages[conversationId] ?? true) : false,
  );
  const error = useChatStore((state) =>
    conversationId ? (state.messageErrors[conversationId] ?? null) : state.error,
  );
  const isHydrated = useChatStore((state) =>
    conversationId
      ? Boolean(state.messagesHydratedByConversation[conversationId])
      : false,
  );
  const isLoadingByConversation = useChatStore(
    (state) => state.isLoadingMessagesByConversation,
  );
  const fetchMessages = useChatStore((state) => state.fetchMessages);
  const storeSendMessage = useChatStore((state) => state.sendMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const removeMessage = useChatStore((state) => state.removeMessage);
  const clearError = useChatStore((state) => state.clearError);

  const {
    joinRoom,
    leaveRoom,
    sendTyping: wsSendTyping,
    stopTyping: wsStopTyping,
    emit,
  } = useWebSocket({ autoConnect: false });

  const previousConversationRef = useRef<string | null>(null);

  useEffect(() => {
    if (conversationId) {
      if (
        previousConversationRef.current &&
        previousConversationRef.current !== conversationId
      ) {
        leaveRoom(previousConversationRef.current);
      }

      joinRoom(conversationId);
      previousConversationRef.current = conversationId;

      if (autoLoad && !isHydrated) {
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
    isHydrated,
  ]);

  const loadMessages = useCallback(async () => {
    if (conversationId) {
      clearError();
      await fetchMessages(conversationId, undefined, undefined, { force: true });
    }
  }, [conversationId, fetchMessages, clearError]);

  const loadMore = useCallback(async () => {
    if (
      conversationId &&
      hasMore &&
      !isLoadingByConversation[conversationId]
    ) {
      const oldestMessage = messages.find(
        (message) => !message.id.startsWith("temp-"),
      );
      if (oldestMessage) {
        await fetchMessages(
          conversationId,
          new Date(oldestMessage.createdAt).toISOString(),
          undefined,
          { beforeId: oldestMessage.id },
        );
      }
    }
  }, [
    conversationId,
    hasMore,
    isLoadingByConversation,
    messages,
    fetchMessages,
  ]);

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
        toast.error(t("chat:toast.sendFailed"));
      }
    },
    [conversationId, storeSendMessage, t],
  );

  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      if (!conversationId || !content.trim()) return;

      try {
        updateMessage(conversationId, messageId, {
          content: content.trim(),
          isEdited: true,
        });

        emit("message:edit", {
          roomId: conversationId,
          messageId,
          content: content.trim(),
        });

        toast.success(t("chat:toast.messageEdited"));
      } catch {
        toast.error(t("chat:toast.editFailed"));
      }
    },
    [conversationId, updateMessage, emit, t],
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!conversationId) return;

      try {
        removeMessage(conversationId, messageId);

        emit("message:delete", {
          roomId: conversationId,
          messageId,
        });

        toast.success(t("chat:toast.messageDeleted"));
      } catch {
        toast.error(t("chat:toast.deleteFailed"));
      }
    },
    [conversationId, removeMessage, emit, t],
  );

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
    isLoading,
    hasMore,
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
