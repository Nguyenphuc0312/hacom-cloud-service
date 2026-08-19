import React from "react";
import clsx from "clsx";
import { Pin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ChatHeader } from "../chat/ChatHeader";
import { PinnedMessageBar } from "../chat/PinnedMessageBar";
import { ConversationViewport } from "../chat/ConversationViewport";
import { SelectionToolbar } from "../chat/SelectionToolbar";
import { DropOverlay } from "../input/DropOverlay";
import { MessageInput } from "../input/MessageInput";
import type { MessageInputHandle } from "../input/MessageInput";
import { ConversationLane } from "./ConversationLane";
import type { MentionCandidate } from "../input/MessageInput";
import { NotificationListSkeleton, toast } from "../ui";
import {
  useChatStore,
  useGroupStore,
  useUIStore,
} from "../../stores";
import {
  useComposerAvailability,
  useDropZone,
  useMobileViewportMetrics,
  useUploadQueue,
  usePresence,
  usePinnedMessages,
} from "../../hooks";
import type {
  Attachment,
  Conversation,
  ImageClickPayload,
  InputMode,
  LocationMessagePayload,
  Message,
  TypingStatus,
  UserSummary,
} from "../../types";
import { FileType, MessageType } from "../../types";
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
import { getConversationDisplayName, getMessagePreview, getOtherParticipant } from "../../utils/messageHelpers";
import { useEnrichedProfileStore } from "../../stores/enrichedProfileStore";
import { useFriendshipStore } from "../../stores/friendshipStore";
import { enrichUserProfile } from "../../services/enrichUserProfile";
import { loadUserProfiles } from "../../services/userBatchLoader";
import { isDirectConversation } from "../../lib/conversationAdapter";
import { shareContactUseCase } from "../../features/chat/usecases/shareContact";
import { useChatUiStore } from "../../features/chat/state/chatUiStore";
import { useMessageJumpTargetRTK } from "../../features/chat/hooks/useMessageJumpTargetRTK";
import { chatApi as rtkChatApi } from "../../features/api/chatApi";
import { store } from "../../store";
import type { ChatLayoutState } from "../../utils/densityPolicy";
import { FeatureErrorBoundary } from "../error";
import type { LinkPreviewMeta } from "../message/linkPreviewUtils";

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
    ...(meta.url ? { url: meta.url } : {}),
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

    // Each token maps to the exact surface form present in the text. The
    // returned `displayName` MUST equal the matched text — the message renderer
    // builds its highlight regex from mentions[].displayName, so a mismatch
    // would leave the tag un-highlighted and un-clickable.
    const register = (surface: string | undefined | null) => {
      const token = (surface || "").toLowerCase().trim();
      if (token && !tokenToInfo.has(token)) {
        tokenToInfo.set(token, { id, displayName: (surface || "").trim() });
      }
    };

    // Inserted nick first (what handleMentionSelect writes today), then the
    // other surface forms so legacy @fullName / @username messages still resolve.
    register(candidate.mentionInsertName);
    register(candidate.displayName);
    register(candidate.resolvedName || candidate.fullName);
    register(candidate.username);
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
    contentFormat?: "plain_text" | "rich_text",
    contentJson?: Record<string, unknown>,
    plainText?: string,
    linkPreview?: LinkPreviewMeta,
    options?: { location?: LocationMessagePayload; clientMessageId?: string },
  ) => unknown | Promise<unknown>;
  onReactMessage?: (messageId: string, emoji: string) => void | Promise<void>;
  onEditMessage?: (messageId: string, content: string) => void | Promise<void>;
  onDeleteMessage?: (messageId: string, mode?: "FOR_ME" | "FOR_EVERYONE", context?: "ADMIN_DELETE") => void | Promise<void>;
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
  onImageClick?: (payload: ImageClickPayload) => void;
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
        // Focus without scrolling — a plain focus() scrolls the caret into
        // view and drags ancestor scroll containers (the sidebar list) to the
        // top when opening a conversation.
        messageInputRef.current?.focus({ scrollIntoView: false });
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
    // Selection lưu id theo bất kỳ dạng nào MessageItem dùng (id/localId/
    // stableId/clientMessageId) nên phải đối chiếu cả 4, giống handleSelectionCopy.
    const messages = (
      rtkChatApi.endpoints.getMessages
        .select({ conversationId: conversation.id })(store.getState())
        .data?.messages ?? []
    ).filter((message) =>
      [
        message.id,
        message.localId,
        message.stableId,
        message.clientMessageId,
      ].some((id) => typeof id === "string" && selectedMessageIds.has(id)),
    );
    if (messages.length > 0) {
      setForwardMessages(messages);
      exitSelectionMode();
    }
  }, [conversation.id, selectedMessageIds, exitSelectionMode]);

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
    (messageId: string, mode?: "FOR_ME" | "FOR_EVERYONE", context?: "ADMIN_DELETE") => {
      if (!onDeleteMessage) return;
      void Promise.resolve(onDeleteMessage(messageId, mode, context));
    },
    [onDeleteMessage],
  );

  // ── Multi-file upload queue ──
  const uploadQueue = useUploadQueue({ conversationId: conversation.id });

  // ── Presence subscription: subscribe to room members' presence ──
  usePresence({ conversationId: conversation.id });

  const {
    togglePin,
    pinnedMessages,
    isLoading: isPinnedLoading,
    error: pinnedError,
  } = usePinnedMessages(conversation.id);
  const [pinNotice, setPinNotice] = React.useState<Message | null>(null);
  const pinNoticeTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => () => {
    if (pinNoticeTimerRef.current !== null) {
      window.clearTimeout(pinNoticeTimerRef.current);
    }
  }, []);

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

      const allAreImages =
        hasAttachments &&
        allAttachments.every(
          (a) =>
            a.type === FileType.IMAGE ||
            (typeof a.mimeType === "string" && a.mimeType.startsWith("image/")),
        );
      const messageType = hasAttachments
        ? allAreImages
          ? MessageType.IMAGE
          : MessageType.FILE
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

  const handleShareLocation = React.useCallback(
    (location: LocationMessagePayload, clientMessageId?: string) => {
      const sendResult = onSendMessage(
        "",
        replyToMessage,
        undefined,
        MessageType.LOCATION,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { location, clientMessageId },
      );
      return Promise.resolve(sendResult).then((result) => {
        setReplyToMessage(undefined);
        setInputMode("normal");
        return result;
      });
    },
    [onSendMessage, replyToMessage],
  );

  // Search & pinned panel state
  const [overlayMode, setOverlayMode] = React.useState<
    "search" | "pinned" | null
  >(null);
  const [jumpTargetMessageId, setJumpTargetMessageId] = React.useState<
    string | null
  >(null);
  const [jumpRequestVersion, setJumpRequestVersion] = React.useState(0);
  const [clockTick, setClockTick] = React.useState(() => Date.now());
  const [ephemeralNotice, setEphemeralNotice] =
    React.useState<EphemeralNotice | null>(null);
const [composerHeight, setComposerHeight] = React.useState(0);
  const viewportMetrics = useMobileViewportMetrics();
  const previousConnectionStateRef =
    React.useRef<ConnectionState>(connectionState);
  const ephemeralNoticeTimerRef = React.useRef<number | null>(null);
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

  const handlePin = React.useCallback(
    async (messageId: string) => {
      const msg = rtkChatApi.endpoints.getMessages
        .select({ conversationId: conversation.id })(store.getState())
        .data?.messages.find((m) => m.id === messageId);
      if (!msg) return false;
      const wasPinned = msg.isPinned === true;
      const succeeded = await togglePin(msg);
      if (succeeded && !wasPinned) {
        setPinNotice(msg);
        if (pinNoticeTimerRef.current !== null) {
          window.clearTimeout(pinNoticeTimerRef.current);
        }
        pinNoticeTimerRef.current = window.setTimeout(() => {
          setPinNotice(null);
          pinNoticeTimerRef.current = null;
        }, 7000);
      }
      return succeeded;
    },
    [conversation.id, togglePin],
  );

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

    const timer = window.setTimeout(() => {
      void handleNavigateToMessage(externalJumpToMessageId).finally(() => {
        onExternalJumpHandled?.(externalJumpToMessageId);
      });
    }, 0);

    return () => window.clearTimeout(timer);
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

  const enrichedNameByUserId = useEnrichedProfileStore((s) => s.nameByUserId);
  // Nguồn CHUẨN của "tên gợi nhớ". `nameByUserId` không dùng được cho việc này:
  // `enrichUserProfile` ghi TÊN THẬT vào chính map đó nên request nào về sau thì
  // thắng — alias lúc có lúc không.
  const aliasByFriendUserId = useFriendshipStore((s) => s.friendByUserId);
  // Phòng ban/công ty không nằm trong participant payload → enrich từ /users/batch
  // để dòng phụ trong dropdown @mention hiện "phòng ban · công ty".
  const [mentionHrByUserId, setMentionHrByUserId] = React.useState<
    Record<string, { departmentName?: string; companyName?: string }>
  >({});

  const mentionCandidates = React.useMemo<MentionCandidate[]>(() => {
    const participants = Array.isArray(conversation.participants)
      ? conversation.participants
      : [];

    const individualCandidates = participants
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

        // "Tên gợi nhớ" — nhãn RIÊNG của người xem. Chỉ dùng để HIỂN THỊ (dòng
        // gợi ý, và tag sau khi gửi); tuyệt đối không được chảy vào resolvedName/
        // displayName vì đó là thứ ghi vào nội dung tin nhắn và gửi lên server —
        // alias mà lọt ra thì cả nhóm đọc được nhãn riêng của một người.
        const aliasLabel = aliasByFriendUserId[participant.id]?.alias?.trim();

        // Resolve display name once (called per participant on every recompute —
        // avoid running it twice for large groups).
        const displayName =
          resolveUserDisplayName(participant, {
            allowLegacyFallback: false,
          }) || undefined;

        // Primary name: fullNameFromHR > displayName > username
        const resolvedName =
          fullNameFromHR ||
          displayName ||
          participant.username?.trim() ||
          employeeCode ||
          participant.id;

        // The single shared name inserted into the message (Zalo WYSIWYG model):
        // the same canonical name shown in the member list. Never the private
        // alias — that stays viewer-local and must not be sent to the group.
        const mentionInsertName = resolvedName;

        return {
          id: participant.id,
          username:
            participant.username?.trim() || employeeCode || participant.id,
          displayName,
          fullName: fullNameFromHR || undefined,
          aliasLabel: aliasLabel || undefined,
          avatarUrl:
            (typeof participantRecord.avatar === "string" &&
              participantRecord.avatar.trim()) ||
            (typeof participantRecord.avatarUrl === "string" &&
              participantRecord.avatarUrl.trim()) ||
            undefined,
          employeeCode: employeeCode || undefined,
          departmentName: mentionHrByUserId[participant.id]?.departmentName,
          companyName: mentionHrByUserId[participant.id]?.companyName,
          resolvedName,
          mentionInsertName,
        };
      });

    // Add @all candidate for group conversations (non-direct/private)
    if (!isDirectConversation(conversation) && individualCandidates.length >= 1) {
      return [
        {
          id: "all",
          username: "all",
          displayName: "all",
        },
        ...individualCandidates,
      ];
    }

    return individualCandidates;
  }, [conversation, currentUser.id, aliasByFriendUserId, mentionHrByUserId]);

  // Keep ref in sync so handleSend always reads the latest candidates without being in its dep array.
  React.useLayoutEffect(() => {
    mentionCandidatesRef.current = mentionCandidates;
  });

  // Pre-fetch profiles for all participants so the @mention dropdown and
  // message sender names show real names instead of codes/emails.
  React.useEffect(() => {
    const participants = Array.isArray(conversation.participants)
      ? conversation.participants
      : [];
    const ids: string[] = [];
    for (const p of participants) {
      if (p.id && p.id !== currentUser.id) {
        enrichUserProfile(p.id);
        ids.push(p.id);
      }
    }
    if (ids.length === 0) return;
    let cancelled = false;
    void loadUserProfiles(ids).then((profileMap) => {
      if (cancelled) return;
      const resolved: Record<string, { departmentName?: string; companyName?: string }> = {};
      for (const [id, profile] of Object.entries(profileMap)) {
        if (!profile) continue;
        const hr = profile as { department?: string | null; company?: string | null };
        if (hr.department || hr.company) {
          resolved[id] = {
            departmentName: hr.department ?? undefined,
            companyName: hr.company ?? undefined,
          };
        }
      }
      if (Object.keys(resolved).length > 0) {
        setMentionHrByUserId((prev) => ({ ...prev, ...resolved }));
      }
    });
    return () => { cancelled = true; };
  }, [conversation.id, conversation.participants, currentUser.id]);

  const handleShareContact = React.useCallback(
    async (contactUserId: string): Promise<boolean> => {
      try {
        await shareContactUseCase({
          conversationId: conversation.id,
          contactUserId,
        });
        toast.success(
          t("chat:contactShare.sent", { defaultValue: "Contact shared" }),
        );
        return true;
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(
          apiError.message ||
            t("chat:contactShare.failed", {
              defaultValue: "Unable to share contact",
            }),
        );
        return false;
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

  const handleSelectionPin = React.useCallback(async () => {
    const cachedMessages =
      rtkChatApi.endpoints.getMessages
        .select({ conversationId: conversation.id })(store.getState())
        .data?.messages ?? [];

    const isSelectedMessage = (message: Message) =>
      [message.id, message.localId, message.stableId, message.clientMessageId].some(
        (id) => typeof id === "string" && selectedMessageIds.has(id),
      );

    const messagesToPin = cachedMessages.filter(
      (message) => isSelectedMessage(message) && !message.isPinned,
    );

    let pinnedCount = 0;
    for (const message of messagesToPin) {
      if (await togglePin(message)) pinnedCount += 1;
    }

    if (pinnedCount > 0) {
      toast.success(
        t("chat:pinned.pinSelectedSuccess", {
          count: pinnedCount,
          defaultValue: "Đã ghim {{count}} tin nhắn",
        }),
      );
    }
    exitSelectionMode();
  }, [conversation.id, selectedMessageIds, togglePin, exitSelectionMode, t]);

  const currentUsername = currentUser.username;
  const dmPartnerUserId = isDirectConversation(conversation)
    ? getOtherParticipant(conversation, currentUser.id)?.id
    : undefined;
  const callDisplayName =
    (dmPartnerUserId && enrichedNameByUserId[dmPartnerUserId]) ||
    getConversationDisplayName(conversation, currentUser.id) ||
    conversation.displayName ||
    conversation.name ||
    t("common:labels.conversation");

  return (
    <section
      key={conversation.id}
      className={clsx(
        "relative flex h-full min-h-0 overflow-hidden",
        className,
      )}
    >
      {/* Chat column — shrinks when the docked search panel opens */}
      <div
        className="chat-background chat-shell relative flex min-w-0 flex-1 flex-col overflow-hidden animate-content-fade transition-[width] duration-200 ease-out"
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
        onSelectionMode={enterSelectionMode}
      />

      {pinnedMessages.length > 0 && (
        <PinnedMessageBar
          pinnedMessages={pinnedMessages}
          currentUserId={currentUser.id}
          onJumpToMessage={handleJumpToMessage}
          onOpenList={handlePinnedClick}
        />
      )}

      <FeatureErrorBoundary name="Tin nhắn">
        <ConversationViewport
        layoutState={layoutState}
        conversation={conversation}
        currentUserId={currentUser.id}
        onReply={handleReply}
        onReact={handleReact}
        onForward={handleForward}
        onPin={handlePin}
        onEdit={handleEdit}
        onDelete={handleDelete}
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
        onStartSelectionMode={enterSelectionMode}
        onNavigateToMessage={handleNavigateToMessage}
        currentUsername={currentUsername}
        composerHeight={composerHeight}
        className="flex-1 min-h-0"
        onBottomVisible={onReachedLatestMessage ? () => onReachedLatestMessage({} as Message) : undefined}
        jumpToMessageId={jumpTargetMessageId}
        jumpNonce={jumpRequestVersion}
        />
      </FeatureErrorBoundary>

      {pinNotice && (
        <div className="pointer-events-none absolute inset-x-0 bottom-20 z-[56] flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-[min(38rem,100%)] items-center gap-2 rounded-full border border-border/70 bg-surface px-3.5 py-2 text-sm text-text-secondary shadow-elev2">
            <Pin className="h-4 w-4 shrink-0 text-brand-solid" strokeWidth={1.8} />
            <span className="truncate">
              {t("chat:pinned.notice", { defaultValue: "Bạn đã ghim tin nhắn" })}{" "}
              <span className="font-medium text-text-primary">{getMessagePreview(pinNotice, currentUser.id, 48)}</span>
            </span>
            <button
              type="button"
              className="shrink-0 font-medium text-brand-solid hover:underline"
              onClick={() => {
                handleJumpToMessage(pinNotice);
                setPinNotice(null);
              }}
            >
              {t("chat:pinned.view", { defaultValue: "Xem" })}
            </button>
          </div>
        </div>
      )}

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
            onPin={handleSelectionPin}
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
            conversationType={conversation.type}
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
            onShareLocation={handleShareLocation}
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


      {forwardMessages && (
        <React.Suspense fallback={null}>
          <ForwardModal
            messages={forwardMessages}
            currentUserId={currentUser.id}
            onClose={() => setForwardMessages(null)}
          />
        </React.Suspense>
      )}
      </div>

      {/* Search / Pinned panels — docked beside the chat (push it left, no
          scrim), matching the info panel behaviour */}
      <div
        className={clsx(
          "h-full shrink-0 overflow-hidden border-border/60 transition-[width] duration-300 ease-out",
          overlayMode === "search" || overlayMode === "pinned"
            ? "w-full max-w-[var(--app-inspector-width)] border-l"
            : "w-0 border-l-0",
        )}
        aria-hidden={
          overlayMode !== "search" && overlayMode !== "pinned"
            ? true
            : undefined
        }
      >
        {overlayMode === "search" && (
          <React.Suspense fallback={<OverlayPanelFallback />}>
            <SearchPanel
              conversationId={conversation.id}
              onSelectMessage={handleJumpToMessage}
              onNavigateToMessageId={handleNavigateToMessage}
              onClose={() => setOverlayMode(null)}
              className="h-full w-[var(--app-inspector-width)]"
            />
          </React.Suspense>
        )}

        {overlayMode === "pinned" && (
          <React.Suspense fallback={<OverlayPanelFallback />}>
        <PinnedMessagesPanel
              pinnedMessages={pinnedMessages}
              isLoading={isPinnedLoading}
              error={pinnedError}
              currentUserId={currentUser.id}
              onClose={() => setOverlayMode(null)}
              onJumpToMessage={handleJumpToMessage}
              onUnpin={(message) => togglePin({ ...message, isPinned: true })}
              className="h-full w-[var(--app-inspector-width)]"
            />
          </React.Suspense>
        )}
      </div>
    </section>
  );
};

export default ChatWindow;
