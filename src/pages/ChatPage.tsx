/**
 * @fileoverview Chat Page - Main chat interface
 * Tích hợp với Zustand stores và WebSocket
 */

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Sidebar } from "../components/layout/Sidebar";
import { ChatWindow } from "../components/layout/ChatWindow";
import { UserProfile } from "../components/info/UserProfile";
import { GroupInfo } from "../components/info/GroupInfo";
import { NoChatSelected } from "../components/ui";
import { NewChatModal, ImagePreviewModal } from "../components/modals";
import {
  useAuthStore,
  useChatStore,
  useSelectedConversation,
  useCurrentMessages,
  useCurrentTypingStatus,
} from "../stores";
import { useWebSocket } from "../hooks";
import type { Message, UserSummary, Attachment } from "../types";
import { MessageType, MessageStatus, RoomType, UserStatus } from "../types";
import { getOtherParticipant } from "../utils/messageHelpers";

export const ChatPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();

  // Auth store
  const { user } = useAuthStore();

  // Chat store
  const {
    selectedConversationId,
    selectConversation,
    conversations,
    fetchConversations,
    fetchMessages,
    sendMessage: storeSendMessage,
    addMessage,
    updateMessage,
    markAsRead,
  } = useChatStore();

  // Selectors
  const selectedConversation = useSelectedConversation();
  const conversationMessages = useCurrentMessages();
  const typingStatus = useCurrentTypingStatus();

  // WebSocket
  const { isConnected, sendTyping, stopTyping, joinRoom, leaveRoom } =
    useWebSocket();

  // Local state
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Current user as UserSummary for components
  const currentUserSummary = useMemo<UserSummary | null>(
    () =>
      user
        ? {
            id: user.id,
            username: user.username,
            displayName:
              `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
              user.username,
            avatar: user.avatar,
            status: user.status as UserStatus,
            isBot: false,
          }
        : null,
    [user],
  );

  // Sync URL with store
  useEffect(() => {
    if (conversationId && conversationId !== selectedConversationId) {
      selectConversation(conversationId);
    }
  }, [conversationId, selectedConversationId, selectConversation]);

  // Load conversations on mount
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Load messages when conversation changes & join/leave rooms
  useEffect(() => {
    if (selectedConversationId) {
      fetchMessages(selectedConversationId);
      markAsRead(selectedConversationId);
      joinRoom(selectedConversationId);

      return () => {
        leaveRoom(selectedConversationId);
      };
    }
  }, [selectedConversationId, fetchMessages, markAsRead, joinRoom, leaveRoom]);

  // Handle select conversation
  const handleSelectConversation = useCallback(
    (id: string) => {
      selectConversation(id);
      setIsMobileMenuOpen(false);
      navigate(`/chat/${id}`);
    },
    [selectConversation, navigate],
  );

  // Handle send message
  const handleSendMessage = useCallback(
    async (
      content: string,
      replyTo?: Message,
      fileMeta?: Attachment | undefined,
      type: MessageType = MessageType.TEXT,
    ) => {
      if (!selectedConversationId || !currentUserSummary) return;

      // Optimistic update - create temp message
      const tempId = `temp-${Date.now()}`;
      const tempMessage: Message = {
        id: tempId,
        conversationId: selectedConversationId,
        senderId: currentUserSummary.id,
        senderName:
          currentUserSummary.displayName || currentUserSummary.username,
        senderAvatar: currentUserSummary.avatar,
        content,
        type,
        status: fileMeta
          ? ("uploading" as MessageStatus)
          : MessageStatus.SENDING,
        isEdited: false,
        isPinned: false,
        isDeleted: false,
        isSystem: false,
        createdAt: new Date(),
        replyTo: replyTo?.id,
        ...(fileMeta && { attachments: [fileMeta] }),
      } as Message;

      // Add to store temporarily
      addMessage(selectedConversationId, tempMessage);

      try {
        // Send via API (storeSendMessage handles optimistic replacement)
        await storeSendMessage(
          selectedConversationId,
          content,
          type,
          fileMeta,
          replyTo?.id,
        );
      } catch (error) {
        console.error("Failed to send message:", error);
        // Update status to failed
        updateMessage(selectedConversationId, tempId, {
          status: MessageStatus.FAILED,
        });
      }
    },
    [
      selectedConversationId,
      currentUserSummary,
      addMessage,
      storeSendMessage,
      updateMessage,
    ],
  );

  // Handle typing
  const handleTyping = useCallback(
    (isTyping: boolean) => {
      if (selectedConversationId) {
        if (isTyping) {
          sendTyping(selectedConversationId);
        } else {
          stopTyping(selectedConversationId);
        }
      }
    },
    [selectedConversationId, sendTyping, stopTyping],
  );

  // Handle toggle info panel
  const handleToggleInfoPanel = useCallback(() => {
    setIsInfoPanelOpen((prev) => !prev);
  }, []);

  // Handle back (mobile)
  const handleBack = useCallback(() => {
    selectConversation(null);
    setIsMobileMenuOpen(true);
    navigate("/chat");
  }, [selectConversation, navigate]);

  // Handle new chat
  const handleStartChat = useCallback(async (userId: string) => {
    // TODO: Implement create direct conversation API
    console.log("Start chat with:", userId);
    setIsNewChatModalOpen(false);
  }, []);

  // Handle new chat modal
  const handleOpenNewChat = useCallback(() => {
    setIsNewChatModalOpen(true);
  }, []);

  // Get other user for private chat
  const otherUser =
    selectedConversation &&
    (selectedConversation.type === RoomType.PRIVATE ||
      selectedConversation.type === RoomType.DIRECT) &&
    currentUserSummary
      ? getOtherParticipant(selectedConversation, currentUserSummary.id)
      : null;

  if (!currentUserSummary) {
    return null;
  }

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Connection status indicator */}
      {!isConnected && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-yellow-500 text-white text-center py-1 text-sm">
          Đang kết nối lại...
        </div>
      )}

      {/* Sidebar */}
      <div
        className={clsx(
          "w-full lg:w-sidebar flex-shrink-0 transition-transform duration-300",
          "lg:translate-x-0",
          selectedConversationId && !isMobileMenuOpen
            ? "-translate-x-full lg:translate-x-0"
            : "translate-x-0",
          "absolute lg:relative inset-y-0 left-0 z-20 lg:z-0",
        )}
      >
        <Sidebar
          conversations={conversations}
          currentUser={currentUserSummary}
          selectedId={selectedConversationId}
          onSelectConversation={handleSelectConversation}
        />
      </div>

      {/* Chat window */}
      <div
        className={clsx(
          "flex-1 flex flex-col min-w-0",
          !selectedConversation && "hidden lg:flex",
        )}
      >
        {selectedConversation ? (
          <ChatWindow
            conversation={selectedConversation}
            messages={conversationMessages}
            currentUser={currentUserSummary}
            typingStatus={typingStatus || undefined}
            onSendMessage={handleSendMessage}
            onToggleInfoPanel={handleToggleInfoPanel}
            onBack={handleBack}
            onTyping={handleTyping}
            onImageClick={setImagePreview}
          />
        ) : (
          <NoChatSelected onNewChat={handleOpenNewChat} />
        )}
      </div>

      {/* Info panel */}
      {selectedConversation && (
        <div
          className={clsx(
            "w-full lg:w-info-panel flex-shrink-0 transition-all duration-300",
            "fixed lg:relative inset-y-0 right-0 z-30 lg:z-0",
            isInfoPanelOpen
              ? "translate-x-0"
              : "translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden",
          )}
        >
          {(selectedConversation.type === RoomType.PRIVATE ||
            selectedConversation.type === RoomType.DIRECT) &&
          otherUser ? (
            <UserProfile user={otherUser} onClose={handleToggleInfoPanel} />
          ) : (
            <GroupInfo
              conversation={selectedConversation}
              currentUserId={currentUserSummary.id}
              onClose={handleToggleInfoPanel}
            />
          )}
        </div>
      )}

      {/* Info panel overlay (mobile) */}
      {isInfoPanelOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={handleToggleInfoPanel}
        />
      )}

      {/* New Chat Modal */}
      <NewChatModal
        isOpen={isNewChatModalOpen}
        onClose={() => setIsNewChatModalOpen(false)}
        onStartChat={handleStartChat}
      />

      {/* Image Preview Modal */}
      {imagePreview && (
        <ImagePreviewModal
          isOpen={!!imagePreview}
          onClose={() => setImagePreview(null)}
          imageUrl={imagePreview}
        />
      )}
    </div>
  );
};

export default ChatPage;
