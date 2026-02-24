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
  // Local input state and handlers (wire input -> parent send)
  const [inputValue, setInputValue] = React.useState<string>("");
  const [inputMode, setInputMode] = React.useState<InputMode>("normal");
  const [replyToMessage, setReplyToMessage] = React.useState<
    Message | undefined
  >(undefined);
  const [editingMessage, setEditingMessage] = React.useState<
    Message | undefined
  >(undefined);

  const handleReply = React.useCallback((msg: Message) => {
    setReplyToMessage(msg);
    setInputMode("reply");
  }, []);

  const handleCancelReply = React.useCallback(() => {
    setReplyToMessage(undefined);
    setInputMode("normal");
  }, []);

  const handleCancelEdit = React.useCallback(() => {
    setEditingMessage(undefined);
    setInputMode("normal");
  }, []);

  const handleReact = React.useCallback((_msg: Message, _emoji: string) => {
    // noop - placeholder for reaction handling
  }, []);

  const handleSend = React.useCallback(
    (content?: string, fileMeta?: unknown, type?: string) => {
      // Prevent empty sends
      if (!content && !fileMeta) return;

      // Forward to parent ChatPage handler (include fileMeta and type if present)
      onSendMessage(
        content || (fileMeta && (fileMeta as any).fileName) || "",
        replyToMessage,
        fileMeta as any,
        (type as any) || undefined,
      );

      // Reset local input state on send
      setInputValue("");
      setReplyToMessage(undefined);
      setInputMode("normal");
    },
    [onSendMessage, replyToMessage],
  );
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
