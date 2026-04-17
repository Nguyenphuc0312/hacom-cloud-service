import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ChatHeader } from "../chat/ChatHeader";
import { MessageList } from "../chat/MessageList";
import { SelectionToolbar } from "../chat/SelectionToolbar";
import { DropOverlay } from "../input/DropOverlay";
import { MessageInput } from "../input/MessageInput";
import { ConversationLane } from "./ConversationLane";
import type { MentionCandidate } from "../input/MessageInput";
import { Spinner, toast } from "../ui";
import { useChatStore, useGroupStore, useUIStore } from "../../stores";
import {
  useComposerAvailability,
  useDropZone,
  useUploadQueue,
  usePresence,
} from "../../hooks";
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
import { extractApiError, unwrapApiSuccess } from "../../lib/apiContract";
import type { ConnectionState } from "../../hooks/useWebSocket";
import {
  resolveChatDensity,
  resolveChatLayoutProfile,
} from "../../utils/densityPolicy";
import { resolveOverlayPlacements } from "../../utils/overlayResolver";
import { logMessageDebug } from "../../utils/messageDebug";
import { logScrollTrace } from "../../utils/scrollTrace";
import { resolveUserDisplayName } from "../../features/chat/identity/resolveUserDisplayName";
import { getMessageByIdUseCase } from "../../features/chat/usecases/getMessageById";
import { shareContactUseCase } from "../../features/chat/usecases/shareContact";
import type { ChatLayoutState } from "../../utils/densityPolicy";

const SearchPanel = React.lazy(() => import("../chat/SearchPanel"));
const PinnedMessagesPanel = React.lazy(
  () => import("../chat/PinnedMessagesPanel"),
);

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

const matchesMessageIdentity = (message: Message, targetId: string): boolean =>
  message.id === targetId ||
  message.localId === targetId ||
  message.stableId === targetId ||
  message.clientMessageId === targetId;

const buildUnreadRestoreSignature = ({
  conversationId,
  firstUnreadMessageId,
  lastReadMessageId,
  lastReadAt,
}: {
  conversationId: string;
  firstUnreadMessageId?: string | null;
  lastReadMessageId?: string | null;
  lastReadAt?: string | Date | null;
}): string => {
  const lastReadAtIso =
    typeof lastReadAt === "string"
      ? lastReadAt
      : lastReadAt instanceof Date
        ? lastReadAt.toISOString()
        : "";

  return [
    conversationId,
    firstUnreadMessageId ?? "",
    lastReadMessageId ?? "",
    lastReadAtIso,
  ].join("|");
};

interface ChatWindowProps {
  layoutState: ChatLayoutState;
  conversation: Conversation;
  messages: Message[];
  currentUser: UserSummary;
  typingStatus?: TypingStatus;
  onSendMessage: (
    content: string,
    replyTo?: Message,
    fileMeta?: Attachment | Attachment[],
    type?: MessageType,
  ) => unknown | Promise<unknown>;
  onReactMessage?: (messageId: string, emoji: string) => void | Promise<void>;
  onEditMessage?: (messageId: string, content: string) => void | Promise<void>;
  onDeleteMessage?: (messageId: string) => void | Promise<void>;
  onToggleInfoPanel: () => void;
  onBack?: () => void;
  onTyping?: (isTyping: boolean) => void;
  hasMoreMessages?: boolean;
  isLoadingMessages?: boolean;
  historyLoadingState?: {
    stage:
      | "empty"
      | "partial_unread_bootstrap"
      | "partial_prefetch"
      | "authoritative_initial_window"
      | "paginating_older"
      | "live_realtime";
    isPartial: boolean;
  } | null;
  onLoadOlderMessages?: () => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
  onFilePreview?: (attachment: Attachment) => void;
  messageError?: string | null;
  onRetryMessages?: () => void | Promise<void>;
  onReachedLatestMessage?: (message: Message) => void;
  connectionState?: ConnectionState;
  isConversationReady?: boolean;
  externalJumpToMessageId?: string | null;
  externalJumpRequestVersion?: number;
  onExternalJumpHandled?: (messageId: string) => void;
  className?: string;
}

interface ChatTimelinePaneProps {
  layoutState: ChatLayoutState;
  messages: Message[];
  conversationId: string;
  conversationType: Conversation["type"];
  currentUserId: string;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (messageId: string) => void | Promise<void>;
  hasMoreMessages?: boolean;
  isLoadingMessages?: boolean;
  historyLoadingState?: ChatWindowProps["historyLoadingState"];
  isConversationReady?: boolean;
  onLoadOlderMessages?: () => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
  onFilePreview?: (attachment: Attachment) => void;
  messageError?: string | null;
  onRetryMessages?: () => void | Promise<void>;
  density: ReturnType<typeof resolveChatDensity>;
  isSelectionMode: boolean;
  selectedMessageIds: Set<string>;
  onToggleSelect: (messageId: string) => void;
  onNavigateToMessage?: (messageId: string) => void;
  currentUsername?: string;
  unreadMarker?: {
    lastReadMessageId?: string;
    lastReadAt?: Date | string;
    firstUnreadMessageId?: string;
    active?: boolean;
  } | null;
  unreadRestoreSignature?: string | null;
  onUnreadRestoreConsumed?: (signature: string) => void;
  onReachedLatest?: (message: Message) => void;
  jumpToMessageId?: string | null;
  jumpRequestVersion?: number;
  onJumpHandled?: (messageId: string) => void;
  composerHeight?: number;
}

type EphemeralNotice = {
  kind: "info" | "warn" | "error" | "success";
  message: string;
};

const getEphemeralNoticeClassName = (kind: EphemeralNotice["kind"]): string => {
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

const ChatTimelinePane = React.memo(
  ({
    layoutState,
    messages,
    conversationId,
    conversationType,
    currentUserId,
    onReply,
    onReact,
    onEdit,
    onDelete,
    hasMoreMessages,
    isLoadingMessages,
    historyLoadingState,
    isConversationReady,
    onLoadOlderMessages,
    onImageClick,
    onFilePreview,
    messageError,
    onRetryMessages,
    density,
    isSelectionMode,
    selectedMessageIds,
    onToggleSelect,
    onNavigateToMessage,
    currentUsername,
    unreadMarker,
    unreadRestoreSignature,
    onUnreadRestoreConsumed,
    onReachedLatest,
    jumpToMessageId,
    jumpRequestVersion,
    onJumpHandled,
    composerHeight,
  }: ChatTimelinePaneProps) => (
    <MessageList
      messages={messages}
      conversationId={conversationId}
      conversationType={conversationType}
      currentUserId={currentUserId}
      onReply={onReply}
      onReact={onReact}
      onEdit={onEdit}
      onDelete={onDelete}
      hasMore={hasMoreMessages}
      isLoadingMore={Boolean(isLoadingMessages && messages.length > 0)}
      isInitialLoading={Boolean(
        (isLoadingMessages || !isConversationReady) && messages.length === 0,
      )}
      historyLoadingState={historyLoadingState}
      onLoadMore={onLoadOlderMessages}
      onImageClick={onImageClick}
      onFilePreview={onFilePreview}
      error={messageError}
      onRetry={onRetryMessages}
      density={density}
      layoutState={layoutState}
      isSelectionMode={isSelectionMode}
      selectedMessageIds={selectedMessageIds}
      onToggleSelect={onToggleSelect}
      onNavigateToMessage={onNavigateToMessage}
      currentUsername={currentUsername}
      unreadMarker={unreadMarker}
      unreadRestoreSignature={unreadRestoreSignature}
      onUnreadRestoreConsumed={onUnreadRestoreConsumed}
      onReachedLatest={onReachedLatest}
      jumpToMessageId={jumpToMessageId}
      jumpRequestVersion={jumpRequestVersion}
      onJumpHandled={onJumpHandled}
      composerHeight={composerHeight}
      className="flex-1 min-h-0"
    />
  ),
);
ChatTimelinePane.displayName = "ChatTimelinePane";

const OverlayPanelFallback: React.FC = () => (
  <div className="flex h-full items-center justify-center px-6">
    <Spinner size="md" />
  </div>
);

export const ChatWindow: React.FC<ChatWindowProps> = ({
  layoutState,
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
  historyLoadingState,
  onLoadOlderMessages,
  onImageClick,
  onFilePreview,
  messageError,
  onRetryMessages,
  onReachedLatestMessage,
  connectionState = "connected",
  isConversationReady = true,
  externalJumpToMessageId = null,
  externalJumpRequestVersion = 0,
  onExternalJumpHandled,
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
  const sendRestriction = useChatStore(
    (state) => state.sendRestrictionsByConversation[conversation.id],
  );

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

      logMessageDebug("ChatWindow", "send_requested", {
        conversationId: conversation.id,
        inputMode,
        contentLength: outgoingContent.length,
        contentPreview: outgoingContent.slice(0, 120),
        type: messageType || MessageType.TEXT,
        attachmentCount: allAttachments.length,
        replyToId: replyToMessage?.id,
      });
      try {
        const sendPromise = Promise.resolve(
          onSendMessage(
            outgoingContent,
            replyToMessage,
            attachmentArg,
            messageType,
          ),
        );

        setInputValue("");
        setReplyToMessage(undefined);
        setEditingMessage(undefined);
        setInputMode("normal");

        if (queueMetas.length > 0) {
          uploadQueue.clearAll();
        }

        void sendPromise
          .then((result) => {
            logMessageDebug("ChatWindow", "send_resolved", {
              conversationId: conversation.id,
              disposition:
                (result as { disposition?: string } | undefined)?.disposition ??
                "unknown",
            });
          })
          .catch((error) => {
            logMessageDebug("ChatWindow", "send_rejected", {
              conversationId: conversation.id,
              errorMessage:
                error instanceof Error ? error.message : "unknown_error",
            });
          });

        return { disposition: "optimistic" as const };
      } catch (error) {
        logMessageDebug("ChatWindow", "send_rejected", {
          conversationId: conversation.id,
          errorMessage:
            error instanceof Error ? error.message : "unknown_error",
        });
        throw error;
      }
    },
    [
      conversation.id,
      editingMessage,
      inputMode,
      onEditMessage,
      onSendMessage,
      replyToMessage,
      uploadQueue,
    ],
  );

  // Search & pinned panel state
  const [overlayMode, setOverlayMode] = React.useState<
    "search" | "pinned" | null
  >(null);
  const [jumpTargetMessageId, setJumpTargetMessageId] = React.useState<
    string | null
  >(null);
  const [jumpRequestVersion, setJumpRequestVersion] = React.useState(0);
  const [unreadMarker, setUnreadMarker] = React.useState<{
    lastReadMessageId?: string;
    lastReadAt?: Date | string;
    firstUnreadMessageId?: string;
    active?: boolean;
  } | null>(null);
  const [pendingUnreadRestoreSignature, setPendingUnreadRestoreSignature] =
    React.useState<string | null>(null);
  const [clockTick, setClockTick] = React.useState(() => Date.now());
  const [ephemeralNotice, setEphemeralNotice] =
    React.useState<EphemeralNotice | null>(null);
  const [composerHeight, setComposerHeight] = React.useState(0);
  const [viewportMetrics, setViewportMetrics] = React.useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 900,
  }));
  const previousConnectionStateRef =
    React.useRef<ConnectionState>(connectionState);
  const ephemeralNoticeTimerRef = React.useRef<number | null>(null);

  const resolvedDensity = React.useMemo(
    () =>
      resolveChatDensity({
        preference: chatDensity,
        viewportWidth: viewportMetrics.width,
        viewportHeight: viewportMetrics.height,
        layoutState,
        messages,
        conversationType: conversation.type,
      }),
    [
      chatDensity,
      conversation.type,
      layoutState,
      messages,
      viewportMetrics.height,
      viewportMetrics.width,
    ],
  );
  const layoutProfile = React.useMemo(
    () => resolveChatLayoutProfile(viewportMetrics.width, layoutState),
    [layoutState, viewportMetrics.width],
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
  const composerAvailability = useComposerAvailability({
    connectionState,
    conversation,
    isConversationReady,
    sendRestriction,
    slowModeRemainingSeconds,
  });

  const emitUploadValidationToasts = React.useCallback(
    (errors?: string[]) => {
      if (!errors || errors.length === 0) {
        return;
      }

      const uniqueErrors = Array.from(new Set(errors));
      uniqueErrors.slice(0, 2).forEach((message) => toast.error(message));

      if (uniqueErrors.length > 2) {
        toast.warning(
          t("chat:composer.moreUploadErrors", {
            defaultValue: "{{count}} more file issue(s)",
            count: uniqueErrors.length - 2,
          }),
        );
      }
    },
    [t],
  );

  const handleAddFiles = React.useCallback(
    (files: File[]) => {
      const result = uploadQueue.addFiles(files);
      emitUploadValidationToasts(result.errors);
    },
    [emitUploadValidationToasts, uploadQueue],
  );

  const { isDragActive, dropZoneProps, dismiss } = useDropZone({
    onDrop: handleAddFiles,
    disabled: !composerAvailability.canAttach,
    onDropRejected: () => {
      toast.warning(
        composerAvailability.statusMessage ||
          t("chat:composer.attachBlocked", {
            defaultValue: "Attachments are currently unavailable",
          }),
      );
    },
  });

  const bottomFloatingOffset = React.useMemo(
    () => Math.max(12, composerHeight + 12),
    [composerHeight],
  );

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
    setJumpTargetMessageId((current) =>
      current === messageId ? null : current,
    );
  }, []);

  const handleReachedLatest = React.useCallback(
    (message: Message) => {
      setUnreadMarker((current) => (current ? null : current));
      setPendingUnreadRestoreSignature(null);
      onReachedLatestMessage?.(message);
    },
    [onReachedLatestMessage],
  );

  const handleUnreadRestoreConsumed = React.useCallback((signature: string) => {
    setPendingUnreadRestoreSignature((current) =>
      current === signature ? null : current,
    );
  }, []);

  const queueJumpToMessage = React.useCallback(
    (messageId: string) => {
      setOverlayMode(null);
      setJumpTargetMessageId(messageId);
      setJumpRequestVersion((value) => value + 1);
      logScrollTrace("jump_requested", {
        conversationId: conversation.id,
        messageId,
      });
    },
    [conversation.id],
  );

  const ensureMessageLoaded = React.useCallback(
    async (messageId: string, fallbackMessage?: Message) => {
      const existingMessage = messages.find((message) =>
        matchesMessageIdentity(message, messageId),
      );
      if (existingMessage) {
        return existingMessage;
      }

      let targetMessage = fallbackMessage;
      if (!targetMessage) {
        const response = await getMessageByIdUseCase(messageId);
        targetMessage = unwrapApiSuccess(response) as Message;
      }

      addMessage(conversation.id, targetMessage);
      const cursor = new Date(targetMessage.createdAt).toISOString();
      await Promise.allSettled([
        fetchMessages(conversation.id, cursor, undefined, {
          beforeId: targetMessage.id,
          limit: 24,
        }),
        fetchMessages(conversation.id, undefined, cursor, {
          afterId: targetMessage.id,
          limit: 24,
        }),
      ]);

      return targetMessage;
    },
    [addMessage, conversation.id, fetchMessages, messages],
  );

  const handleJumpToMessage = React.useCallback(
    async (message: Message) => {
      await ensureMessageLoaded(message.id, message);
      queueJumpToMessage(message.id);
    },
    [ensureMessageLoaded, queueJumpToMessage],
  );

  const handleNavigateToMessage = React.useCallback(
    async (messageId: string) => {
      try {
        await ensureMessageLoaded(messageId);
        queueJumpToMessage(messageId);
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(
          apiError.message ||
            t("chat:message.replyTargetMissing", {
              defaultValue: "Unable to open replied message",
            }),
        );
        logScrollTrace("jump_load_failed", {
          conversationId: conversation.id,
          messageId,
          errorMessage: apiError.message || "unknown",
        });
      }
    },
    [conversation.id, ensureMessageLoaded, queueJumpToMessage, t],
  );

  React.useEffect(() => {
    if (!externalJumpToMessageId) return;

    void handleNavigateToMessage(externalJumpToMessageId).finally(() => {
      onExternalJumpHandled?.(externalJumpToMessageId);
    });
  }, [
    externalJumpRequestVersion,
    externalJumpToMessageId,
    handleNavigateToMessage,
    onExternalJumpHandled,
  ]);

  const conversationReadSnapshot = conversation as Conversation & {
    lastReadMessageId?: string;
    lastReadAt?: Date | string;
    firstUnreadMessageId?: string;
  };
  const lastReadMessageId = conversationReadSnapshot.lastReadMessageId;
  const lastReadAt = conversationReadSnapshot.lastReadAt;
  const firstUnreadMessageId = conversationReadSnapshot.firstUnreadMessageId;

  // Close panels when switching conversations
  React.useEffect(() => {
    setOverlayMode(null);
    const hasUnreadContext =
      (conversation.unreadCount ?? 0) > 0 &&
      (firstUnreadMessageId || lastReadMessageId || lastReadAt);

    if (!hasUnreadContext) {
      setUnreadMarker(null);
      setPendingUnreadRestoreSignature(null);
      return;
    }

    const nextUnreadMarker = {
      lastReadMessageId,
      lastReadAt,
      firstUnreadMessageId,
      active: true,
    };
    const nextUnreadRestoreSignature = buildUnreadRestoreSignature({
      conversationId: conversation.id,
      firstUnreadMessageId,
      lastReadMessageId,
      lastReadAt,
    });

    setUnreadMarker(nextUnreadMarker);
    setPendingUnreadRestoreSignature((current) =>
      current === nextUnreadRestoreSignature
        ? current
        : nextUnreadRestoreSignature,
    );
  }, [
    conversation.id,
    conversation.unreadCount,
    firstUnreadMessageId,
    lastReadAt,
    lastReadMessageId,
  ]);

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
      .map((participant) => {
        const participantRecord = participant as unknown as Record<
          string,
          unknown
        >;
        const employeeCode =
          (typeof participantRecord.employeeCode === "string" &&
            participantRecord.employeeCode.trim()) ||
          (typeof participantRecord.employee_code === "string" &&
            participantRecord.employee_code.trim()) ||
          "";

        return {
          id: participant.id,
          username:
            participant.username?.trim() || employeeCode || participant.id,
          displayName:
            resolveUserDisplayName(participant, {
              allowLegacyFallback: false,
            }) || undefined,
        };
      });
  }, [conversation.participants, currentUser.id]);

  const handleShareContact = React.useCallback(
    async (contactUserId: string) => {
      try {
        await shareContactUseCase({
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

  const handleComposerLayoutHeightChange = React.useCallback(
    (nextHeight: number) => {
      setComposerHeight((previous) =>
        Math.abs(previous - nextHeight) <= 1 ? previous : nextHeight,
      );
    },
    [],
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

  const currentUsername = currentUser.username;

  return (
    <section
      key={conversation.id}
      className={clsx(
        "chat-background chat-shell relative flex h-full min-h-0 flex-col overflow-hidden animate-content-fade",
        className,
      )}
      data-chat-layout-profile={layoutProfile}
      data-chat-layout-state={layoutState}
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
          <div className="pointer-events-auto absolute inset-y-0 right-0 w-full max-w-[min(24rem,100%)] bg-[hsl(var(--chat-panel-bg))] shadow-elev3 animate-slide-up-fade">
            <React.Suspense fallback={<OverlayPanelFallback />}>
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
            </React.Suspense>
          </div>
        </div>
      )}

      <ChatTimelinePane
        layoutState={layoutState}
        messages={messages}
        conversationId={conversation.id}
        conversationType={conversation.type}
        currentUserId={currentUser.id}
        onReply={handleReply}
        onReact={handleReact}
        onEdit={handleEdit}
        onDelete={handleDelete}
        hasMoreMessages={hasMoreMessages}
        isLoadingMessages={isLoadingMessages}
        isConversationReady={isConversationReady}
        onLoadOlderMessages={onLoadOlderMessages}
        onImageClick={onImageClick}
        onFilePreview={onFilePreview}
        messageError={messageError}
        onRetryMessages={onRetryMessages}
        density={resolvedDensity}
        isSelectionMode={isMessageSelectionMode}
        selectedMessageIds={selectedMessageIds}
        onToggleSelect={toggleMessageSelection}
        onNavigateToMessage={handleNavigateToMessage}
        currentUsername={currentUsername}
        unreadMarker={unreadMarker}
        unreadRestoreSignature={pendingUnreadRestoreSignature}
        onUnreadRestoreConsumed={handleUnreadRestoreConsumed}
        onReachedLatest={handleReachedLatest}
        jumpToMessageId={jumpTargetMessageId}
        jumpRequestVersion={jumpRequestVersion}
        onJumpHandled={handleJumpHandled}
          composerHeight={composerHeight}
          historyLoadingState={historyLoadingState}
        />

      {ephemeralNotice &&
        bottomOverlayPlacements["ephemeral-notice"]?.visible && (
          <div
            className="pointer-events-none absolute inset-x-0 z-[55]"
            style={{
              bottom: `calc(env(safe-area-inset-bottom) + ${bottomFloatingOffset}px)`,
            }}
          >
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
            onLayoutHeightChange={handleComposerLayoutHeightChange}
            conversationId={conversation.id}
            currentUserId={currentUser.id}
            mentionCandidates={mentionCandidates}
            replyToMessage={replyToMessage}
            editingMessage={editingMessage}
            onCancelReply={handleCancelReply}
            onCancelEdit={handleCancelEdit}
            onTyping={onTyping}
            sendOnEnter
            disabled={!composerAvailability.canType}
            submitDisabled={!composerAvailability.canSubmit}
            attachmentsDisabled={!composerAvailability.canAttach}
            disabledReason={composerAvailability.statusMessage}
            disabledReasonTone={composerAvailability.statusTone}
            composerMode={composerAvailability.mode}
            onShareContact={handleShareContact}
            uploadDrafts={uploadQueue.drafts}
            onAddFiles={handleAddFiles}
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
