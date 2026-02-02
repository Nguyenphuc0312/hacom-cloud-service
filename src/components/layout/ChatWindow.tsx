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
  User,
} from "../../types";

interface ChatWindowProps {
  conversation: Conversation;
  messages: Message[];
  currentUser: User;
  typingStatus?: TypingStatus;
  onSendMessage: (content: string, replyTo?: Message) => void;
  onToggleInfoPanel: () => void;
  onBack?: () => void;
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
  className,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("normal");
  const [replyToMessage, setReplyToMessage] = useState<Message | undefined>();
  const [editingMessage, setEditingMessage] = useState<Message | undefined>();

  const handleSend = useCallback(() => {
    if (!inputValue.trim()) return;

    onSendMessage(inputValue.trim(), replyToMessage);
    setInputValue("");
    setInputMode("normal");
    setReplyToMessage(undefined);
    setEditingMessage(undefined);
  }, [inputValue, replyToMessage, onSendMessage]);

  const handleReply = useCallback((message: Message) => {
    setInputMode("reply");
    setReplyToMessage(message);
    setEditingMessage(undefined);
  }, []);

  const handleCancelReply = useCallback(() => {
    setInputMode("normal");
    setReplyToMessage(undefined);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setInputMode("normal");
    setEditingMessage(undefined);
    setInputValue("");
  }, []);

  const handleReact = useCallback((messageId: string, emoji: string) => {
    console.log("React to message:", messageId, "with:", emoji);
    // In real app, this would update the message reactions
  }, []);

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
      />
    </div>
  );
};

export default ChatWindow;
