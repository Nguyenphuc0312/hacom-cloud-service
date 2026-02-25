import React from "react";
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
  Attachment,
} from "../../types";
import { MessageType } from "../../types";

interface ChatWindowProps {
  conversation: Conversation;
  messages: Message[];
  currentUser: UserSummary;
  typingStatus?: TypingStatus;
  onSendMessage: (
    content: string,
    replyTo?: Message,
    fileMeta?: Attachment,
    type?: MessageType,
  ) => void | Promise<void>;
  onToggleInfoPanel: () => void;
  onBack?: () => void;
  onTyping?: (isTyping: boolean) => void;
  hasMoreMessages?: boolean;
  isLoadingMessages?: boolean;
  onLoadOlderMessages?: () => void | Promise<void>;
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
  hasMoreMessages,
  isLoadingMessages,
  onLoadOlderMessages,
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

  const handleReact = React.useCallback((messageId: string, emoji: string) => {
    // noop - placeholder for reaction handling
    void messageId;
    void emoji;
  }, []);

  const handleSend = React.useCallback(
    (content?: string, fileMeta?: unknown, type?: string) => {
      // Prevent empty sends
      if (!content && !fileMeta) return;

      const attachment = fileMeta as Attachment | undefined;
      const messageType = type as MessageType | undefined;

      // Reset local input state on send
      setInputValue("");
      setReplyToMessage(undefined);
      setInputMode("normal");

      // Forward to parent ChatPage handler (include fileMeta and type if present)
      void Promise.resolve(
        onSendMessage(
          content || attachment?.fileName || "",
          replyToMessage,
          attachment,
          messageType,
        ),
      );
    },
    [onSendMessage, replyToMessage],
  );
  return (
    <div
      className={clsx(
        "chat-background flex h-full flex-col overflow-hidden",
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
        hasMore={hasMoreMessages}
        isLoadingMore={Boolean(isLoadingMessages && messages.length > 0)}
        isInitialLoading={Boolean(isLoadingMessages && messages.length === 0)}
        onLoadMore={onLoadOlderMessages}
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

