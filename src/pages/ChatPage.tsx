import React, { useState, useCallback } from "react";
import clsx from "clsx";
import { Sidebar } from "../components/layout/Sidebar";
import { ChatWindow } from "../components/layout/ChatWindow";
import { UserProfile } from "../components/info/UserProfile";
import { GroupInfo } from "../components/info/GroupInfo";
import {
  conversations as initialConversations,
  messages as initialMessages,
  currentUser,
  typingStatuses,
} from "../data/mockData";
import type { Message } from "../types";
import { getOtherParticipant } from "../utils/messageHelpers";

export const ChatPage: React.FC = () => {
  const [conversations, setConversations] = useState(initialConversations);
  const [messages, setMessages] = useState(initialMessages);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >("conv-1");
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const selectedConversation = conversations.find(
    (c) => c.id === selectedConversationId,
  );
  const conversationMessages = selectedConversationId
    ? messages[selectedConversationId] || []
    : [];
  const typingStatus = typingStatuses.find(
    (t) => t.conversationId === selectedConversationId,
  );

  const handleSelectConversation = useCallback((id: string) => {
    setSelectedConversationId(id);
    setIsMobileMenuOpen(false);

    // Mark as read
    setConversations((prev) =>
      prev.map((conv) => (conv.id === id ? { ...conv, unreadCount: 0 } : conv)),
    );
  }, []);

  const handleSendMessage = useCallback(
    (content: string, replyTo?: Message) => {
      if (!selectedConversationId) return;

      const newMessage: Message = {
        id: `msg-${Date.now()}`,
        conversationId: selectedConversationId,
        senderId: currentUser.id,
        senderName: `${currentUser.firstName} ${currentUser.lastName || ""}`,
        senderAvatar: currentUser.avatar,
        content,
        type: "text",
        status: "sending",
        isEdited: false,
        isPinned: false,
        createdAt: new Date(),
        replyTo,
      };

      // Add message
      setMessages((prev) => ({
        ...prev,
        [selectedConversationId]: [
          ...(prev[selectedConversationId] || []),
          newMessage,
        ],
      }));

      // Update conversation
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === selectedConversationId
            ? { ...conv, lastMessage: newMessage, updatedAt: new Date() }
            : conv,
        ),
      );

      // Simulate message status updates
      setTimeout(() => {
        setMessages((prev) => ({
          ...prev,
          [selectedConversationId]:
            prev[selectedConversationId]?.map((msg) =>
              msg.id === newMessage.id
                ? { ...msg, status: "sent" as const }
                : msg,
            ) || [],
        }));
      }, 500);

      setTimeout(() => {
        setMessages((prev) => ({
          ...prev,
          [selectedConversationId]:
            prev[selectedConversationId]?.map((msg) =>
              msg.id === newMessage.id
                ? { ...msg, status: "delivered" as const }
                : msg,
            ) || [],
        }));
      }, 1000);

      setTimeout(() => {
        setMessages((prev) => ({
          ...prev,
          [selectedConversationId]:
            prev[selectedConversationId]?.map((msg) =>
              msg.id === newMessage.id
                ? { ...msg, status: "read" as const }
                : msg,
            ) || [],
        }));
      }, 2000);
    },
    [selectedConversationId],
  );

  const handleToggleInfoPanel = useCallback(() => {
    setIsInfoPanelOpen((prev) => !prev);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedConversationId(null);
    setIsMobileMenuOpen(true);
  }, []);

  const otherUser =
    selectedConversation?.type === "private"
      ? getOtherParticipant(selectedConversation, currentUser.id)
      : null;

  return (
    <div className="flex h-screen bg-white overflow-hidden">
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
          currentUser={currentUser}
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
            currentUser={currentUser}
            typingStatus={typingStatus}
            onSendMessage={handleSendMessage}
            onToggleInfoPanel={handleToggleInfoPanel}
            onBack={handleBack}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-chat-background text-gray-500">
            <svg
              className="w-24 h-24 mb-4 text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <h2 className="text-xl font-medium">
              Chọn một cuộc trò chuyện để bắt đầu
            </h2>
            <p className="mt-2 text-sm">
              Chọn một cuộc hội thoại từ danh sách hoặc bắt đầu cuộc trò chuyện
              mới
            </p>
          </div>
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
          {selectedConversation.type === "private" && otherUser ? (
            <UserProfile user={otherUser} onClose={handleToggleInfoPanel} />
          ) : (
            <GroupInfo
              conversation={selectedConversation}
              currentUserId={currentUser.id}
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
    </div>
  );
};

export default ChatPage;
