import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ChatHeader } from "../chat/ChatHeader";
import { ConversationViewport } from "../chat/ConversationViewport";
import { SelectionToolbar } from "../chat/SelectionToolbar";
import { MessageInspectDrawer } from "../chat/thread/MessageInspectDrawer";
import { DropOverlay } from "../input/DropOverlay";
import { MessageInput } from "../input/MessageInput";
import type { MessageInputHandle } from "../input/MessageInput";
import { ConversationLane } from "./ConversationLane";
import { AudioCallDialog } from "../../features/chat/components/AudioCallDialog";
import { VideoCallView } from "../../features/chat/components/VideoCallView";
import type { MentionCandidate } from "../input/MessageInput";
import { NotificationListSkeleton, toast } from "../ui";
import {
  useChatStore,
  useGroupStore,
  useMessageEntity,
  useUIStore,
} from "../../stores";
import {
  useComposerAvailability,
  useDropZone,
  useMobileViewportMetrics,
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
import { extractApiError } from "../../lib/apiContract";
import type { ConnectionState } from "../../hooks/useWebSocket";
import {
  resolveChatLayoutProfile,
} from "../../utils/densityPolicy";
import { resolveOverlayPlacements } from "../../utils/overlayResolver";
import { logMessageDebug } from "../../utils/messageDebug";
import { logScrollTrace } from "../../utils/scrollTrace";
import { logChatPerformance } from "../../utils/chatPerformance";
import { resolveUploadFileType } from "../../utils/uploadPolicy";
import { resolveUserDisplayName } from "../../features/chat/identity/resolveUserDisplayName";
import { getConversationDisplayName } from "../../utils/messageHelpers";
import { shareContactUseCase } from "../../features/chat/usecases/shareContact";
import { useChatUiStore } from "../../features/chat/state";
import { useMessageJumpTargetRTK } from "../../features/chat/hooks/useMessageJumpTargetRTK";
import { chatApi as rtkChatApi } from "../../features/api/chatApi";
import { store } from "../../store";
import type { ChatLayoutState } from "../../utils/densityPolicy";
import { FeatureErrorBoundary } from "../error";

const SearchPanel = React.lazy(() => import("../chat/SearchPanel"));
const PinnedMessagesPanel = React.lazy(
  () => import("../chat/PinnedMessagesPanel"),
);
const ForwardModal = React.lazy(
  () => import("../chat/ForwardModal").then((m) => ({ default: m.ForwardModal })),
);

// ── Convert upload queue metadata to Attachment ─────────────────────

function metaToAttachment(meta: UploadedFileMeta): Attachment {
  const mime = meta.mimeType || "";
  const attachmentType = resolveUploadFileType(mime);

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

const DRAFT_PERSIST_DEBOUNCE_MS = 450;

/** Extract mentions with full display name info for optimistic message rendering.
 * Returns array of { userId, displayName } objects to be passed to the send mutation.
 * Uses the same smart regex matching as extractMentionUserIds to handle @fullName with spaces.
 */
function extractMentionDetails(
  content: string,
  candidates: MentionCandidate[],
): { userId: string; displayName: string }[] {
  if (!candidates.length) return [];

  // Build a lookup map: lowercase token -> { id, displayName }
  const tokenToInfo = new Map<string, { id: string; displayName: string }>();

  for (const candidate of candidates) {
    const id = candidate.id;

    // Username token
    const username = candidate.username.toLowerCase().trim();
    if (username) {
      const displayName = candidate.resolvedName || candidate.displayName || candidate.fullName || candidate.username;
      tokenToInfo.set(username, { id, displayName });
    }

    // Resolved display name token (handles @fullName insert with spaces)
    const resolvedName = (
      candidate.resolvedName ||
      candidate.displayName ||
      candidate.fullName ||
      ""
    ).toLowerCase().trim();
    if (resolvedName && resolvedName !== username) {
      const displayName = candidate.resolvedName || candidate.displayName || candidate.fullName || candidate.username;
      tokenToInfo.set(resolvedName, { id, displayName });
    }
  }

  if (tokenToInfo.size === 0) return [];

  // Strip HTML tags for rich-text content
  const text = /^</.test(content.trim())
    ? content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")
    : content;

  // Sort tokens by length descending so longer names are matched first
  const sortedTokens = Array.from(tokenToInfo.keys()).sort((a, b) => b.length - a.length);
  const escapedTokens = sortedTokens.map((t) =>
    t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const mentionPattern = new RegExp(
    `@(${escapedTokens.join("|")})`,
    "gi",
  );

  const seen = new Set<string>();
  const result: { userId: string; displayName: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(text)) !== null) {
    const token = match[1].toLowerCase();
    const info = tokenToInfo.get(token);
    if (info && !seen.has(info.id)) {
      seen.add(info.id);
      result.push({ userId: info.id, displayName: info.displayName });
    }
  }

  return result;
}

interface ChatWindowProps {
  layoutState: ChatLayoutState;
  conversation: Conversation;
  currentUser: UserSummary;
  typingStatus?: TypingStatus;
  typingStatuses?: TypingStatus[];
  onSendMessage: (
    content: string,
    replyTo?: Message,
    fileMeta?: Attachment | Attachment[],
    type?: MessageType,
    /** Array of mention objects with userId and displayName for optimistic rendering */
    mentions?: { userId: string; displayName: string }[],
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

const OverlayPanelFallback: React.FC = () => (
  <div className="h-full px-1 py-2" aria-busy="true">
    <NotificationListSkeleton count={5} />
  </div>
);

export const ChatWindow: React.FC<ChatWindowProps> = ({
  layoutState,
  conversation,
  currentUser,
  typingStatus,
  typingStatuses,
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
  onReachedLatestMessage,
  connectionState = "connected",
  isConversationReady = true,
  externalJumpToMessageId = null,
  externalJumpRequestVersion = 0,
  onExternalJumpHandled,
  className,
}) => {
  const { t } = useTranslation();
  const isMessageSelectionMode = useUIStore((s) => s.isMessageSelectionMode);
  const selectedMessageIds = useUIStore((s) => s.selectedMessageIds);
  const enterSelectionMode = useUIStore((s) => s.enterSelectionMode);
  const exitSelectionMode = useUIStore((s) => s.exitSelectionMode);
  const toggleMessageSelection = useUIStore((s) => s.toggleMessageSelection);
  const slowModeUntil = useGroupStore(
    (state) => state.slowModeUntilByConversation[conversation.id] || 0,
  );
  const clearSlowModeCooldown = useGroupStore((s) => s.clearSlowModeCooldown);
  const { ensureMessageLoaded } = useMessageJumpTargetRTK(conversation.id);
  const sendRestriction = useChatStore(
    (state) => state.sendRestrictionsByConversation[conversation.id],
  );
  const setComposerDraft = useChatUiStore((state) => state.setComposerDraft);
  const clearComposerDraft = useChatUiStore(
    (state) => state.clearComposerDraft,
  );
  const readPersistedDraft = React.useCallback(
    (conversationId: string) =>
      useChatUiStore.getState().composerDraftByConversation[conversationId] ??
      "",
    [],
  );

  const [composerSeed, setComposerSeed] = React.useState(() =>
    readPersistedDraft(conversation.id),
  );
  const [composerSeedVersion, setComposerSeedVersion] = React.useState(0);
  const [inputMode, setInputMode] = React.useState<InputMode>("normal");
  const [replyToMessage, setReplyToMessage] = React.useState<
    Message | undefined
  >(undefined);
  const [editingMessage, setEditingMessage] = React.useState<
    Message | undefined
  >(undefined);
  const [forwardMessages, setForwardMessages] = React.useState<
    Message[] | null
  >(null);
  const draftBeforeEditRef = React.useRef<string>(composerSeed);
  // Ref so handleSend (declared before mentionCandidates useMemo) always reads the latest value.
  const mentionCandidatesRef = React.useRef<MentionCandidate[]>([]);
  const inputValueRef = React.useRef(composerSeed);
  const inputModeRef = React.useRef<InputMode>("normal");
  const pendingDraftPersistRef = React.useRef<{
    conversationId: string;
    value: string;
  } | null>(null);
  const draftPersistTimerRef = React.useRef<number | null>(null);
  const previousConversationIdRef = React.useRef(conversation.id);
  const navigationRequestSeqRef = React.useRef(0);
  const renderCountRef = React.useRef(0);
  const messageInputRef = React.useRef<MessageInputHandle>(null);
  // Tracks latest canType without adding it as an effect dependency
  const composerCanTypeRef = React.useRef(true);

  const replaceComposerSeed = React.useCallback((nextValue: string) => {
    inputValueRef.current = nextValue;
    setComposerSeed(nextValue);
    setComposerSeedVersion((version) => version + 1);
  }, []);

  const clearPendingDraftPersist = React.useCallback(() => {
    if (draftPersistTimerRef.current !== null) {
      window.clearTimeout(draftPersistTimerRef.current);
      draftPersistTimerRef.current = null;
    }
    pendingDraftPersistRef.current = null;
  }, []);

  const persistDraft = React.useCallback(
    (conversationId: string, value: string) => {
      if (value.trim().length === 0) {
        clearComposerDraft(conversationId);
        return;
      }

      setComposerDraft(conversationId, value);
    },
    [clearComposerDraft, setComposerDraft],
  );

  const flushPendingDraftPersist = React.useCallback(() => {
    if (draftPersistTimerRef.current !== null) {
      window.clearTimeout(draftPersistTimerRef.current);
      draftPersistTimerRef.current = null;
    }

    const pending = pendingDraftPersistRef.current;
    pendingDraftPersistRef.current = null;
    if (!pending) {
      return;
    }

    persistDraft(pending.conversationId, pending.value);
  }, [persistDraft]);

  const scheduleDraftPersist = React.useCallback(
    (conversationId: string, value: string) => {
      pendingDraftPersistRef.current = { conversationId, value };

      if (typeof window === "undefined") {
        flushPendingDraftPersist();
        return;
      }

      if (draftPersistTimerRef.current !== null) {
        window.clearTimeout(draftPersistTimerRef.current);
      }

      draftPersistTimerRef.current = window.setTimeout(() => {
        draftPersistTimerRef.current = null;
        const pending = pendingDraftPersistRef.current;
        pendingDraftPersistRef.current = null;
        if (pending) {
          persistDraft(pending.conversationId, pending.value);
        }
      }, DRAFT_PERSIST_DEBOUNCE_MS);
    },
    [flushPendingDraftPersist, persistDraft],
  );

  React.useEffect(() => {
    inputModeRef.current = inputMode;
  }, [inputMode]);

  // Auto-focus the message input when the active conversation changes.
  // Guards: desktop pointer device only (avoids unwanted keyboard pop-up on
  // mobile/tablet), and only when the composer is not disabled.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const rafId = window.requestAnimationFrame(() => {
      if (composerCanTypeRef.current) {
        messageInputRef.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [conversation.id]);

  React.useEffect(
    () => () => {
      flushPendingDraftPersist();
    },
    [flushPendingDraftPersist],
  );

  const handleReply = React.useCallback((message: Message) => {
    setReplyToMessage(message);
    setEditingMessage(undefined);
    setInputMode("reply");
  }, []);

  const handleForward = React.useCallback((message: Message) => {
    setForwardMessages([message]);
  }, []);

  const handleForwardSelected = React.useCallback(() => {
    const messages = Array.from(selectedMessageIds)
      .map((id) => useChatStore.getState().messageById?.[id])
      .filter((m): m is Message => Boolean(m));
    if (messages.length > 0) {
      setForwardMessages(messages);
    }
  }, [selectedMessageIds]);

  const handleCancelReply = React.useCallback(() => {
    setReplyToMessage(undefined);
    if (!editingMessage) {
      setInputMode("normal");
    }
  }, [editingMessage]);

  const handleCancelEdit = React.useCallback(() => {
    setEditingMessage(undefined);
    replaceComposerSeed(draftBeforeEditRef.current);
    if (!replyToMessage) {
      setInputMode("normal");
    }
  }, [replyToMessage, replaceComposerSeed]);

  const handleInputChange = React.useCallback(
    (nextValue: string) => {
      inputValueRef.current = nextValue;
      if (inputModeRef.current !== "edit") {
        scheduleDraftPersist(conversation.id, nextValue);
      }
    },
    [conversation.id, scheduleDraftPersist],
  );

  const handleReact = React.useCallback(
    (messageId: string, emoji: string) => {
      if (!onReactMessage) return;
      void Promise.resolve(onReactMessage(messageId, emoji));
    },
    [onReactMessage],
  );

  const handleEdit = React.useCallback((message: Message) => {
    flushPendingDraftPersist();
    draftBeforeEditRef.current = inputValueRef.current;
    setReplyToMessage(undefined);
    setEditingMessage(message);
    replaceComposerSeed(message.content || "");
    setInputMode("edit");
  }, [flushPendingDraftPersist, replaceComposerSeed]);

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
    (content?: string, fileMeta?: unknown, type?: string) => {
      if (inputMode === "edit" && editingMessage && onEditMessage) {
        const nextContent = (content || "").trim();
        if (
          !nextContent ||
          nextContent === (editingMessage.content || "").trim()
        ) {
          setEditingMessage(undefined);
          replaceComposerSeed(draftBeforeEditRef.current);
          setInputMode(replyToMessage ? "reply" : "normal");
          return;
        }

        return Promise.resolve(onEditMessage(editingMessage.id, nextContent))
          .then(() => {
            replaceComposerSeed(draftBeforeEditRef.current);
            setReplyToMessage(undefined);
            setEditingMessage(undefined);
            setInputMode("normal");
            return { disposition: "sent" as const };
          });
      }

      // ── Build attachments from finalized upload drafts ──
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
      const outgoingContent = (content || "").trim();
      if (!outgoingContent && !hasAttachments) return;

      const messageType = hasAttachments
        ? MessageType.FILE
        : (type as MessageType | undefined);
      const attachmentArg: Attachment | Attachment[] | undefined =
        hasAttachments
          ? allAttachments.length === 1
            ? allAttachments[0]
            : allAttachments
          : undefined;

      const mentionDetails = extractMentionDetails(outgoingContent, mentionCandidatesRef.current);

      logMessageDebug("ChatWindow", "send_requested", {
        conversationId: conversation.id,
        inputMode,
        contentLength: outgoingContent.length,
        contentPreview: outgoingContent.slice(0, 120),
        type: messageType || MessageType.TEXT,
        attachmentCount: allAttachments.length,
        replyToId: replyToMessage?.id,
        mentionCount: mentionDetails.length,
      });
      try {
        const sendResult = onSendMessage(
          outgoingContent,
          replyToMessage,
          attachmentArg,
          messageType,
          mentionDetails,
        );
        const sendPromise = Promise.resolve(sendResult);
        return sendPromise
          .then((result) => {
            inputValueRef.current = "";
            replaceComposerSeed("");
            clearPendingDraftPersist();
            clearComposerDraft(conversation.id);
            setReplyToMessage(undefined);
            setEditingMessage(undefined);
            setInputMode("normal");

            if (queueMetas.length > 0) {
              uploadQueue.acknowledgeSent();
            }

            logMessageDebug("ChatWindow", "send_resolved", {
              conversationId: conversation.id,
              disposition:
                (result as { disposition?: string } | undefined)?.disposition ??
                "unknown",
            });
            return result ?? { disposition: "acceptedOptimistic" as const };
          })
          .catch((error) => {
            logMessageDebug("ChatWindow", "send_rejected", {
              conversationId: conversation.id,
              errorMessage:
                error instanceof Error ? error.message : "unknown_error",
            });
            toast.error(
              t("error:upload.messageSendFailedKeepDraft", {
                defaultValue:
                  "Gửi tin nhắn thất bại, tệp đã tải lên vẫn được giữ để bạn thử lại.",
              }),
            );
            throw error;
          });
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
      clearComposerDraft,
      clearPendingDraftPersist,
      editingMessage,
      inputMode,
      onEditMessage,
      onSendMessage,
      replaceComposerSeed,
      replyToMessage,
      t,
      uploadQueue,
    ],
  );

  // Search & pinned panel state
  const [overlayMode, setOverlayMode] = React.useState<
    "search" | "pinned" | "inspect" | null
  >(null);
  const [inspectMessageId, setInspectMessageId] = React.useState<string | null>(
    null,
  );
  const [, setJumpTargetMessageId] = React.useState<string | null>(null);
  const [, setJumpRequestVersion] = React.useState(0);
  const [clockTick, setClockTick] = React.useState(() => Date.now());
  const [ephemeralNotice, setEphemeralNotice] =
    React.useState<EphemeralNotice | null>(null);
  const [callMode, setCallMode] = React.useState<"audio" | "video" | null>(null);
  const [composerHeight, setComposerHeight] = React.useState(0);
  const viewportMetrics = useMobileViewportMetrics();
  const previousConnectionStateRef =
    React.useRef<ConnectionState>(connectionState);
  const ephemeralNoticeTimerRef = React.useRef<number | null>(null);
  const inspectedMessage = useMessageEntity(inspectMessageId);
  const resolvedDensity = "comfortable" as const;
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

  // Keep ref in sync so the auto-focus effect can read latest canType without
  // taking it as a dependency (avoids re-running on every typing state flip).
  React.useLayoutEffect(() => {
    composerCanTypeRef.current = composerAvailability.canType;
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
    () => Math.max(12, composerHeight + viewportMetrics.keyboardInset + 12),
    [composerHeight, viewportMetrics.keyboardInset],
  );

  React.useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    renderCountRef.current += 1;
    logChatPerformance("chat-window-render-count", {
      conversationId: conversation.id,
      renderCount: renderCountRef.current,
      inputMode,
      overlayMode,
      isMessageSelectionMode,
      composerHeight,
      keyboardInset: viewportMetrics.keyboardInset,
    });
  });

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

  const handleInspectMessage = React.useCallback((message: Message) => {
    setInspectMessageId(message.id);
    setOverlayMode("inspect");
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

  const handleJumpToMessage = React.useCallback(
    async (message: Message) => {
      const requestSeq = (navigationRequestSeqRef.current += 1);
      const result = await ensureMessageLoaded(message.id, message);
      if (result.stale || navigationRequestSeqRef.current !== requestSeq) {
        return;
      }
      queueJumpToMessage(message.id);
    },
    [ensureMessageLoaded, queueJumpToMessage],
  );

  const handleNavigateToMessage = React.useCallback(
    async (messageId: string) => {
      const requestSeq = (navigationRequestSeqRef.current += 1);
      try {
        const result = await ensureMessageLoaded(messageId);
        if (result.stale || navigationRequestSeqRef.current !== requestSeq) {
          logScrollTrace("jump_request_ignored_stale", {
            conversationId: conversation.id,
            messageId,
          });
          return;
        }
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
      setTimeout(() => {
        onExternalJumpHandled?.(externalJumpToMessageId);
      }, 0);
    });
  }, [
    externalJumpRequestVersion,
    externalJumpToMessageId,
    handleNavigateToMessage,
    onExternalJumpHandled,
  ]);

  // Close panels when switching conversations
  const [prevConversationId, setPrevConversationId] = React.useState(conversation.id);

  if (conversation.id !== prevConversationId) {
    setPrevConversationId(conversation.id);
    setOverlayMode(null);
    setInspectMessageId(null);
    exitSelectionMode();

    // Reset composer state
    const nextDraft = readPersistedDraft(conversation.id);
    setComposerSeed(nextDraft);
    setComposerSeedVersion((v) => v + 1);
    setReplyToMessage(undefined);
    setEditingMessage(undefined);
    setInputMode("normal");
  }

  React.useEffect(() => {
    if (previousConversationIdRef.current === conversation.id) {
      return;
    }

    navigationRequestSeqRef.current += 1;
    flushPendingDraftPersist();
    previousConversationIdRef.current = conversation.id;
  }, [conversation.id, flushPendingDraftPersist]);

  React.useEffect(() => {
    const previousState = previousConnectionStateRef.current;

    if (ephemeralNoticeTimerRef.current !== null) {
      window.clearTimeout(ephemeralNoticeTimerRef.current);
      ephemeralNoticeTimerRef.current = null;
    }

    if (
      connectionState === "connected" &&
      (previousState === "reconnecting" ||
        previousState === "disconnected" ||
        previousState === "error")
    ) {
      setEphemeralNotice({
        kind: "success",
        message: t("chat:toast.connectionRestored"),
      });
      ephemeralNoticeTimerRef.current = window.setTimeout(() => {
        setEphemeralNotice((current) =>
          current?.kind === "success" ? null : current,
        );
        ephemeralNoticeTimerRef.current = null;
      }, 2400);
    } else if (
      connectionState === "connected" ||
      connectionState === "reconnecting" ||
      connectionState === "disconnected" ||
      connectionState === "error"
    ) {
      setTimeout(() => setEphemeralNotice(null), 0);
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
        const fullNameFromHR =
          (typeof participantRecord.fullNameFromHR === "string" &&
            participantRecord.fullNameFromHR.trim()) ||
          (typeof participantRecord.full_name_from_hr === "string" &&
            participantRecord.full_name_from_hr.trim()) ||
          (typeof participantRecord.fullName === "string" &&
            participantRecord.fullName.trim()) ||
          "";

        // Resolve primary display name: fullNameFromHR > displayName > username
        const resolvedName =
          fullNameFromHR ||
          resolveUserDisplayName(participant, {
            allowLegacyFallback: false,
          }) ||
          participant.username?.trim() ||
          employeeCode ||
          participant.id;

        return {
          id: participant.id,
          username:
            participant.username?.trim() || employeeCode || participant.id,
          displayName:
            resolveUserDisplayName(participant, {
              allowLegacyFallback: false,
            }) || undefined,
          fullName: fullNameFromHR || undefined,
          employeeCode: employeeCode || undefined,
          resolvedName,
        };
      });
  }, [conversation.participants, currentUser.id]);

  // Keep ref in sync so handleSend always reads the latest candidates without being in its dep array.
  React.useLayoutEffect(() => {
    mentionCandidatesRef.current = mentionCandidates;
  });

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

  // Note: Selection exit handled in render-time conversation change check above.

  const handleSelectionDelete = React.useCallback(() => {
    if (!onDeleteMessage) return;
    for (const id of selectedMessageIds) {
      void Promise.resolve(onDeleteMessage(id));
    }
    exitSelectionMode();
  }, [onDeleteMessage, selectedMessageIds, exitSelectionMode]);

  const handleSelectionCopy = React.useCallback(() => {
    const cachedMessages =
      rtkChatApi.endpoints.getMessages
        .select({ conversationId: conversation.id })(store.getState())
        .data?.messages ?? [];

    const isSelectedMessage = (message: Message) =>
      [
        message.id,
        message.localId,
        message.stableId,
        message.clientMessageId,
      ].some((id) => typeof id === "string" && selectedMessageIds.has(id));

    const selectedMsgs = cachedMessages
      .filter(isSelectedMessage)
      .map((message) => message.content)
      .join("\n");
    void navigator.clipboard.writeText(selectedMsgs);
    toast.success(t("chat:message.copySuccess", { defaultValue: "Đã sao chép" }));
    exitSelectionMode();
  }, [conversation.id, selectedMessageIds, exitSelectionMode, t]);

  const currentUsername = currentUser.username;
  const callDisplayName =
    getConversationDisplayName(conversation, currentUser.id) ||
    conversation.displayName ||
    conversation.name ||
    t("common:labels.conversation");

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
        typingStatuses={typingStatuses}
        onBack={onBack}
        onInfoClick={onToggleInfoPanel}
        onSearchClick={handleSearchClick}
        onPinnedClick={handlePinnedClick}
        onCallClick={() => setCallMode("audio")}
        onVideoCallClick={() => setCallMode("video")}
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
          <div className="pointer-events-auto absolute inset-y-0 right-0 w-full max-w-[min(24rem,100%)] border-l border-border/60 bg-[hsl(var(--chat-panel-bg))] shadow-elev3 animate-slide-up-fade">
            <React.Suspense fallback={<OverlayPanelFallback />}>
              {overlayMode === "search" ? (
                <SearchPanel
                  conversationId={conversation.id}
                  onSelectMessage={handleJumpToMessage}
                  onClose={() => setOverlayMode(null)}
                  className="h-full"
                />
              ) : overlayMode === "inspect" ? (
                <MessageInspectDrawer
                  message={inspectedMessage ?? null}
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

      <FeatureErrorBoundary name="Tin nhắn">
        <ConversationViewport
        layoutState={layoutState}
        conversation={conversation}
        currentUserId={currentUser.id}
        onReply={handleReply}
        onReact={handleReact}
        onForward={handleForward}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onInspect={handleInspectMessage}
        hasMoreMessages={hasMoreMessages}
        isLoadingMessages={isLoadingMessages}
        isConversationReady={isConversationReady}
        onLoadOlderMessages={onLoadOlderMessages}
        onImageClick={onImageClick}
        onFilePreview={onFilePreview}
        density={resolvedDensity}
        isSelectionMode={isMessageSelectionMode}
        selectedMessageIds={selectedMessageIds}
        onToggleSelect={toggleMessageSelection}
        onNavigateToMessage={handleNavigateToMessage}
        currentUsername={currentUsername}
        composerHeight={composerHeight}
        className="flex-1 min-h-0"
        onBottomVisible={onReachedLatestMessage ? () => onReachedLatestMessage({} as Message) : undefined}
        />
      </FeatureErrorBoundary>

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
            onForward={handleForwardSelected}
            onCopy={handleSelectionCopy}
            onCancel={exitSelectionMode}
          />
        )}

      {/* Message input - hidden during selection mode */}
      {!isMessageSelectionMode && (
        <div
          className="sticky z-sticky shrink-0"
          style={{
            bottom:
              viewportMetrics.keyboardInset > 0
                ? `${viewportMetrics.keyboardInset}px`
                : "0px",
          }}
        >
          <FeatureErrorBoundary name="Nhập tin nhắn">
            <MessageInput
            ref={messageInputRef}
            value={composerSeed}
            valueResetKey={composerSeedVersion}
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
            conversationName={callDisplayName}
            onAddFiles={handleAddFiles}
            onRemoveDraft={uploadQueue.removeDraft}
            onCancelUpload={uploadQueue.cancelUpload}
            onRetryUpload={uploadQueue.retryUpload}
            onClearAllDrafts={uploadQueue.clearAll}
            hasUploadingDrafts={uploadQueue.hasUploadingDrafts}
            hasFailedDrafts={uploadQueue.hasFailedDrafts}
            hasReadyDrafts={uploadQueue.hasReadyDrafts}
          />
          </FeatureErrorBoundary>
        </div>
      )}

      <AudioCallDialog
        isOpen={callMode === "audio"}
        name={callDisplayName}
        statusLabel="Đang gọi..."
        onClose={() => setCallMode(null)}
      />
      <VideoCallView
        isOpen={callMode === "video"}
        name={callDisplayName}
        onClose={() => setCallMode(null)}
      />

      {forwardMessages && (
        <React.Suspense fallback={null}>
          <ForwardModal
            messages={forwardMessages}
            onClose={() => setForwardMessages(null)}
          />
        </React.Suspense>
      )}
    </section>
  );
};

export default ChatWindow;
