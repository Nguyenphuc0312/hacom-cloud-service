import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ChatHeader } from "../chat/ChatHeader";
import { MessageList } from "../chat/MessageList";
import { SelectionToolbar } from "../chat/SelectionToolbar";
import { DropOverlay } from "../input/DropOverlay";
import { MessageInput } from "../input/MessageInput";
import { SearchPanel } from "../chat/SearchPanel";
import { PinnedMessagesPanel } from "../chat/PinnedMessagesPanel";
import type { MentionCandidate } from "../input/MessageInput";
import { toast } from "../ui";
import { useGroupStore, useUIStore } from "../../stores";
import { useDropZone, useUploadQueue, usePresence } from "../../hooks";
import type {
  Attachment,
  Conversation,
  InputMode,
  Message,
  TypingStatus,
  UserSummary,
} from "../../types";
import { MessageType } from "../../types";
import type { UploadedFileMeta } from "../../types/attachmentDraft";
import { contactApi } from "../../services/api";
import { extractApiError } from "../../lib/apiContract";

// ── Convert upload queue metadata to Attachment ─────────────────────

function metaToAttachment(meta: UploadedFileMeta): Attachment {
  const mime = meta.mimeType || "application/octet-stream";
  let attachmentType: string = "file";
  if (mime.startsWith("image/")) attachmentType = "image";
  else if (mime.startsWith("video/")) attachmentType = "video";
  else if (mime.startsWith("audio/")) attachmentType = "audio";

  return {
    id: meta.fileId,
    objectKey: meta.objectKey ?? "",
    type: attachmentType,
    fileName: meta.name,
    mimeType: mime,
    fileSize: meta.size,
    ...(meta.width != null ? { width: meta.width } : {}),
    ...(meta.height != null ? { height: meta.height } : {}),
    ...(meta.duration != null ? { duration: meta.duration } : {}),
    ...(meta.thumbnailUrl ? { thumbnailUrl: meta.thumbnailUrl } : {}),
  } as Attachment;
}

interface ChatWindowProps {
  conversation: Conversation;
  messages: Message[];
  currentUser: UserSummary;
  typingStatus?: TypingStatus;
  onSendMessage: (
    content: string,
    replyTo?: Message,
    fileMeta?: Attachment | Attachment[],
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
  const slowModeUntil = useGroupStore(
    (state) => state.slowModeUntilByRoom[conversation.id] || 0,
  );
  const clearSlowModeCooldown = useGroupStore((s) => s.clearSlowModeCooldown);

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

  // ── Multi-file upload queue ──
  const uploadQueue = useUploadQueue({ conversationId: conversation.id });

  // ── Presence subscription: subscribe to room members' presence ──
  usePresence({ conversationId: conversation.id });

  // ── Drag-and-drop ──
  const { isDragActive, dropZoneProps, dismiss } = useDropZone({
    onDrop: uploadQueue.addFiles,
    disabled: false,
  });

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

      // ── Build attachments from upload queue + legacy single file ──
      const queueMetas = uploadQueue.getReadyMeta();
      const allAttachments: Attachment[] = [];

      if (queueMetas.length > 0) {
        for (const meta of queueMetas) {
          allAttachments.push(metaToAttachment(meta));
        }
      }
      if (fileMeta) {
        allAttachments.push(fileMeta as Attachment);
      }

      const hasAttachments = allAttachments.length > 0;
      if (!content && !hasAttachments) return;

      const outgoingContent =
        (content || "").trim() ||
        (hasAttachments ? allAttachments[0].fileName : "") ||
        "";
      if (!outgoingContent) return;

      const messageType = hasAttachments
        ? MessageType.FILE
        : (type as MessageType | undefined);
      const attachmentArg: Attachment | Attachment[] | undefined =
        hasAttachments
          ? allAttachments.length === 1
            ? allAttachments[0]
            : allAttachments
          : undefined;

      setInputValue("");
      setReplyToMessage(undefined);
      setEditingMessage(undefined);
      setInputMode("normal");

      await Promise.resolve(
        onSendMessage(
          outgoingContent,
          replyToMessage,
          attachmentArg,
          messageType,
        ),
      );

      // Clear queue after successful send
      if (queueMetas.length > 0) {
        uploadQueue.clearAll();
      }
    },
    [
      editingMessage,
      inputMode,
      onEditMessage,
      onSendMessage,
      replyToMessage,
      uploadQueue,
    ],
  );

  const handleFeatureInDevelopment = React.useCallback(() => {
    toast.info(t("common:toast.featureInDevelopment"));
  }, [t]);

  // Search & pinned panel state
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const [isPinnedOpen, setIsPinnedOpen] = React.useState(false);
  const [clockTick, setClockTick] = React.useState(() => Date.now());

  const slowModeRemainingSeconds = React.useMemo(() => {
    const delta = slowModeUntil - clockTick;
    if (delta <= 0) return 0;
    return Math.ceil(delta / 1000);
  }, [clockTick, slowModeUntil]);

  const isSlowModeBlocked = slowModeRemainingSeconds > 0;

  React.useEffect(() => {
    if (!isSlowModeBlocked) {
      if (slowModeUntil > 0) {
        clearSlowModeCooldown(conversation.id);
      }
      return;
    }

    const timer = window.setInterval(() => {
      setClockTick(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    clearSlowModeCooldown,
    conversation.id,
    isSlowModeBlocked,
    slowModeUntil,
  ]);

  const handleSearchClick = React.useCallback(() => {
    setIsSearchOpen((prev) => !prev);
    setIsPinnedOpen(false);
  }, []);

  const handlePinnedClick = React.useCallback(() => {
    setIsPinnedOpen((prev) => !prev);
    setIsSearchOpen(false);
  }, []);

  const handleSelectSearchMessage = React.useCallback(() => {
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

  const handleShareContact = React.useCallback(
    async (contactUserId: string) => {
      try {
        await contactApi.shareContact({
          conversationId: conversation.id,
          contactUserId,
        });
        toast.success(
          t("chat:contactShare.sent", { defaultValue: "Contact shared" }),
        );
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(
          apiError.message ||
            t("chat:contactShare.failed", {
              defaultValue: "Unable to share contact",
            }),
        );
      }
    },
    [conversation.id, t],
  );

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
      {...dropZoneProps}
    >
      {/* Drag-and-drop overlay */}
      <DropOverlay isActive={isDragActive} onDismiss={dismiss} />
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
          conversationId={conversation.id}
          onSelectMessage={handleSelectSearchMessage}
          onClose={() => setIsSearchOpen(false)}
        />
      )}

      {/* Pinned messages panel overlay */}
      {isPinnedOpen && (
        <PinnedMessagesPanel
          conversationId={conversation.id}
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
            value={inputValue}
            onChange={handleInputChange}
            onSend={handleSend}
            mode={inputMode}
            conversationId={conversation.id}
            currentUserId={currentUser.id}
            mentionCandidates={mentionCandidates}
            replyToMessage={replyToMessage}
            editingMessage={editingMessage}
            onCancelReply={handleCancelReply}
            onCancelEdit={handleCancelEdit}
            onTyping={onTyping}
            sendOnEnter
            disabled={isSlowModeBlocked}
            disabledReason={
              isSlowModeBlocked
                ? t("chat:slowMode.active", {
                    defaultValue: "Slow mode active. Try again in {{seconds}}s.",
                    seconds: slowModeRemainingSeconds,
                  })
                : undefined
            }
            onShareContact={handleShareContact}
            uploadDrafts={uploadQueue.drafts}
            onAddFiles={uploadQueue.addFiles}
            onRemoveDraft={uploadQueue.removeDraft}
            onCancelUpload={uploadQueue.cancelUpload}
            onRetryUpload={uploadQueue.retryUpload}
            onClearAllDrafts={uploadQueue.clearAll}
            hasUploadingDrafts={uploadQueue.hasUploadingDrafts}
            hasFailedDrafts={uploadQueue.hasFailedDrafts}
            hasReadyDrafts={uploadQueue.hasReadyDrafts}
          />
        </div>
      )}
    </section>
  );
};

export default ChatWindow;
