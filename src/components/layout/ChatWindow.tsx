import React, { useState, useCallback } from "react";
import clsx from "clsx";
import { ChatHeader } from "../chat/ChatHeader";
import { MessageList } from "../chat/MessageList";
import { MessageInput } from "../input/MessageInput";
import type {
  Conversation,
  Message,
  TypingStatus,
  InputMode,
  UserSummary,
} from "../../types";

interface ChatWindowProps {
  conversation: Conversation;
  messages: Message[];
  currentUser: UserSummary;
  typingStatus?: TypingStatus;
  onSendMessage: (content: string, replyTo?: Message) => void;
  onToggleInfoPanel: () => void;
  onBack?: () => void;
  onTyping?: (isTyping: boolean) => void;
  onImageClick?: (imageUrl: string) => void;
  className?: string;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  conversation,
  messages,
  currentUser,
  typingStatus,
  onSendMessage,
  onToggleInfoPanel,
  onBack,
  onTyping,
  onImageClick,
  className,
}) => {
  // ...existing state and handlers...
  // (Bạn cần đảm bảo các state như inputValue, inputMode, replyToMessage, editingMessage, handleReply, handleSend, handleCancelReply, handleCancelEdit, handleReact, ... được khai báo đúng ở trên)
  return (
    <div
      className={clsx(
        "flex flex-col h-full bg-chat-background overflow-hidden",
        className,
      )}
    >
      {/* Header */}
      <ChatHeader
        conversation={conversation}
        currentUserId={currentUser.id}
        typingStatus={typingStatus}
        onBack={onBack}
        onInfoClick={onToggleInfoPanel}
        onCallClick={() => console.log("Voice call")}
        onVideoCallClick={() => console.log("Video call")}
        onSearchClick={() => console.log("Search in chat")}
      />

      {/* Messages */}
      <MessageList
        messages={messages}
        conversation={conversation}
        currentUserId={currentUser.id}
        onReply={handleReply}
        onReact={handleReact}
        onImageClick={onImageClick}
        className="flex-1 min-h-0"
      />

      {/* Input */}
      <MessageInput
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSend}
        mode={inputMode}
        replyToMessage={replyToMessage}
        editingMessage={editingMessage}
        onCancelReply={handleCancelReply}
        onCancelEdit={handleCancelEdit}
        onTyping={onTyping}
      />
    </div>
  );
};

export default ChatWindow;
