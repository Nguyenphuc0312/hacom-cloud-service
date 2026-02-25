import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ChatHeader } from "../chat/ChatHeader";
import { MessageList } from "../chat/MessageList";
import { MessageInput } from "../input/MessageInput";
import type { MentionCandidate } from "../input/MessageInput";
import { toast } from "../ui";
import type {
  Attachment,
  Conversation,
  InputMode,
  Message,
  TypingStatus,
  UserSummary,
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
  onReactMessage?: (messageId: string, emoji: string) => void | Promise<void>;
  onEditMessage?: (messageId: string, content: string) => void | Promise<void>;
  onDeleteMessage?: (messageId: string) => void | Promise<void>;
  onToggleInfoPanel: () => void;
  onBack?: () => void;
  onTyping?: (isTyping: boolean) => void;
  hasMoreMessages?: boolean;
  isLoadingMessages?: boolean;
  onLoadOlderMessages?: () => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
  messageError?: string | null;
  onRetryMessages?: () => void | Promise<void>;
  className?: string;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  conversation,
  messages,
  currentUser,
  typingStatus,
  onSendMessage,
  onReactMessage,
  onEditMessage,
  onDeleteMessage,
  onToggleInfoPanel,
  onBack,
  onTyping,
  hasMoreMessages,
  isLoadingMessages,
  onLoadOlderMessages,
  onImageClick,
  messageError,
  onRetryMessages,
  className,
}) => {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = React.useState("");
  const [inputMode, setInputMode] = React.useState<InputMode>("normal");
  const [replyToMessage, setReplyToMessage] = React.useState<Message | undefined>(
    undefined,
  );
  const [editingMessage, setEditingMessage] = React.useState<Message | undefined>(
    undefined,
  );

  const handleReply = React.useCallback((message: Message) => {
    setReplyToMessage(message);
    setEditingMessage(undefined);
    setInputMode("reply");
  }, []);

  const handleCancelReply = React.useCallback(() => {
    setReplyToMessage(undefined);
    if (!editingMessage) {
      setInputMode("normal");
    }
  }, [editingMessage]);

  const handleCancelEdit = React.useCallback(() => {
    setEditingMessage(undefined);
    if (!replyToMessage) {
      setInputMode("normal");
    }
  }, [replyToMessage]);

  const handleInputChange = React.useCallback((nextValue: string) => {
    setInputValue(nextValue);
  }, []);

  const handleReact = React.useCallback((messageId: string, emoji: string) => {
    if (!onReactMessage) return;
    void Promise.resolve(onReactMessage(messageId, emoji));
  }, [onReactMessage]);

  const handleEdit = React.useCallback((message: Message) => {
    setReplyToMessage(undefined);
    setEditingMessage(message);
    setInputValue(message.content || "");
    setInputMode("edit");
  }, []);

  const handleDelete = React.useCallback(
    (messageId: string) => {
      if (!onDeleteMessage) return;
      void Promise.resolve(onDeleteMessage(messageId));
    },
    [onDeleteMessage],
  );

  const handleSend = React.useCallback(
    async (content?: string, fileMeta?: unknown, type?: string) => {
      if (inputMode === "edit" && editingMessage && onEditMessage) {
        const nextContent = (content || "").trim();
        if (!nextContent || nextContent === (editingMessage.content || "").trim()) {
          setEditingMessage(undefined);
          setInputMode(replyToMessage ? "reply" : "normal");
          return;
        }

        await Promise.resolve(onEditMessage(editingMessage.id, nextContent));
        setInputValue("");
        setReplyToMessage(undefined);
        setEditingMessage(undefined);
        setInputMode("normal");
        return;
      }

      if (!content && !fileMeta) return;

      const attachment = fileMeta as Attachment | undefined;
      const messageType = type as MessageType | undefined;

      const outgoingContent = content || attachment?.fileName || "";
      if (!outgoingContent) return;

      setInputValue("");
      setReplyToMessage(undefined);
      setEditingMessage(undefined);
      setInputMode("normal");

      await Promise.resolve(
        onSendMessage(outgoingContent, replyToMessage, attachment, messageType),
      );
    },
    [editingMessage, inputMode, onEditMessage, onSendMessage, replyToMessage],
  );

  const handleFeatureInDevelopment = React.useCallback(() => {
    toast.info(t("common:toast.featureInDevelopment"));
  }, [t]);

  const mentionCandidates = React.useMemo<MentionCandidate[]>(() => {
    const participants = Array.isArray(conversation.participants)
      ? conversation.participants
      : [];

    return participants
      .filter((participant) => participant.id !== currentUser.id)
      .map((participant) => ({
        id: participant.id,
        username:
          participant.username?.trim() ||
          participant.displayName?.trim() ||
          participant.id,
        displayName: participant.displayName?.trim() || undefined,
      }));
  }, [conversation.participants, currentUser.id]);

  const messageListNode = React.useMemo(
    () => (
      <MessageList
        messages={messages}
        conversation={conversation}
        currentUserId={currentUser.id}
        onReply={handleReply}
        onReact={handleReact}
        onEdit={handleEdit}
        onDelete={handleDelete}
        hasMore={hasMoreMessages}
        isLoadingMore={Boolean(isLoadingMessages && messages.length > 0)}
        isInitialLoading={Boolean(isLoadingMessages && messages.length === 0)}
        onLoadMore={onLoadOlderMessages}
        onImageClick={onImageClick}
        error={messageError}
        onRetry={onRetryMessages}
        className="flex-1 min-h-0"
      />
    ),
    [
      conversation,
      currentUser.id,
      handleReact,
      handleReply,
      hasMoreMessages,
      isLoadingMessages,
      messageError,
      messages,
      onImageClick,
      onLoadOlderMessages,
      onRetryMessages,
    ],
  );

  return (
    <section
      className={clsx(
        "chat-background flex h-full min-h-0 flex-col overflow-hidden",
        className,
      )}
    >
      <ChatHeader
        conversation={conversation}
        currentUserId={currentUser.id}
        typingStatus={typingStatus}
        onBack={onBack}
        onInfoClick={onToggleInfoPanel}
        onCallClick={handleFeatureInDevelopment}
        onVideoCallClick={handleFeatureInDevelopment}
        onSearchClick={handleFeatureInDevelopment}
      />

      {messageListNode}

      <div className="sticky bottom-0 z-sticky">
        <MessageInput
          value={inputValue}
          onChange={handleInputChange}
          onSend={handleSend}
          mode={inputMode}
          conversationId={conversation.id}
          mentionCandidates={mentionCandidates}
          replyToMessage={replyToMessage}
          editingMessage={editingMessage}
          onCancelReply={handleCancelReply}
          onCancelEdit={handleCancelEdit}
          onTyping={onTyping}
          sendOnEnter
        />
      </div>
    </section>
  );
};

export default ChatWindow;
