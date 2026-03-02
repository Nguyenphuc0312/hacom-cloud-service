import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ChatHeader } from "../chat/ChatHeader";
import { MessageList } from "../chat/MessageList";
import { SelectionToolbar } from "../chat/SelectionToolbar";
import { DropZoneOverlay } from "../chat/DropZoneOverlay";
import { MessageInput } from "../input/MessageInput";
import { SearchPanel } from "../chat/SearchPanel";
import { PinnedMessagesPanel } from "../chat/PinnedMessagesPanel";
import type {
  MentionCandidate,
  MessageInputHandle,
} from "../input/MessageInput";
import { toast } from "../ui";
import { useUIStore } from "../../stores";
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
  onFilePreview?: (attachment: Attachment) => void;
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
  onFilePreview,
  messageError,
  onRetryMessages,
  className,
}) => {
  const { t } = useTranslation();
  const chatDensity = useUIStore((s) => s.chatDensity);
  const isMessageSelectionMode = useUIStore((s) => s.isMessageSelectionMode);
  const selectedMessageIds = useUIStore((s) => s.selectedMessageIds);
  const enterSelectionMode = useUIStore((s) => s.enterSelectionMode);
  const exitSelectionMode = useUIStore((s) => s.exitSelectionMode);
  const toggleMessageSelection = useUIStore((s) => s.toggleMessageSelection);

  const [inputValue, setInputValue] = React.useState("");
  const [inputMode, setInputMode] = React.useState<InputMode>("normal");
  const [replyToMessage, setReplyToMessage] = React.useState<
    Message | undefined
  >(undefined);
  const [editingMessage, setEditingMessage] = React.useState<
    Message | undefined
  >(undefined);

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

  const handleReact = React.useCallback(
    (messageId: string, emoji: string) => {
      if (!onReactMessage) return;
      void Promise.resolve(onReactMessage(messageId, emoji));
    },
    [onReactMessage],
  );

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
        if (
          !nextContent ||
          nextContent === (editingMessage.content || "").trim()
        ) {
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

  // Search & pinned panel state
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const [isPinnedOpen, setIsPinnedOpen] = React.useState(false);

  const handleSearchClick = React.useCallback(() => {
    setIsSearchOpen((prev) => !prev);
    setIsPinnedOpen(false);
  }, []);

  const handlePinnedClick = React.useCallback(() => {
    setIsPinnedOpen((prev) => !prev);
    setIsSearchOpen(false);
  }, []);

  // Close panels when switching conversations
  React.useEffect(() => {
    setIsSearchOpen(false);
    setIsPinnedOpen(false);
  }, [conversation.id]);

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

  // Exit selection on conversation change
  React.useEffect(() => {
    exitSelectionMode();
  }, [conversation.id, exitSelectionMode]);

  const handleSelectionDelete = React.useCallback(() => {
    if (!onDeleteMessage) return;
    for (const id of selectedMessageIds) {
      void Promise.resolve(onDeleteMessage(id));
    }
    exitSelectionMode();
  }, [onDeleteMessage, selectedMessageIds, exitSelectionMode]);

  const handleSelectionCopy = React.useCallback(() => {
    const selectedMsgs = messages
      .filter((m) => selectedMessageIds.has(m.id))
      .map((m) => m.content)
      .join("\n");
    void navigator.clipboard.writeText(selectedMsgs);
    toast.success(t("chat:message.actions.copy", { defaultValue: "Copied" }));
    exitSelectionMode();
  }, [messages, selectedMessageIds, exitSelectionMode, t]);

  const handleSelectionForward = React.useCallback(() => {
    toast.info(
      t("common:toast.featureInDevelopment", { defaultValue: "Coming soon" }),
    );
    exitSelectionMode();
  }, [exitSelectionMode, t]);

  const currentUsername = currentUser.username;

  // ── Drag-and-drop file upload ──
  const [isDragActive, setIsDragActive] = React.useState(false);
  const dragCounter = React.useRef(0);
  const messageInputRef = React.useRef<MessageInputHandle>(null);

  const handleDragEnter = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragActive(true);
    }
  }, []);

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragActive(false);
    }
  }, []);

  const handleDrop = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Forward the first file to MessageInput via imperative handle
    const file = files[0];
    if (messageInputRef.current) {
      messageInputRef.current.addFile(file);
    }
  }, []);

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
        onFilePreview={onFilePreview}
        error={messageError}
        onRetry={onRetryMessages}
        density={chatDensity}
        isSelectionMode={isMessageSelectionMode}
        selectedMessageIds={selectedMessageIds}
        onToggleSelect={toggleMessageSelection}
        currentUsername={currentUsername}
        className="flex-1 min-h-0"
      />
    ),
    [
      conversation,
      currentUser.id,
      handleReact,
      handleReply,
      handleDelete,
      hasMoreMessages,
      isLoadingMessages,
      messageError,
      messages,
      onImageClick,
      onFilePreview,
      onLoadOlderMessages,
      onRetryMessages,
      chatDensity,
      isMessageSelectionMode,
      selectedMessageIds,
      toggleMessageSelection,
      currentUsername,
    ],
  );

  return (
    <section
      key={conversation.id}
      className={clsx(
        "chat-background relative flex h-full min-h-0 flex-col overflow-hidden animate-content-fade",
        className,
      )}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag-and-drop overlay */}
      <DropZoneOverlay isActive={isDragActive} />
      <ChatHeader
        conversation={conversation}
        currentUserId={currentUser.id}
        typingStatus={typingStatus}
        onBack={onBack}
        onInfoClick={onToggleInfoPanel}
        onCallClick={handleFeatureInDevelopment}
        onVideoCallClick={handleFeatureInDevelopment}
        onSearchClick={handleSearchClick}
        onPinnedClick={handlePinnedClick}
        onSelectionMode={enterSelectionMode}
      />

      {/* Search panel overlay */}
      {isSearchOpen && (
        <SearchPanel
          roomId={conversation.id}
          onClose={() => setIsSearchOpen(false)}
        />
      )}

      {/* Pinned messages panel overlay */}
      {isPinnedOpen && (
        <PinnedMessagesPanel
          roomId={conversation.id}
          onClose={() => setIsPinnedOpen(false)}
        />
      )}

      {messageListNode}

      {/* Selection toolbar */}
      {isMessageSelectionMode && (
        <SelectionToolbar
          selectedCount={selectedMessageIds.size}
          onDelete={handleSelectionDelete}
          onForward={handleSelectionForward}
          onCopy={handleSelectionCopy}
          onCancel={exitSelectionMode}
        />
      )}

      {/* Message input - hidden during selection mode */}
      {!isMessageSelectionMode && (
        <div className="sticky bottom-0 z-sticky">
          <MessageInput
            ref={messageInputRef}
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
      )}
    </section>
  );
};

export default ChatWindow;
