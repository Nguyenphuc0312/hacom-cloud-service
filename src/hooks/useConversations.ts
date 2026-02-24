/**
 * @fileoverview useConversations hook
 * Custom hook quản lý danh sách conversations/rooms
 */

import { useEffect, useCallback } from "react";
import {
  useChatStore,
  useFilteredConversations,
  useTotalUnreadCount,
} from "../stores";
import type { Conversation, ConversationFilter } from "../types";

interface UseConversationsReturn {
  conversations: Conversation[];
  filteredConversations: Conversation[];
  selectedConversationId: string | null;
  selectedConversation: Conversation | undefined;
  totalUnread: number;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  activeFilter: ConversationFilter;

  // Actions
  selectConversation: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setActiveFilter: (filter: ConversationFilter) => void;
  refreshConversations: () => Promise<void>;
  markAsRead: (conversationId: string) => Promise<void>;
}

export const useConversations = (): UseConversationsReturn => {
  const {
    conversations,
    selectedConversationId,
    isLoadingConversations,
    error,
    searchQuery,
    activeFilter,
    selectConversation,
    setSearchQuery,
    setActiveFilter,
    fetchConversations,
    markAsRead,
  } = useChatStore();

  const filteredConversations = useFilteredConversations();
  const totalUnread = useTotalUnreadCount();

  // Load conversations on mount
  useEffect(() => {
    if (conversations.length === 0) {
      fetchConversations();
    }
  }, [conversations.length, fetchConversations]);

  // Refresh conversations
  const refreshConversations = useCallback(async () => {
    await fetchConversations();
  }, [fetchConversations]);

  // Get selected conversation
  const selectedConversation = conversations.find(
    (c) => c.id === selectedConversationId,
  );

  return {
    conversations,
    filteredConversations,
    selectedConversationId,
    selectedConversation,
    totalUnread,
    isLoading: isLoadingConversations,
    error,
    searchQuery,
    activeFilter,
    selectConversation,
    setSearchQuery,
    setActiveFilter,
    refreshConversations,
    markAsRead,
  };
};

export default useConversations;
