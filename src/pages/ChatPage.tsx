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
import { toast } from "../components/ui";
import {
  useAuthStore,
  useChatStore,
  useSelectedConversation,
  useCurrentMessages,
  useCurrentTypingStatus,
} from "../stores";
import { useWebSocket } from "../hooks";
import { conversationApi } from "../services/api";
import type { Message, UserSummary, Attachment } from "../types";
import { MessageType, RoomType, UserStatus } from "../types";
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
    markAsRead,
    hasMoreMessages,
    isLoadingMessages,
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(!conversationId);
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
      void fetchMessages(selectedConversationId);
      joinRoom(selectedConversationId);
      markAsRead(selectedConversationId);

      return () => {
        stopTyping(selectedConversationId);
        leaveRoom(selectedConversationId);
      };
    }
  }, [
    selectedConversationId,
    fetchMessages,
    joinRoom,
    leaveRoom,
    markAsRead,
    stopTyping,
  ]);

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
      if (!selectedConversationId) return;

      try {
        await storeSendMessage(
          selectedConversationId,
          content,
          type,
          fileMeta,
          replyTo?.id,
        );
      } catch {
        toast.error("Khong the gui tin nhan. Vui long thu lai.");
      }
    },
    [selectedConversationId, storeSendMessage],
  );

  const handleLoadOlderMessages = useCallback(async () => {
    if (!selectedConversationId || isLoadingMessages) return;
    if (!hasMoreMessages[selectedConversationId]) return;

    const oldestMessage = conversationMessages.find(
      (message) => !message.id.startsWith("temp-"),
    );
    if (!oldestMessage) return;

    await fetchMessages(
      selectedConversationId,
      new Date(oldestMessage.createdAt).toISOString(),
    );
  }, [
    selectedConversationId,
    isLoadingMessages,
    hasMoreMessages,
    conversationMessages,
    fetchMessages,
  ]);

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
  const handleStartChat = useCallback(
    async (userId: string) => {
      try {
        const response = await conversationApi.createPrivateConversation(userId);
        const roomId = response.data?.id;
        if (!roomId) {
          throw new Error("Missing room id");
        }

        // Refresh list to get full room shape (participants, display fields...)
        fetchConversations().catch((error) => {
          console.warn("Refresh conversations after creating direct room failed:", error);
        });
        selectConversation(roomId);
        navigate(`/chat/${roomId}`);
      } catch (error) {
        console.error("Create direct room failed:", error);
        toast.error("Khong the bat dau cuoc tro chuyen");
        throw new Error("Cannot create conversation");
      }
    },
    [fetchConversations, navigate, selectConversation],
  );

  const handleCreateGroup = useCallback(
    async (payload: { name: string; memberIds: string[] }) => {
      try {
        const response = await conversationApi.createGroupConversation({
          name: payload.name,
          memberIds: payload.memberIds,
        });
        const roomId = response.data?.id;
        if (!roomId) {
          throw new Error("Missing room id");
        }

        fetchConversations().catch((error) => {
          console.warn("Refresh conversations after creating group room failed:", error);
        });
        selectConversation(roomId);
        navigate(`/chat/${roomId}`);
      } catch (error) {
        console.error("Create group room failed:", error);
        toast.error("Khong the tao nhom moi");
        throw new Error("Cannot create group");
      }
    },
    [fetchConversations, navigate, selectConversation],
  );

  // Handle new chat modal
  const handleOpenNewChat = useCallback(() => {
    setIsNewChatModalOpen(true);
  }, []);

  const showSidebarOnMobile = !selectedConversationId || isMobileMenuOpen;

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
    <div className="relative flex h-[100dvh] max-h-[100dvh] overflow-hidden bg-white">
      {/* Connection status indicator */}
      {!isConnected && (
        <div
          className="absolute inset-x-0 top-0 z-50 bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-white sm:text-sm"
          role="status"
          aria-live="polite"
        >
          Đang kết nối lại...
        </div>
      )}

      {/* Sidebar */}
      <div
        className={clsx(
          "absolute inset-y-0 left-0 z-30 w-full max-w-full border-r border-gray-200 bg-white transition-transform duration-300 sm:max-w-[min(24rem,92vw)] lg:relative lg:z-0 lg:w-[clamp(18rem,24vw,22rem)] lg:max-w-none",
          showSidebarOnMobile
            ? "translate-x-0"
            : "-translate-x-full lg:translate-x-0",
        )}
        aria-hidden={!showSidebarOnMobile}
      >
        <Sidebar
          conversations={conversations}
          currentUser={currentUserSummary}
          selectedId={selectedConversationId}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleOpenNewChat}
        />
      </div>

      {showSidebarOnMobile && selectedConversationId && (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-label="Đóng danh sách cuộc trò chuyện"
        />
      )}

      {/* Chat window */}
      <div
        className={clsx(
          "relative z-10 flex min-w-0 flex-1 flex-col",
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
            hasMoreMessages={
              selectedConversationId
                ? (hasMoreMessages[selectedConversationId] ?? true)
                : false
            }
            isLoadingMessages={isLoadingMessages}
            onLoadOlderMessages={handleLoadOlderMessages}
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
            "fixed inset-y-0 right-0 z-40 w-full max-w-full border-l border-gray-200 bg-white transition-transform duration-300 sm:max-w-[min(26rem,94vw)] lg:relative lg:z-0 lg:w-[clamp(20rem,28vw,24rem)] lg:max-w-none",
            isInfoPanelOpen
              ? "translate-x-0"
              : "translate-x-full lg:hidden",
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
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={handleToggleInfoPanel}
        />
      )}

      {/* New Chat Modal */}
      <NewChatModal
        isOpen={isNewChatModalOpen}
        onClose={() => setIsNewChatModalOpen(false)}
        onStartChat={handleStartChat}
        onCreateGroup={handleCreateGroup}
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
