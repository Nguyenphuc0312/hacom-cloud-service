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
import { ConversationLane } from "./ConversationLane";
import type { MentionCandidate } from "../input/MessageInput";
import { toast } from "../ui";
import { useChatStore, useGroupStore, useUIStore } from "../../stores";
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
import type { ConnectionState } from "../../hooks/useWebSocket";
import { resolveChatDensity } from "../../utils/densityPolicy";
import { resolveOverlayPlacements } from "../../utils/overlayResolver";

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
  onReachedLatestMessage?: (message: Message) => void;
  connectionState?: ConnectionState;
  className?: string;
}

type EphemeralNotice = {
  kind: "info" | "warn" | "error" | "success";
  message: string;
};

const getEphemeralNoticeClassName = (
  kind: EphemeralNotice["kind"],
): string => {
  switch (kind) {
    case "warn":
      return "border-warning/25 bg-warning/12 text-warning";
    case "error":
      return "border-danger/25 bg-danger/10 text-danger";
    case "success":
      return "border-success/20 bg-success/12 text-success";
    case "info":
    default:
      return "border-primary/18 bg-surface/94 text-text-secondary";
  }
};

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
  onReachedLatestMessage,
  connectionState = "connected",
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
  const addMessage = useChatStore((s) => s.addMessage);
  const fetchMessages = useChatStore((s) => s.fetchMessages);

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
  const [overlayMode, setOverlayMode] = React.useState<"search" | "pinned" | null>(null);
  const [jumpTargetMessage, setJumpTargetMessage] = React.useState<Message | null>(null);
  const [jumpRequestVersion, setJumpRequestVersion] = React.useState(0);
  const [unreadMarker, setUnreadMarker] = React.useState<{
    lastReadMessageId?: string;
    lastReadAt?: Date | string;
    active?: boolean;
  } | null>(null);
  const [clockTick, setClockTick] = React.useState(() => Date.now());
  const [ephemeralNotice, setEphemeralNotice] =
    React.useState<EphemeralNotice | null>(null);
  const [viewportMetrics, setViewportMetrics] = React.useState(() => ({
    width:
      typeof window !== "undefined" ? window.innerWidth : 1280,
    height:
      typeof window !== "undefined" ? window.innerHeight : 900,
  }));
  const previousConnectionStateRef = React.useRef<ConnectionState>(connectionState);
  const ephemeralNoticeTimerRef = React.useRef<number | null>(null);

  const resolvedDensity = React.useMemo(
    () =>
      resolveChatDensity({
        preference: chatDensity,
        viewportWidth: viewportMetrics.width,
        viewportHeight: viewportMetrics.height,
        messages,
        conversationType: conversation.type,
      }),
    [
      chatDensity,
      conversation.type,
      messages,
      viewportMetrics.height,
      viewportMetrics.width,
    ],
  );

  const bottomOverlayPlacements = React.useMemo(
    () =>
      resolveOverlayPlacements([
        {
          id: "selection-toolbar",
          visible: isMessageSelectionMode,
          priority: 120,
          slot: "bottom-center",
        },
        {
          id: "ephemeral-notice",
          visible: Boolean(ephemeralNotice) && !isMessageSelectionMode,
          priority: 60,
          slot: "bottom-center",
        },
      ]),
    [ephemeralNotice, isMessageSelectionMode],
  );

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
    setOverlayMode((prev) => (prev === "search" ? null : "search"));
  }, []);

  const handlePinnedClick = React.useCallback(() => {
    setOverlayMode((prev) => (prev === "pinned" ? null : "pinned"));
  }, []);

  const handleJumpHandled = React.useCallback((messageId: string) => {
    setJumpTargetMessage((current) =>
      current && current.id === messageId ? null : current,
    );
  }, []);

  const handleReachedLatest = React.useCallback(
    (message: Message) => {
      setUnreadMarker((current) => (current?.active ? null : current));
      onReachedLatestMessage?.(message);
    },
    [onReachedLatestMessage],
  );

  const handleJumpToMessage = React.useCallback(
    async (message: Message) => {
      const inCache = messages.some(
        (candidate) =>
          candidate.id === message.id ||
          candidate.localId === message.id ||
          candidate.stableId === message.id,
      );

      if (!inCache) {
        addMessage(conversation.id, message);
        const cursor = new Date(message.createdAt).toISOString();
        await Promise.allSettled([
          fetchMessages(conversation.id, cursor, undefined, {
            beforeId: message.id,
            limit: 24,
          }),
          fetchMessages(conversation.id, undefined, cursor, {
            afterId: message.id,
            limit: 24,
          }),
        ]);
      }

      setOverlayMode(null);
      setJumpTargetMessage(message);
      setJumpRequestVersion((value) => value + 1);
    },
    [addMessage, conversation.id, fetchMessages, messages],
  );

  // Close panels when switching conversations
  React.useEffect(() => {
    setOverlayMode(null);
    const snapshot = conversation as Conversation & {
      lastReadMessageId?: string;
      lastReadAt?: Date | string;
    };
    if (
      (conversation.unreadCount ?? 0) > 0 &&
      (snapshot.lastReadMessageId || snapshot.lastReadAt)
    ) {
      setUnreadMarker({
        lastReadMessageId: snapshot.lastReadMessageId,
        lastReadAt: snapshot.lastReadAt,
        active: true,
      });
    } else {
      setUnreadMarker(null);
    }
  }, [conversation.id]);

  React.useEffect(() => {
    const previousState = previousConnectionStateRef.current;

    if (ephemeralNoticeTimerRef.current !== null) {
      window.clearTimeout(ephemeralNoticeTimerRef.current);
      ephemeralNoticeTimerRef.current = null;
    }

    if (connectionState === "reconnecting") {
      setEphemeralNotice({
        kind: "warn",
        message: t("chat:toast.connectionReconnecting"),
      });
    } else if (connectionState === "disconnected") {
      setEphemeralNotice({
        kind: "error",
        message: t("chat:toast.connectionOffline", {
          defaultValue: "Mat ket noi. Dang cho dong bo lai.",
        }),
      });
    } else if (
      connectionState === "connected" &&
      (previousState === "reconnecting" || previousState === "disconnected")
    ) {
      setEphemeralNotice({
        kind: "success",
        message: t("chat:toast.connectionRestored", {
          defaultValue: "Da ket noi lai",
        }),
      });
      ephemeralNoticeTimerRef.current = window.setTimeout(() => {
        setEphemeralNotice((current) =>
          current?.kind === "success" ? null : current,
        );
        ephemeralNoticeTimerRef.current = null;
      }, 2400);
    } else if (connectionState === "connected") {
      setEphemeralNotice(null);
    }

    previousConnectionStateRef.current = connectionState;
  }, [connectionState, t]);

  React.useEffect(
    () => () => {
      if (ephemeralNoticeTimerRef.current !== null) {
        window.clearTimeout(ephemeralNoticeTimerRef.current);
      }
    },
    [],
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      setViewportMetrics({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

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
        density={resolvedDensity}
        isSelectionMode={isMessageSelectionMode}
        selectedMessageIds={selectedMessageIds}
        onToggleSelect={toggleMessageSelection}
        currentUsername={currentUsername}
        unreadMarker={unreadMarker}
        onReachedLatest={handleReachedLatest}
        jumpToMessageId={jumpTargetMessage?.id ?? null}
        jumpRequestVersion={jumpRequestVersion}
        onJumpHandled={handleJumpHandled}
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
      resolvedDensity,
      handleJumpHandled,
      handleReachedLatest,
      isMessageSelectionMode,
      jumpRequestVersion,
      jumpTargetMessage?.id,
      selectedMessageIds,
      toggleMessageSelection,
      currentUsername,
      unreadMarker,
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

      {overlayMode && (
        <div className="pointer-events-none absolute inset-0 z-[45]">
          <button
            type="button"
            className="pointer-events-auto absolute inset-0 bg-text-primary/18 backdrop-blur-[1px]"
            onClick={() => setOverlayMode(null)}
            aria-label={t("common:actions.close")}
          />
          <div className="pointer-events-auto absolute inset-y-0 right-0 w-full max-w-[min(24rem,100%)] border-l border-border bg-surface shadow-elev3 animate-slide-up-fade">
            {overlayMode === "search" ? (
              <SearchPanel
                conversationId={conversation.id}
                onSelectMessage={handleJumpToMessage}
                onClose={() => setOverlayMode(null)}
                className="h-full"
              />
            ) : (
              <PinnedMessagesPanel
                conversationId={conversation.id}
                onClose={() => setOverlayMode(null)}
                onJumpToMessage={handleJumpToMessage}
                className="h-full"
              />
            )}
          </div>
        </div>
      )}

      {messageListNode}

      {ephemeralNotice &&
        bottomOverlayPlacements["ephemeral-notice"]?.visible && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[55]">
            <ConversationLane>
              <div className="flex justify-center">
                <div
                  className={clsx(
                    "pointer-events-auto max-w-[min(28rem,100%)] rounded-full border px-3.5 py-1.5 text-xs font-medium shadow-elev2 backdrop-blur animate-slide-up-fade",
                    getEphemeralNoticeClassName(ephemeralNotice.kind),
                  )}
                  role="status"
                  aria-live="polite"
                >
                  {ephemeralNotice.message}
                </div>
              </div>
            </ConversationLane>
          </div>
        )}

      {/* Selection toolbar */}
      {isMessageSelectionMode &&
        bottomOverlayPlacements["selection-toolbar"]?.visible && (
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
