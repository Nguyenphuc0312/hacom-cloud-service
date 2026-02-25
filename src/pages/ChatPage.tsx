/**
 * @fileoverview Chat Page - Main chat interface
 * Integrated with Zustand stores and WebSocket.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useShallow } from "zustand/react/shallow";
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
import { ErrorCode } from "@hacom/chat-shared-types";
import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";

export const ChatPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();

  // Auth store
  const { user } = useAuthStore();

  // Chat store
  const {
    selectedConversationId,
    selectConversation,
    addConversation,
    updateConversation,
    conversations,
    fetchConversations,
    fetchMessages,
    storeSendMessage,
    markAsRead,
    hasMoreMessages,
    isLoadingMessages,
    isLoadingMessagesByConversation,
  } = useChatStore(
    useShallow((state) => ({
      selectedConversationId: state.selectedConversationId,
      selectConversation: state.selectConversation,
      addConversation: state.addConversation,
      updateConversation: state.updateConversation,
      conversations: state.conversations,
      fetchConversations: state.fetchConversations,
      fetchMessages: state.fetchMessages,
      storeSendMessage: state.sendMessage,
      markAsRead: state.markAsRead,
      hasMoreMessages: state.hasMoreMessages,
      isLoadingMessages: state.isLoadingMessages,
      isLoadingMessagesByConversation: state.isLoadingMessagesByConversation,
    })),
  );

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
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const roomCreationLockRef = useRef(false);
  const [isValidatingRoom, setIsValidatingRoom] = useState(false);

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

  // Validate room in URL then sync to store.
  useEffect(() => {
    let isCancelled = false;

    if (!conversationId) {
      if (useChatStore.getState().selectedConversationId !== null) {
        selectConversation(null);
      }
      return;
    }

    const validateConversation = async () => {
      setIsValidatingRoom(true);
      try {
        const response = await conversationApi.getConversationById(conversationId);
        const room = unwrapApiSuccess(response);
        if (isCancelled) return;

        const roomExists = useChatStore
          .getState()
          .conversations.some((conversation) => conversation.id === conversationId);

        if (roomExists) {
          updateConversation(conversationId, room);
        } else {
          addConversation(room);
        }

        if (conversationId !== useChatStore.getState().selectedConversationId) {
          selectConversation(conversationId);
        }
      } catch (error: unknown) {
        if (isCancelled) return;

        const apiError = extractApiError(error);
        const code = String(apiError.code || "").toUpperCase();
        const roomInvalidCodes = new Set([
          "NOT_FOUND",
          "ROOM_NOT_FOUND",
          "FORBIDDEN",
          "ROOM_ACCESS_DENIED",
        ]);

        if (roomInvalidCodes.has(code)) {
          toast.error("Khong the truy cap cuoc tro chuyen nay");
        } else {
          toast.error(apiError.message || "Khong the mo cuoc tro chuyen");
        }

        selectConversation(null);
        navigate("/chat", { replace: true });
      } finally {
        if (!isCancelled) {
          setIsValidatingRoom(false);
        }
      }
    };

    void validateConversation();

    return () => {
      isCancelled = true;
    };
  }, [
    addConversation,
    conversationId,
    navigate,
    selectConversation,
    updateConversation,
  ]);

  // Load conversations on mount
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Load messages when conversation changes & join/leave rooms
  useEffect(() => {
    let isCancelled = false;

    if (selectedConversationId && !isValidatingRoom) {
      void fetchMessages(selectedConversationId).then(() => {
        if (isCancelled) return;
        void markAsRead(selectedConversationId).catch(() => {
          // no-op: best effort to align unread count
        });
      });
      joinRoom(selectedConversationId);

      return () => {
        isCancelled = true;
        stopTyping(selectedConversationId);
        leaveRoom(selectedConversationId);
      };
    }

    return () => {
      isCancelled = true;
    };
  }, [
    selectedConversationId,
    isValidatingRoom,
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
    if (!selectedConversationId || isLoadingMessagesByConversation[selectedConversationId]) {
      return;
    }
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
    isLoadingMessagesByConversation,
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
      if (isCreatingRoom) {
        return;
      }

      if (roomCreationLockRef.current) {
        return;
      }
      roomCreationLockRef.current = true;
      setIsCreatingRoom(true);
      try {
        const response = await conversationApi.createPrivateConversation(userId);
        const payload = unwrapApiSuccess(response);
        const roomId = payload.id;
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
        const apiError = extractApiError(error);
        const details =
          apiError.details && typeof apiError.details === "object"
            ? (apiError.details as Record<string, unknown>)
            : null;
        const existingRoomId =
          details && typeof details.roomId === "string" ? details.roomId : null;

        if (
          existingRoomId &&
          (apiError.code === ErrorCode.CONFLICT ||
            apiError.code === ErrorCode.ROOM_ALREADY_EXISTS)
        ) {
          fetchConversations().catch((refreshError) => {
            console.warn(
              "Refresh conversations after conflict room lookup failed:",
              refreshError,
            );
          });
          selectConversation(existingRoomId);
          navigate(`/chat/${existingRoomId}`);
          return;
        }

        console.error("Create direct room failed:", apiError);
        toast.error(apiError.message || "Khong the bat dau cuoc tro chuyen");
      } finally {
        roomCreationLockRef.current = false;
        setIsCreatingRoom(false);
      }
    },
    [fetchConversations, isCreatingRoom, navigate, selectConversation],
  );

  const handleCreateGroup = useCallback(
    async (payload: { name: string; memberIds: string[] }) => {
      if (isCreatingRoom) {
        return;
      }

      if (roomCreationLockRef.current) {
        return;
      }
      roomCreationLockRef.current = true;
      setIsCreatingRoom(true);
      try {
        const response = await conversationApi.createGroupConversation({
          name: payload.name,
          memberIds: payload.memberIds,
        });
        const roomPayload = unwrapApiSuccess(response);
        const roomId = roomPayload.id;
        if (!roomId) {
          throw new Error("Missing room id");
        }

        fetchConversations().catch((error) => {
          console.warn("Refresh conversations after creating group room failed:", error);
        });
        selectConversation(roomId);
        navigate(`/chat/${roomId}`);
      } catch (error) {
        const apiError = extractApiError(error);
        console.error("Create group room failed:", apiError);
        toast.error(apiError.message || "Khong the tao nhom moi");
      } finally {
        roomCreationLockRef.current = false;
        setIsCreatingRoom(false);
      }
    },
    [fetchConversations, isCreatingRoom, navigate, selectConversation],
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
    <div className="relative flex h-[100dvh] max-h-[100dvh] overflow-hidden bg-surface">
      {/* Connection status indicator */}
      {!isConnected && (
        <div
          className="absolute inset-x-0 top-0 z-50 bg-warning px-4 py-2 text-center text-xs font-medium text-text-inverse sm:text-sm"
          role="status"
          aria-live="polite"
        >
          Đang kết nối lại...
        </div>
      )}

      {/* Sidebar */}
      <div
        className={clsx(
          "absolute inset-y-0 left-0 z-30 w-full max-w-full bg-surface transition-transform duration-300 sm:max-w-[min(24rem,92vw)] lg:relative lg:z-0 lg:w-auto lg:max-w-none lg:flex-shrink-0",
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
          className="fixed inset-0 z-20 bg-text-primary/40 lg:hidden"
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
            isLoadingMessages={
              selectedConversationId
                ? Boolean(isLoadingMessagesByConversation[selectedConversationId])
                : isLoadingMessages
            }
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
            "fixed inset-y-0 right-0 z-40 w-full max-w-full border-l border-border bg-surface transition-transform duration-300 sm:max-w-[min(26rem,94vw)] lg:relative lg:z-0 lg:w-[clamp(20rem,28vw,24rem)] lg:max-w-none",
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
          className="fixed inset-0 z-30 bg-text-primary/50 lg:hidden"
          onClick={handleToggleInfoPanel}
        />
      )}

      {/* New Chat Modal */}
      <NewChatModal
        isOpen={isNewChatModalOpen}
        onClose={() => setIsNewChatModalOpen(false)}
        onStartChat={handleStartChat}
        onCreateGroup={handleCreateGroup}
        isSubmitting={isCreatingRoom}
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




