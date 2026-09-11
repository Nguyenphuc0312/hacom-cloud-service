import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DragEvent } from "react";
import {
  ArrowUturnLeftIcon as RotateCcw,
  ClipboardDocumentIcon as Copy,
  MagnifyingGlassIcon as Search,
  ShareIcon as Share2,
  TrashIcon as Trash2,
  XMarkIcon as X,
} from "@heroicons/react/24/outline";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ChatHeader } from "../../../components/chat/ChatHeader";
import { ForwardModal } from "../../../components/chat/ForwardModal";
import { PinnedMessageBar } from "../../../components/chat/PinnedMessageBar";
import PinnedMessagesPanel from "../../../components/chat/PinnedMessagesPanel";
import { MessageInput } from "../../../components/input/MessageInput";
import { ConversationLane } from "../../../components/layout/ConversationLane";
import { Sidebar } from "../../../components/layout/Sidebar";
import { InlineNotice, toast } from "../../../components/ui";
import { SimpleVirtualizedChatTimeline } from "../../chat/simple-virtual-timeline";
import { useResponsive } from "../../../responsive/responsive";
import { AppShell, ModuleSidebar } from "../../../shared/layout";
import { useAuthStore } from "../../../stores/authStore";
import { useChatStore } from "../../../stores/chatStore";
import {
  RoomType,
  UserStatus,
  type Conversation,
  type Message,
  type UserSummary,
} from "../../../types";
import { resolveChatLayoutProfile } from "../../../utils/densityPolicy";
import { useEnrichedProfileStore } from "../../../stores/enrichedProfileStore";
import { usePinnedMessages } from "../../../hooks/usePinnedMessages";
import { CLOUD_CONVERSATION_ID, CLOUD_MAX_UPLOAD_BYTES } from "../constants";
import {
  CloudConversationAvatar,
  CloudConversationEntry,
} from "../components/CloudConversationEntry";
import { CloudDeleteDialog } from "../components/CloudDeleteDialog";
import { CloudConversationInfoPanel } from "../components/CloudConversationInfoPanel";
import { useCloudWorkspace } from "../hooks/useCloudWorkspace";
import type {
  CloudItem,
  CloudUploadProgress,
  CloudViewMode,
} from "../types";
import { cloudItemsToMessages } from "../utils/cloudMessageAdapter";
import {
  formatCloudTime,
  getCloudItemPreview,
  getCloudItemTitle,
  isTrashItemExpired,
} from "../utils/cloudFormat";
import { resolveCloudUserId } from "../utils/cloudIdentity";
import {
  resolveMessageIdAtY,
  shouldShowCloudSelectionToolbar,
} from "../utils/cloudSelection";
import {
  applyCloudDeleteDragGhost,
  decodeCloudDeleteDrag,
  encodeCloudDeleteDrag,
  isCloudDeleteDrag,
  resolveCloudDeleteDragSource,
  type CloudDeleteDragPayload,
} from "../utils/cloudDeleteDrag";
import {
  attachmentStatusForCloudProgress,
  getCloudErrorTranslationKey,
  getCloudMessageSearchText,
  getMessageRangeIds,
  isStandaloneHttpUrl,
  stripCloudRichText,
} from "../utils/cloudPageUtils";
import { encodeMessageDrag } from "../../chat/quickForward";
import { ROUTE_PATHS } from "../../../router/paths";
import {
  ATTACHMENT_CONSTRAINTS,
  createAttachmentDraft,
  isBlockingAttachmentDraft,
  isDuplicateFile,
  isFinalizedAttachmentDraft,
  type AttachmentDraft,
} from "../../../types/attachmentDraft";
import "../styles/cloud.css";

type CloudSelectionDrag = {
  startId: string;
  startX: number;
  startY: number;
  active: boolean;
  selecting: boolean;
  startedOnMessage: boolean;
  baseSelection: Set<string>;
  lastMessageId?: string;
  holdTimer?: number;
};

type CloudDeleteDragState = CloudDeleteDragPayload & { over: boolean };

type CloudSelectionPointEvent = Pick<
  PointerEvent,
  "clientX" | "clientY" | "target"
>;

export default function CloudPage() {
  const { t } = useTranslation("cloud");
  const navigate = useNavigate();
  const authUser = useAuthStore((state) => state.user);
  const { width, chatLayoutBreakpoint } = useResponsive();
  const [draft, setDraft] = useState("");
  const [draftResetKey, setDraftResetKey] = useState(0);
  const [search, setSearch] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // The dedicated trash conversation view is intentionally disabled. Trash
  // content is managed from the Cloud info/gallery surfaces instead.
  const [viewMode] = useState<CloudViewMode>("active");
  const [trashNow, setTrashNow] = useState(() => Date.now());
  const [deleteTarget, setDeleteTarget] = useState<CloudItem | null>(null);
  const [selectedDeleteItems, setSelectedDeleteItems] = useState<CloudItem[]>([]);
  const [cloudForwardMessages, setCloudForwardMessages] = useState<Message[] | null>(null);
  const timelineScrollTopRef = useRef<number | null>(null);
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);
  const [isPinnedPanelOpen, setIsPinnedPanelOpen] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const isSelectionModeRef = useRef(false);
  const selectedMessageIdsRef = useRef<Set<string>>(new Set());
  const suppressSelectionClickRef = useRef(false);
  const [cloudDeleteDrag, setCloudDeleteDrag] =
    useState<CloudDeleteDragState | null>(null);
  const cloudDeleteDragRef = useRef<CloudDeleteDragState | null>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [jumpToMessageId, setJumpToMessageId] = useState<string | null>(null);
  const [jumpNonce, setJumpNonce] = useState(0);
  const selectionDragRef = useRef<CloudSelectionDrag | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentDraft[]>(
    [],
  );
  const pendingAttachmentsRef = useRef<AttachmentDraft[]>([]);
  const pendingUploadIdsRef = useRef<Set<string>>(new Set());
  const pendingUploadCountRef = useRef(0);
  const [isUploadingPendingAttachments, setIsUploadingPendingAttachments] =
    useState(false);
  const cloudUserId = resolveCloudUserId(authUser?.id);
  // Search is performed against the already loaded My Documents timeline,
  // matching Hacom Chat's local panel behavior. Do not refetch the Cloud
  // bundle for every keystroke (that caused the red Cloud error banner).
  const workspace = useCloudWorkspace(cloudUserId);

  useEffect(() => {
    const intervalId = window.setInterval(() => setTrashNow(Date.now()), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  // My Documents uses the same pin contract as ordinary Hacom Chat
  // conversations.  Keeping this hook here makes pin state, optimistic
  // updates and the pinned-message panel behave identically in both views.
  const {
    pinnedMessages,
    togglePin,
    removePin,
    isLoading: isPinnedLoading,
    error: pinnedError,
  } = usePinnedMessages(CLOUD_CONVERSATION_ID, { localFallback: true });

  const captureTimelineScroll = useCallback(() => {
    const element = document.querySelector<HTMLElement>(
      '[data-testid="simple-timeline-scroll"]',
    );
    timelineScrollTopRef.current = element?.scrollTop ?? null;
  }, []);

  const restoreTimelineScroll = useCallback(() => {
    const top = timelineScrollTopRef.current;
    if (top === null || typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(
        '[data-testid="simple-timeline-scroll"]',
      );
      if (!element) return;
      element.scrollTop = top;
      window.requestAnimationFrame(() => {
        element.scrollTop = top;
      });
    });
  }, []);

  useEffect(() => {
    if (!isSearchOpen || typeof window === "undefined") return;
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
      restoreTimelineScroll();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isSearchOpen, restoreTimelineScroll]);
  const fetchConversations = useChatStore((state) => state.fetchConversations);
  const hasFetchedConversationsOnce = useChatStore(
    (state) => state.hasFetchedConversationsOnce,
  );
  const isLoadingConversations = useChatStore(
    (state) => state.isLoadingConversations,
  );
  const conversationsError = useChatStore((state) => state.conversationsError);

  const currentUser = useMemo<UserSummary>(() => {
    if (authUser) {
      return {
        id: authUser.id,
        username: authUser.username,
        displayName:
          authUser.displayName ||
          authUser.effectiveDisplayName ||
          authUser.username,
        avatar: authUser.avatar,
        status: authUser.status as UserStatus,
        isBot: false,
      };
    }

    return {
      id: cloudUserId ?? "auth-pending",
      username: "user",
      displayName: "Ng??i d?ng",
      avatar: "",
      status: UserStatus.ONLINE,
      isBot: false,
    };
  }, [authUser, cloudUserId]);

  useLayoutEffect(() => {
    useEnrichedProfileStore
      .getState()
      .setEnrichedName(
        currentUser.id,
        currentUser.displayName || currentUser.username,
      );
  }, [currentUser.displayName, currentUser.id, currentUser.username]);

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  const updatePendingUploadProgress = useCallback(
    (localId: string, progress: CloudUploadProgress) => {
      setPendingAttachments((current) =>
        current.map((draft) =>
          draft.localId === localId
            ? {
                ...draft,
                status: attachmentStatusForCloudProgress(progress),
                progress: progress.percent,
                errorCode: undefined,
                errorMessage: undefined,
              }
            : draft,
        ),
      );
    },
    [],
  );

  // Match Hacom Chat's upload queue: selecting a file starts the upload
  // immediately. Drafts remain visible as "Đang chờ"/progress and the send
  // action is enabled only after every draft is finalized.
  useEffect(() => {
    const queued = pendingAttachments.filter(
      (draft) =>
        draft.status === "idle" &&
        Boolean(draft.file) &&
        !pendingUploadIdsRef.current.has(draft.localId),
    );
    if (queued.length === 0) return;

    queued.forEach((draft) => pendingUploadIdsRef.current.add(draft.localId));
    pendingUploadCountRef.current += queued.length;
    setIsUploadingPendingAttachments(true);

    void Promise.all(
      queued.map(async (draft) => {
        try {
          const item = await workspace.uploadFile(draft.file!, (progress) =>
            updatePendingUploadProgress(draft.localId, progress),
          );
          setPendingAttachments((current) =>
            current.map((currentDraft) =>
              currentDraft.localId === draft.localId
                ? {
                    ...currentDraft,
                    status:
                      item.status === "ready"
                        ? "finalized"
                        : item.status === "failed"
                          ? "failed"
                          : "security_pending",
                    progress: 100,
                    fileId: item.id,
                    errorCode: undefined,
                    errorMessage:
                      item.status === "failed" ? t("errors.generic") : undefined,
                  }
                : currentDraft,
            ),
          );
        } catch {
          setPendingAttachments((current) =>
            current.map((currentDraft) =>
              currentDraft.localId === draft.localId
                ? {
                    ...currentDraft,
                    status: "failed",
                    errorMessage: t("errors.generic"),
                  }
                : currentDraft,
            ),
          );
        } finally {
          pendingUploadIdsRef.current.delete(draft.localId);
          pendingUploadCountRef.current -= 1;
          if (pendingUploadCountRef.current <= 0) {
            pendingUploadCountRef.current = 0;
            setIsUploadingPendingAttachments(false);
          }
        }
      }),
    );
  }, [
    pendingAttachments,
    t,
    updatePendingUploadProgress,
    workspace.uploadFile,
  ]);

  // Completing an object upload only queues Cloud's verification worker. Keep
  // the draft blocked until the polled Cloud item itself becomes ready; this is
  // the same distinction Hacom Chat makes between upload and file processing.
  useEffect(() => {
    setPendingAttachments((current) => {
      let changed = false;
      const next = current.map((draft) => {
        if (draft.status !== "security_pending" || !draft.fileId) return draft;
        const item = workspace.items.find(
          (candidate) => candidate.id === draft.fileId,
        );
        if (!item || item.status === "pending" || item.status === "processing") {
          return draft;
        }
        if (item.status === "ready") {
          changed = true;
          return {
            ...draft,
            status: "finalized" as const,
            progress: 100,
            errorCode: undefined,
            errorMessage: undefined,
          };
        }
        if (item.status === "failed") {
          changed = true;
          return {
            ...draft,
            status: "failed" as const,
            errorMessage: t("errors.generic"),
          };
        }
        return draft;
      });
      return changed ? next : current;
    });
  }, [t, workspace.items]);

  useEffect(
    () => () => {
      pendingAttachmentsRef.current.forEach((draft) => {
        if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
      });
    },
    [],
  );

  useEffect(() => {
    if (!authUser || hasFetchedConversationsOnce || isLoadingConversations) {
      return;
    }
    void fetchConversations();
  }, [
    authUser,
    fetchConversations,
    hasFetchedConversationsOnce,
    isLoadingConversations,
  ]);

  const layoutState =
    chatLayoutBreakpoint === "compact"
      ? "mobile"
      : "normal";
  const layoutProfile = resolveChatLayoutProfile(width, layoutState);
  const isRightPanelOpen = isInfoPanelOpen || isSearchOpen || isPinnedPanelOpen;

  const conversation = useMemo<Conversation>(
    () => ({
      id: CLOUD_CONVERSATION_ID,
      type: RoomType.GROUP,
      name: t("workspace.title"),
      avatar: null,
      unreadCount: 0,
      isPinned: true,
      isMuted: false,
      isArchived: false,
      isBlocked: false,
      participants: [currentUser],
      participantCount: 1,
      createdBy: currentUser.id,
      currentUserId: currentUser.id,
      canCurrentUserSend: true,
      createdAt: new Date(0),
      updatedAt: new Date(),
    }),
    [currentUser, t],
  );

  const cloudItems = workspace.items;
  const cloudTrashItems = workspace.trashItems;

  const messages = useMemo(
    () => {
      const pinnedIds = new Set(pinnedMessages.map((message) => message.id));
      return cloudItemsToMessages(
        cloudItems,
        currentUser,
        {
        link: t("item.untitledLink"),
        file: t("item.untitledFile"),
        },
      )
        .map((message) => ({ ...message, isPinned: pinnedIds.has(message.id) }))
        .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
    },
    [cloudItems, currentUser, pinnedMessages, t],
  );

  const visibleMessages = useMemo(() => {
    return messages;
  }, [messages]);

  const searchResults = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return [];
    return messages.filter((message) =>
      getCloudMessageSearchText(message).toLocaleLowerCase().includes(query),
    );
  }, [messages, search]);

  const visibleTrashItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const liveTrashItems = cloudTrashItems.filter((item) => !isTrashItemExpired(item, trashNow));
    if (!query) return liveTrashItems;
    return liveTrashItems.filter((item) => {
      const title = getCloudItemTitle(item, {
        text: t("item.untitledText"),
        link: t("item.untitledLink"),
        file: t("item.untitledFile"),
      });
      return `${title} ${getCloudItemPreview(item)}`
        .toLocaleLowerCase()
        .includes(query);
    });
  }, [cloudTrashItems, search, t, trashNow]);

  const trashMessages = useMemo(() => {
    const pinnedIds = new Set(pinnedMessages.map((message) => message.id));
    return cloudItemsToMessages(visibleTrashItems, currentUser, {
        link: t("item.untitledLink"),
        file: t("item.untitledFile"),
      }).map((message) => ({ ...message, isPinned: pinnedIds.has(message.id) }));
  }, [currentUser, pinnedMessages, t, visibleTrashItems]);

  const showPhaseNotice = useCallback(() => {
    toast.info(t("workspace.phaseAction"));
  }, [t]);

  const handleSend = useCallback(
    async (rawContent?: string) => {
      const content = stripCloudRichText(rawContent ?? "");
      // Files are uploaded as soon as they are selected. Only a failed or
      // interrupted draft still needs an upload during an explicit retry.
      const attachments = pendingAttachments.filter(
        (draft) => draft.file && !isFinalizedAttachmentDraft(draft),
      );

      if (!content && pendingAttachments.length === 0) return;

      if (attachments.length > 0) {
        setIsUploadingPendingAttachments(true);
        let failed = false;
        try {
          for (const draft of attachments) {
            try {
              const item = await workspace.uploadFile(draft.file!, (progress) =>
                updatePendingUploadProgress(draft.localId, progress),
              );
              if (item.status === "ready") {
                setPendingAttachments((current) =>
                  current.filter((candidate) => candidate.localId !== draft.localId),
                );
                if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
              } else {
                failed = true;
                setPendingAttachments((current) =>
                  current.map((candidate) =>
                    candidate.localId === draft.localId
                      ? {
                          ...candidate,
                          fileId: item.id,
                          progress: 100,
                          status:
                            item.status === "failed"
                              ? "failed"
                              : "security_pending",
                          errorMessage:
                            item.status === "failed"
                              ? t("errors.generic")
                              : undefined,
                        }
                      : candidate,
                  ),
                );
              }
            } catch {
              failed = true;
              setPendingAttachments((current) =>
                current.map((item) =>
                  item.localId === draft.localId
                    ? {
                        ...item,
                        status: "failed",
                        errorMessage: t("errors.generic"),
                      }
                    : item,
                ),
              );
            }
          }
        } finally {
          setIsUploadingPendingAttachments(false);
        }

        // Keep failed drafts visible so the user can remove/retry them. Do not
        // create a text item when an attachment in the same send failed.
        if (failed) return;
      }

      // A finalized item has already been persisted by Cloud. Remove only
      // the local composer drafts after the user confirms the send; do not
      // issue a second upload request.
      if (pendingAttachments.length > 0) {
        setPendingAttachments((current) => {
          current.forEach((draft) => {
            if (isFinalizedAttachmentDraft(draft) && draft.previewUrl) {
              URL.revokeObjectURL(draft.previewUrl);
            }
          });
          return current.filter((draft) => !isFinalizedAttachmentDraft(draft));
        });
      }

      if (content) {
        if (isStandaloneHttpUrl(content)) {
          await workspace.createLink(content, "");
        } else {
          await workspace.createText(content);
          /* Legacy local-message object intentionally removed; text is now persisted via Cloud API.
            {
              id: `local-text-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : now.getTime()}`,
              conversationId: CLOUD_CONVERSATION_ID,
              senderId: currentUser.id,
              senderName: currentUser.displayName || currentUser.username || "Bạn",
              content,
              plainText: content,
              contentFormat: "plain_text",
              type: MessageType.TEXT,
              status: MessageStatus.SENT,
              sendState: "sent",
              isEdited: false,
              isPinned: false,
              isDeleted: false,
              lifecycleStatus: "active",
              isSystem: false,
              reactions: [],
              createdAt: now,
              serverTs: now,
              updatedAt: now,
              readBy: [currentUser.id],
            } as Message,
          */
        }
      }
      setDraft("");
      setDraftResetKey((value) => value + 1);
    },
    [pendingAttachments, t, updatePendingUploadProgress, workspace],
  );

  useEffect(() => {
    isSelectionModeRef.current = isSelectionMode;
  }, [isSelectionMode]);

  useEffect(() => {
    selectedMessageIdsRef.current = selectedMessageIds;
    if (isSelectionMode && selectedMessageIds.size === 0) {
      setIsSelectionMode(false);
    }
  }, [isSelectionMode, selectedMessageIds]);

  useEffect(() => {
    setIsSelectionMode(false);
    setSelectedMessageIds(new Set());
  }, [viewMode]);

  const enterSelectionMode = useCallback(() => {
    setIsSelectionMode(true);
  }, []);

  const toggleMessageSelection = useCallback((messageId: string) => {
    setSelectedMessageIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      if (next.size === 0) setIsSelectionMode(false);
      return next;
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedMessageIds(new Set());
  }, []);

  // Allow a Telegram/Zalo-style click-drag gesture to select messages without
  // opening each message menu. Selection starts only after the pointer moves
  // a few pixels, so an ordinary click keeps its normal message behavior.
  useEffect(() => {
    const finishDrag = () => {
      if (selectionDragRef.current?.holdTimer) {
        window.clearTimeout(selectionDragRef.current.holdTimer);
      }
      if (selectionDragRef.current?.active) {
        // A pointer drag can emit a synthetic click on release. That click
        // must not immediately undo the last message selected by the drag.
        suppressSelectionClickRef.current = true;
        window.setTimeout(() => {
          suppressSelectionClickRef.current = false;
        }, 0);
      }
      selectionDragRef.current = null;
      document.body.style.userSelect = "";
    };

    const applySelectionRange = (drag: CloudSelectionDrag, messageId: string) => {
      if (drag.lastMessageId === messageId) return;

      const selectableMessages = viewMode === "trash" ? trashMessages : messages;
      const rangeIds = getMessageRangeIds(selectableMessages, drag.startId, messageId);
      if (rangeIds.length === 0) return;

      drag.lastMessageId = messageId;
      setSelectedMessageIds(() => {
        const next = new Set(drag.baseSelection);
        for (const rangeId of rangeIds) {
          if (drag.selecting) next.add(rangeId);
          else next.delete(rangeId);
        }
        return next;
      });
    };

    const resolveMessageIdAtPointer = (
      event: CloudSelectionPointEvent,
      selectableMessages: readonly Message[],
    ): string | undefined => {
      const timeline = document.querySelector<HTMLElement>(
        ".cloud-chat-page [data-testid='simple-timeline-scroll']",
      );
      if (!timeline) return undefined;

      const timelineRect = timeline.getBoundingClientRect();
      if (
        event.clientX < timelineRect.left ||
        event.clientX > timelineRect.right ||
        event.clientY < timelineRect.top ||
        event.clientY > timelineRect.bottom
      ) {
        return undefined;
      }

      const selectableIds = new Set(selectableMessages.map((message) => message.id));
      const target = event.target as HTMLElement | null;
      const directRow = target?.closest<HTMLElement>("[data-message-id]");
      const directId = directRow?.dataset.messageId;
      if (
        directRow &&
        directId &&
        timeline.contains(directRow) &&
        selectableIds.has(directId)
      ) {
        return directId;
      }

      const bounds = Array.from(
        timeline.querySelectorAll<HTMLElement>("[data-message-id]"),
      ).flatMap((row) => {
        const id = row.dataset.messageId;
        if (!id || !selectableIds.has(id)) return [];
        const rect = row.getBoundingClientRect();
        return [{ id, top: rect.top, bottom: rect.bottom }];
      });
      return resolveMessageIdAtY(bounds, event.clientY);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      // Links, file cards and video surfaces are selectable too. Only native
      // controls should keep their own click/drag behavior.
      if (!target || target.closest("button,input,select,textarea")) return;
      const selectableMessages = viewMode === "trash" ? trashMessages : messages;
      const messageId = resolveMessageIdAtPointer(event, selectableMessages);
      if (!messageId) return;
      const startedOnMessage = Boolean(target.closest("[data-message-id]"));
      const isTextSelectionTarget = Boolean(target.closest(".chat-message-text"));
      const selection: CloudSelectionDrag = {
        startId: messageId,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
        selecting: !selectedMessageIdsRef.current.has(messageId),
        startedOnMessage,
        baseSelection: new Set(selectedMessageIdsRef.current),
      };
      // Desktop users commonly hold a message instead of dragging. Start the
      // same selection mode after a short hold, while preserving normal click
      // behavior for a quick release. Text starts intentionally do not use a
      // hold timer, so a slow native text selection is never converted into a
      // whole-message selection.
      if (!isTextSelectionTarget) {
        selection.holdTimer = window.setTimeout(() => {
          const current = selectionDragRef.current;
          if (current !== selection) return;
          current.active = true;
          document.body.style.userSelect = "none";
          window.getSelection()?.removeAllRanges();
          enterSelectionMode();
          applySelectionRange(current, current.startId);
          suppressSelectionClickRef.current = true;
        }, 450);
      }
      selectionDragRef.current = selection;
    };

    const handlePointerMove = (event: PointerEvent) => {
      const drag = selectionDragRef.current;
      if (!drag) return;
      if (drag.holdTimer) {
        window.clearTimeout(drag.holdTimer);
        drag.holdTimer = undefined;
      }
      const distance = Math.hypot(
        event.clientX - drag.startX,
        event.clientY - drag.startY,
      );

      const selectableMessages = viewMode === "trash" ? trashMessages : messages;
      const messageId = resolveMessageIdAtPointer(event, selectableMessages);
      if (!messageId) return;

      // Keep native browser text selection while the pointer remains inside
      // the message where the gesture started. Message selection begins only
      // after the pointer enters another message frame.
      if (!drag.active && messageId === drag.startId && drag.startedOnMessage) return;
      if (!drag.active && distance < 8) return;

      if (!drag.active) {
        drag.active = true;
        document.body.style.userSelect = "none";
        window.getSelection()?.removeAllRanges();
        enterSelectionMode();
        applySelectionRange(drag, drag.startId);
      }

      applySelectionRange(drag, messageId);
      event.preventDefault();
    };

    const handleSelectionClick = (event: MouseEvent) => {
      if (!isSelectionModeRef.current) return;
      if (suppressSelectionClickRef.current) {
        suppressSelectionClickRef.current = false;
        return;
      }
      const target = event.target as HTMLElement | null;
      // While selection mode is active, the message surface owns the click.
      // In particular, a video click must toggle the row instead of reaching
      // the native player/preview. Explicit controls and links keep their own
      // behavior; video returns to normal as soon as selection mode exits.
      if (!target || target.closest("button,input,select,textarea,a")) {
        return;
      }
      const selectableMessages = viewMode === "trash" ? trashMessages : messages;
      const messageId = resolveMessageIdAtPointer(event, selectableMessages);
      if (!messageId) return;
      event.preventDefault();
      event.stopPropagation();
      toggleMessageSelection(messageId);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerup", finishDrag, true);
    document.addEventListener("pointercancel", finishDrag, true);
    document.addEventListener("click", handleSelectionClick, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerup", finishDrag, true);
      document.removeEventListener("pointercancel", finishDrag, true);
      document.removeEventListener("click", handleSelectionClick, true);
      finishDrag();
    };
  }, [enterSelectionMode, messages, toggleMessageSelection, trashMessages, viewMode]);

  const handleAddFiles = useCallback(
    (files: File[]) => {
      const errors: string[] = [];
      let acceptedCount = 0;

      setPendingAttachments((current) => {
        const next = [...current];
        for (const file of files) {
          const activeCount = next.length;
          if (activeCount >= ATTACHMENT_CONSTRAINTS.maxFilesPerMessage) {
            errors.push(
              t("composer.errors.tooManyFiles", {
                max: ATTACHMENT_CONSTRAINTS.maxFilesPerMessage,
                defaultValue: `Bạn chỉ có thể chọn tối đa ${ATTACHMENT_CONSTRAINTS.maxFilesPerMessage} tệp.`,
              }),
            );
            break;
          }
          if (file.size <= 0) {
            errors.push(t("composer.errors.emptyFile"));
          } else if (file.size > CLOUD_MAX_UPLOAD_BYTES) {
            errors.push(t("composer.errors.fileTooLarge"));
          } else if (
            next.some((draft) => isDuplicateFile(draft, file))
          ) {
            errors.push(
              t("composer.errors.duplicateFile", {
                defaultValue: `${file.name} đã được chọn.`,
              }),
            );
          } else if (
            next.reduce((total, draft) => total + draft.sizeBytes, 0) +
              file.size >
            ATTACHMENT_CONSTRAINTS.maxTotalSize
          ) {
            errors.push(
              t("composer.errors.totalTooLarge", {
                defaultValue: "Tổng dung lượng tệp vượt quá giới hạn cho phép.",
              }),
            );
          } else {
            next.push(
              createAttachmentDraft(file, {
                purpose: "message_attachment",
                conversationId: CLOUD_CONVERSATION_ID,
              }),
            );
            acceptedCount += 1;
          }
        }
        return next;
      });

      return { errors, acceptedCount };
    },
    [t],
  );

  const handleRemovePendingAttachment = useCallback((localId: string) => {
    if (isUploadingPendingAttachments) return;
    setPendingAttachments((current) => {
      const draft = current.find((item) => item.localId === localId);
      if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl);
      return current.filter((item) => item.localId !== localId);
    });
  }, [isUploadingPendingAttachments]);

  const handleClearPendingAttachments = useCallback(() => {
    if (isUploadingPendingAttachments) return;
    setPendingAttachments((current) => {
      current.forEach((draft) => {
        if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
      });
      return [];
    });
  }, [isUploadingPendingAttachments]);

  const handleRetryPendingAttachment = useCallback(
    (localId: string) => {
      if (isUploadingPendingAttachments) return;
      setPendingAttachments((current) =>
        current.map((draft) =>
          draft.localId === localId
            ? {
                ...draft,
                status: "idle",
                progress: 0,
                errorCode: undefined,
                errorMessage: undefined,
              }
            : draft,
        ),
      );
    },
    [isUploadingPendingAttachments],
  );

  const handleSendAudio = useCallback(
    async (file: File) => {
      await workspace.uploadFile(file);
    },
    [workspace],
  );

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      navigate(`/chat/${conversationId}`);
    },
    [navigate],
  );

  const handleCloudForward = useCallback(
    (message: Message) => {
      if (viewMode !== "active") return;
      setCloudForwardMessages([message]);
    },
    [viewMode],
  );

  const noopMessageAction = useCallback(
    (_message: Message) => {
      void _message;
      showPhaseNotice();
    },
    [showPhaseNotice],
  );

  const noopMessageIdAction = useCallback(
    (_messageId: string) => {
      void _messageId;
      showPhaseNotice();
    },
    [showPhaseNotice],
  );

  const handleDeleteRequest = useCallback(
    (messageId: string) => {
      const item = workspace.items.find(
        (candidate) => candidate.id === messageId,
      );
      if (item) {
        captureTimelineScroll();
        setSelectedDeleteItems([]);
        setDeleteTarget(item);
      }
    },
    [captureTimelineScroll, workspace.items],
  );

  const handleCloudPin = useCallback(
    async (messageId: string) => {
      const message = [...messages, ...trashMessages].find(
        (candidate) => candidate.id === messageId,
      );
      if (!message) return;
      await togglePin(message);
    },
    [messages, togglePin, trashMessages],
  );

  const handlePinnedJump = useCallback((message: Message) => {
    setIsPinnedPanelOpen(false);
    setIsInfoPanelOpen(false);
    setIsSearchOpen(false);
    setJumpToMessageId(message.id);
    setJumpNonce((nonce) => nonce + 1);
  }, []);

  const handleViewOriginalResource = useCallback(
    (item: CloudItem) => {
      setIsInfoPanelOpen(false);
      setJumpToMessageId(item.id);
      setJumpNonce((nonce) => nonce + 1);
    },
    [],
  );

  const handleTrashPermanentDeleteRequest = useCallback(
    (messageId: string) => {
      const item = workspace.trashItems.find(
        (candidate) => candidate.id === messageId,
      );
      if (item) {
        captureTimelineScroll();
        setSelectedDeleteItems([]);
        setDeleteTarget(item);
      }
    },
    [captureTimelineScroll, workspace.trashItems],
  );

  // Cloud media messages are not chat-store drafts, so the generic chat
  // retry action cannot resend them. Reconcile the Cloud read model instead;
  // this rehydrates a newly completed upload and clears transient failures
  // without creating a duplicate item.
  const handleRetryCloudMessage = useCallback(async (_message: Message) => {
    await workspace.refresh();
  }, [workspace]);

  const handleTrash = useCallback(
    async (itemId: string) => {
      await workspace.trashItem(itemId);
      // Deleting a pinned Cloud item must remove the corresponding pin too.
      // Do this after the Cloud state transition succeeds so a failed delete
      // never loses a valid pin.
      await removePin(itemId);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("message:deleted", {
            detail: { conversationId: CLOUD_CONVERSATION_ID, messageId: itemId },
          }),
        );
      }
    },
    [removePin, workspace],
  );

  const handleRestore = useCallback(
    async (itemId: string) => {
      await workspace.restoreItem(itemId);
    },
    [workspace],
  );

  const handlePermanentDelete = useCallback(
    async (itemId: string) => {
      await workspace.permanentlyDeleteItem(itemId);
      // Permanent delete is also a destructive pin action. Keep the pin bar,
      // pin counter and pin panel in sync with the deleted item.
      await removePin(itemId);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("message:deleted", {
            detail: { conversationId: CLOUD_CONVERSATION_ID, messageId: itemId },
          }),
        );
      }
    },
    [removePin, workspace],
  );

  const selectedMessages = useMemo(
    () => messages.filter((message) => selectedMessageIds.has(message.id)),
    [messages, selectedMessageIds],
  );
  const selectedCloudItems = useMemo(
    () => cloudItems.filter((item) => selectedMessageIds.has(item.id)),
    [cloudItems, selectedMessageIds],
  );
  const selectedTrashItems = useMemo(
    () => cloudTrashItems.filter((item) => selectedMessageIds.has(item.id)),
    [cloudTrashItems, selectedMessageIds],
  );
  const showSelectionToolbar = shouldShowCloudSelectionToolbar(
    isSelectionMode,
    selectedMessageIds.size,
  );

  const setCloudDeleteDragState = useCallback(
    (next: CloudDeleteDragState | null) => {
      cloudDeleteDragRef.current = next;
      setCloudDeleteDrag(next);
    },
    [],
  );

  const handleCloudDeleteDragStart = useCallback(
    (messageId: string, event: DragEvent<HTMLDivElement>) => {
      const message = messages.find((candidate) => candidate.id === messageId);
      if (!message) return;
      const payload = resolveCloudDeleteDragSource({
        message,
        isSelectionMode,
        isSelected: selectedMessageIds.has(messageId),
        selectedMessageIds,
      });
      if (!payload) return;

      // Carry both contracts. A room in the left sidebar consumes the shared
      // forward payload; the composer/panel consumes the Cloud trash payload.
      encodeMessageDrag(event.dataTransfer, {
        messageId,
        messageIds: payload.itemIds,
        sourceConversationId: message.conversationId,
        label: getCloudItemTitle(
          cloudItems.find((item) => item.id === messageId) ??
            ({ type: "file" } as CloudItem),
          {
            text: t("item.untitledText"),
            link: t("item.untitledLink"),
            file: t("item.untitledFile"),
          },
        ),
      });
      if (!encodeCloudDeleteDrag(event.dataTransfer, payload)) return;

      const selectionDrag = selectionDragRef.current;
      if (selectionDrag?.holdTimer) window.clearTimeout(selectionDrag.holdTimer);
      selectionDragRef.current = null;
      document.body.style.userSelect = "";
      suppressSelectionClickRef.current = true;
      window.setTimeout(() => {
        suppressSelectionClickRef.current = false;
      }, 0);

      const firstItem = cloudItems.find((item) => item.id === payload.itemIds[0]);
      applyCloudDeleteDragGhost(
        event.dataTransfer,
        firstItem?.title || t("item.untitledFile"),
        payload.itemIds.length,
      );
      setCloudDeleteDragState({ ...payload, over: false });
    },
    [cloudItems, isSelectionMode, messages, selectedMessageIds, setCloudDeleteDragState, t],
  );

  const handleCloudSelectionLaneDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const firstSelectedId = messages.find((message) =>
        selectedMessageIds.has(message.id),
      )?.id;
      if (!firstSelectedId) {
        event.preventDefault();
        return;
      }
      handleCloudDeleteDragStart(firstSelectedId, event);
    },
    [handleCloudDeleteDragStart, messages, selectedMessageIds],
  );

  const handleCloudDeleteDragEnd = useCallback(() => {
    setCloudDeleteDragState(null);
  }, [setCloudDeleteDragState]);

  const handleCloudDeleteDragEnter = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (!isCloudDeleteDrag(event.dataTransfer)) return;
      event.preventDefault();
      const current = cloudDeleteDragRef.current;
      if (current && !current.over) setCloudDeleteDragState({ ...current, over: true });
    },
    [setCloudDeleteDragState],
  );

  const handleCloudDeleteDragOver = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (!isCloudDeleteDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const current = cloudDeleteDragRef.current;
      if (current && !current.over) setCloudDeleteDragState({ ...current, over: true });
    },
    [setCloudDeleteDragState],
  );

  const handleCloudDeleteDragLeave = useCallback(
    (event: DragEvent<HTMLElement>) => {
      const nextTarget = event.relatedTarget as Node | null;
      if (nextTarget && event.currentTarget.contains(nextTarget)) return;
      const current = cloudDeleteDragRef.current;
      if (current?.over) setCloudDeleteDragState({ ...current, over: false });
    },
    [setCloudDeleteDragState],
  );

  const handleCloudDeleteDrop = useCallback(
    async (event: DragEvent<HTMLElement>) => {
      if (!isCloudDeleteDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      const payload = decodeCloudDeleteDrag(event.dataTransfer);
      setCloudDeleteDragState(null);
      if (!payload || workspace.isMutating) return;

      const activeItemsById = new Map(
        cloudItems
          .filter((item) => item.status !== "trashed" && item.status !== "deleted")
          .map((item) => [item.id, item]),
      );
      const validItems = payload.itemIds
        .map((itemId) => activeItemsById.get(itemId))
        .filter((item): item is CloudItem => Boolean(item));
      if (validItems.length === 0) return;

      captureTimelineScroll();
      let deletedCount = 0;
      for (const item of validItems) {
        try {
          await handleTrash(item.id);
          deletedCount += 1;
        } catch {
          // The workspace already exposes the actionable API error banner.
        }
      }
      restoreTimelineScroll();
      if (deletedCount > 0) {
        toast.success(
          deletedCount > 1
            ? `Đã đưa ${deletedCount} mục vào Thùng rác`
            : "Đã đưa mục vào Thùng rác",
        );
      }
      if (payload.source === "selection" && deletedCount === validItems.length) {
        exitSelectionMode();
      }
    },
    [
      captureTimelineScroll,
      cloudItems,
      exitSelectionMode,
      handleTrash,
      restoreTimelineScroll,
      setCloudDeleteDragState,
      workspace.isMutating,
    ],
  );

  const handleDeleteSelected = useCallback(async () => {
    if (selectedCloudItems.length === 0) {
      exitSelectionMode();
      return;
    }
    captureTimelineScroll();
    setSelectedDeleteItems(selectedCloudItems);
    setDeleteTarget(selectedCloudItems[0]);
  }, [captureTimelineScroll, cloudItems, exitSelectionMode, selectedCloudItems, selectedMessages]);

  const handleTrashDeleteSelected = useCallback(() => {
    if (selectedTrashItems.length === 0) {
      exitSelectionMode();
      return;
    }
    captureTimelineScroll();
    setSelectedDeleteItems(selectedTrashItems);
    setDeleteTarget(selectedTrashItems[0]);
  }, [captureTimelineScroll, exitSelectionMode, selectedTrashItems]);

  const handleRestoreSelected = useCallback(async () => {
    if (selectedTrashItems.length === 0) {
      exitSelectionMode();
      return;
    }
    try {
      for (const item of selectedTrashItems) {
        await handleRestore(item.id);
      }
    } finally {
      exitSelectionMode();
    }
  }, [exitSelectionMode, handleRestore, selectedTrashItems]);

  const handleDialogTrash = useCallback(async (itemId: string) => {
    const items = selectedDeleteItems.length > 0 ? selectedDeleteItems : [{ id: itemId } as CloudItem];
    // Process every selected item in deterministic order. The Cloud API owns
    // the state-machine decision; the UI must not reject an image/file merely
    // because its read model is still processing after upload.
    const remaining: CloudItem[] = [];
    try {
      for (const item of items) {
        try {
          await handleTrash(item.id);
        } catch {
          remaining.push(item);
        }
      }
    } finally {
      restoreTimelineScroll();
    }
    if (remaining.length > 0) {
      setSelectedDeleteItems(remaining);
      setDeleteTarget(remaining[0]);
      throw new Error("Some selected items still require permanent deletion");
    }
    setSelectedDeleteItems([]);
    exitSelectionMode();
  }, [exitSelectionMode, handleTrash, restoreTimelineScroll, selectedDeleteItems]);

  const handleDialogPermanentDelete = useCallback(async (itemId: string) => {
    const items = selectedDeleteItems.length > 0 ? selectedDeleteItems : [{ id: itemId } as CloudItem];
    const remaining: CloudItem[] = [];
    try {
      // Keep the calls sequential so every successful deletion is reconciled
      // before the next one starts; this is important for multi-select.
      for (const item of items) {
        try {
          await handlePermanentDelete(item.id);
        } catch {
          remaining.push(item);
        }
      }
    } finally {
      restoreTimelineScroll();
    }
    if (remaining.length > 0) {
      setSelectedDeleteItems(remaining);
      setDeleteTarget(remaining[0]);
      throw new Error("Some selected items could not be permanently deleted");
    }
    setSelectedDeleteItems([]);
    exitSelectionMode();
  }, [exitSelectionMode, handlePermanentDelete, restoreTimelineScroll, selectedDeleteItems]);

  const getSelectedShareText = useCallback(
    () => {
      const messagesForShare =
        viewMode === "trash"
          ? trashMessages.filter((message) => selectedMessageIds.has(message.id))
          : selectedMessages;
      return messagesForShare
        .map((message) => {
          const item = [...cloudItems, ...cloudTrashItems].find(
            (candidate) => candidate.id === message.id,
          );
          return item?.url || item?.content || item?.title || message.plainText || message.content || message.attachments?.[0]?.fileName || "";
        })
        .filter(Boolean)
        .join("\n");
    },
    [cloudItems, cloudTrashItems, selectedMessageIds, selectedMessages, trashMessages, viewMode],
  );

  const handleCopySelected = useCallback(async () => {
    const text = getSelectedShareText();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    exitSelectionMode();
  }, [exitSelectionMode, getSelectedShareText]);

  const handleShareSelected = useCallback(() => {
    if (viewMode !== "active" || selectedMessages.length === 0) return;
    setCloudForwardMessages(selectedMessages);
    exitSelectionMode();
  }, [exitSelectionMode, selectedMessages, viewMode]);

  return (
    <AppShell
      className="chat-page-shell cloud-chat-page"
      data-chat-layout-state={layoutState}
      moduleSidebar={
        <ModuleSidebar
          className="chat-page-module-sidebar cloud-chat-module-sidebar"
          contentClassName="min-h-0"
        >
          <div className="h-full min-h-0 w-full">
            <Sidebar
              layoutState={layoutState}
              currentUser={currentUser}
              selectedId={CLOUD_CONVERSATION_ID}
              leadingContent={
                <CloudConversationEntry
                  items={cloudItems}
                  isActive
                  layoutState={layoutState}
                  currentUserId={currentUser.id}
                  onSelect={() => undefined}
                />
              }
              showConversationSkeleton={
                isLoadingConversations && !hasFetchedConversationsOnce
              }
              conversationsError={conversationsError}
              onSelectConversation={handleSelectConversation}
              onRetryConversations={() => void fetchConversations()}
              onCurrentUserClick={() => navigate("/settings")}
            />
          </div>
        </ModuleSidebar>
      }
    >
      <section className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
        <div
          className={clsx(
            "chat-background chat-shell relative flex min-w-0 flex-1 flex-col overflow-hidden",
            isSelectionMode && "cloud-selection-mode",
          )}
          data-chat-layout-profile={layoutProfile}
          data-chat-layout-state={layoutState}
        >
          <ChatHeader
            conversation={conversation}
            currentUserId={currentUser.id}
            titleOverride={t("workspace.title")}
            subtitleOverride={
              viewMode === "trash"
                ? t("trash.headerSubtitle")
                : t("workspace.onlyYou")
            }
            avatarOverride={<CloudConversationAvatar size="sm" />}
            onBack={() => navigate("/chat")}
            onInfoClick={() => {
              setIsSearchOpen(false);
              setIsPinnedPanelOpen(false);
              setIsInfoPanelOpen((isOpen) => !isOpen);
            }}
            onSearchClick={() => {
              captureTimelineScroll();
              workspace.clearError();
              setIsInfoPanelOpen(false);
              setIsPinnedPanelOpen(false);
              setIsSearchOpen((value) => !value);
            }}
            onPinnedClick={() => {
              setIsInfoPanelOpen(false);
              setIsSearchOpen(false);
              setIsPinnedPanelOpen((isOpen) => !isOpen);
            }}
          />

          {pinnedMessages.length > 0 ? (
            <PinnedMessageBar
              pinnedMessages={pinnedMessages}
              currentUserId={currentUser.id}
              onJumpToMessage={handlePinnedJump}
              onOpenList={() => {
                setIsInfoPanelOpen(false);
                setIsSearchOpen(false);
                setIsPinnedPanelOpen(true);
              }}
            />
          ) : null}

          {workspace.error ? (
            <ConversationLane className="pt-3">
              <InlineNotice
                tone="error"
                message={t(getCloudErrorTranslationKey(workspace.error.code))}
                dismissible
                onDismiss={workspace.clearError}
                action={
                  <div className="flex items-center gap-2">
                    {workspace.error.requestId ? (
                      <span className="font-mono text-[10px] opacity-75">
                        {workspace.error.requestId.slice(0, 8)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-full px-2 py-1 text-xs font-semibold hover:bg-surface-overlay disabled:opacity-50"
                      onClick={() => void workspace.refresh()}
                      disabled={workspace.isRefreshing}
                    >
                      Thử lại
                    </button>
                  </div>
                }
              />
            </ConversationLane>
          ) : null}

          {viewMode === "active" ? (
            <SimpleVirtualizedChatTimeline
              conversationId={CLOUD_CONVERSATION_ID}
              conversationType={conversation.type}
              currentUserId={currentUser.id}
              messages={visibleMessages}
              onReply={noopMessageAction}
              onReact={noopMessageIdAction}
              onForward={handleCloudForward}
              onPin={handleCloudPin}
              onEdit={noopMessageAction}
              onDelete={handleDeleteRequest}
              onRetry={handleRetryCloudMessage}
              cloudMessageActionsOnly
              onCloudDeleteDragStart={handleCloudDeleteDragStart}
              onCloudDeleteDragEnd={handleCloudDeleteDragEnd}
              onCloudSelectionLaneDragStart={handleCloudSelectionLaneDragStart}
              hasMore={Boolean(workspace.nextCursor)}
              isLoadingMore={workspace.isLoadingMore}
              isInitialLoading={workspace.isLoading}
              onLoadMore={() => workspace.loadMore()}
              density="comfortable"
              layoutState={layoutState}
              isSelectionMode={isSelectionMode}
              selectedMessageIds={selectedMessageIds}
              onToggleSelect={toggleMessageSelection}
              onStartSelectionMode={enterSelectionMode}
              jumpToMessageId={jumpToMessageId}
              jumpNonce={jumpNonce}
              className="min-h-0 flex-1"
            />
          ) : (
            <SimpleVirtualizedChatTimeline
              conversationId={CLOUD_CONVERSATION_ID}
              conversationType={conversation.type}
              currentUserId={currentUser.id}
              messages={trashMessages}
              onReply={noopMessageAction}
              onReact={noopMessageIdAction}
              onForward={noopMessageAction}
              onPin={handleCloudPin}
              onEdit={noopMessageAction}
              onDelete={handleTrashPermanentDeleteRequest}
              onRetry={handleRetryCloudMessage}
              cloudMessageActionsOnly
              cloudTrashMode
              onRestoreCloudItem={handleRestore}
              jumpToMessageId={jumpToMessageId}
              jumpNonce={jumpNonce}
              hasMore={Boolean(workspace.trashNextCursor)}
              isLoadingMore={workspace.isLoadingMoreTrash}
              isInitialLoading={workspace.isLoadingTrash}
              onLoadMore={() => workspace.loadMoreTrash()}
              density="comfortable"
              layoutState={layoutState}
              className="min-h-0 flex-1"
            />
          )}

          <div className="sticky bottom-0 z-sticky shrink-0">
            {showSelectionToolbar ? (
              <div
                className="flex min-h-12 w-full items-center justify-between gap-2 border-t border-border/60 bg-surface px-3 py-2 shadow-sm"
                role="toolbar"
                aria-label={t("chat:selection.toolbar", {
                  defaultValue: "Thao tác với tin nhắn đã chọn",
                })}
              >
                <span className="shrink-0 text-sm font-semibold text-text-primary">
                  {t("chat:selection.selected", {
                    count: selectedMessageIds.size,
                    defaultValue: "Đã chọn {{count}}",
                  })}
                </span>
                <div className="flex min-w-0 items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => void handleCopySelected()}
                    disabled={selectedMessageIds.size === 0}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-40"
                  >
                    <Copy className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">{t("chat:message.actions.copy", { defaultValue: "Sao chép" })}</span>
                  </button>
                  {viewMode === "active" ? (
                    <button
                      type="button"
                      onClick={handleShareSelected}
                      disabled={selectedMessageIds.size === 0}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-40"
                    >
                      <Share2 className="h-4 w-4" aria-hidden />
                      <span className="hidden sm:inline">Chia sẻ</span>
                    </button>
                  ) : null}
                  {viewMode === "trash" ? (
                    <button
                      type="button"
                      onClick={() => void handleRestoreSelected()}
                      disabled={selectedMessageIds.size === 0 || workspace.isMutating}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-primary transition-colors hover:bg-primary/10 disabled:opacity-40"
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden />
                      <span className="hidden sm:inline">Khôi phục</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void (viewMode === "trash" ? handleTrashDeleteSelected() : handleDeleteSelected())}
                    disabled={selectedMessageIds.size === 0 || workspace.isMutating}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">
                      {viewMode === "trash"
                        ? "Xóa vĩnh viễn"
                        : t("chat:message.actions.delete", { defaultValue: "Xóa" })}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={exitSelectionMode}
                    className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover"
                  >
                    {t("common:actions.cancel", { defaultValue: "Hủy" })}
                  </button>
                </div>
              </div>
              ) : null}
            {viewMode === "active" ? (
              <MessageInput
                value={draft}
                valueResetKey={draftResetKey}
                onChange={setDraft}
                onSend={handleSend}
                mode="normal"
                conversationId={CLOUD_CONVERSATION_ID}
                conversationType="direct"
                currentUserId={currentUser.id}
                sendOnEnter
                disabled={workspace.isMutating}
                submitDisabled={workspace.isMutating}
                attachmentsDisabled={workspace.isMutating}
                cloudDeleteDropActive={cloudDeleteDrag !== null && !workspace.isMutating}
                cloudDeleteDropOver={cloudDeleteDrag?.over === true && !workspace.isMutating}
                onCloudDeleteDragEnter={handleCloudDeleteDragEnter}
                onCloudDeleteDragOver={handleCloudDeleteDragOver}
                onCloudDeleteDragLeave={handleCloudDeleteDragLeave}
                onCloudDeleteDrop={handleCloudDeleteDrop}
                cloudDeleteDropLabel={t("dragDelete.dropTarget", {
                  defaultValue: "Thả để đưa vào Thùng rác",
                })}
                composerMode="online"
                conversationName={t("workspace.title")}
                onAddFiles={handleAddFiles}
                onSendAudio={handleSendAudio}
                uploadDrafts={pendingAttachments}
                onRemoveDraft={handleRemovePendingAttachment}
                onCancelUpload={handleRemovePendingAttachment}
                onRetryUpload={handleRetryPendingAttachment}
                onClearAllDrafts={handleClearPendingAttachments}
                hasUploadingDrafts={
                  isUploadingPendingAttachments ||
                  pendingAttachments.some(
                    (draft) =>
                      draft.status === "idle" ||
                      isBlockingAttachmentDraft(draft),
                  )
                }
                hasFailedDrafts={pendingAttachments.some((draft) =>
                  ["failed", "expired", "cancelled"].includes(draft.status),
                )}
                hasReadyDrafts={
                  pendingAttachments.length > 0 &&
                  pendingAttachments.every(isFinalizedAttachmentDraft)
                }
              />
            ) : (
              <div className="cloud-trash-retention-note">
                <ConversationLane>
                  <p>{t("trash.retentionNotice")}</p>
                </ConversationLane>
              </div>
            )}
          </div>
        </div>
        <div
          className={clsx(
            "fixed inset-y-0 right-0 z-40 w-full max-w-full transform-gpu transition-transform duration-300 ease-out sm:max-w-[min(26rem,94vw)] xl:relative xl:z-0 xl:max-w-none xl:flex-shrink-0 xl:overflow-hidden xl:bg-transparent xl:transition-[width,border-color] xl:duration-300",
            isRightPanelOpen
              ? "translate-x-0 xl:w-[var(--app-inspector-width)] xl:border-l xl:border-border/60"
              : "translate-x-full xl:w-0 xl:border-l xl:border-border/0",
          )}
          aria-hidden={!isRightPanelOpen}
        >
          <div
            className={clsx(
              "h-full w-full transform-gpu bg-surface transition-[transform,opacity] duration-300 ease-out xl:absolute xl:inset-y-0 xl:right-0 xl:w-[var(--app-inspector-width)]",
              cloudDeleteDrag && "ring-2 ring-inset ring-danger/40",
              cloudDeleteDrag?.over && "bg-danger/5 ring-danger/70",
              isRightPanelOpen
                ? "translate-x-0 opacity-100"
                : "pointer-events-none translate-x-4 opacity-0 xl:translate-x-6",
            )}
            style={{ backgroundColor: "hsl(var(--color-sidebar-surface))" }}
            onDragEnter={cloudDeleteDrag ? handleCloudDeleteDragEnter : undefined}
            onDragOver={cloudDeleteDrag ? handleCloudDeleteDragOver : undefined}
            onDragLeave={cloudDeleteDrag ? handleCloudDeleteDragLeave : undefined}
            onDrop={cloudDeleteDrag ? handleCloudDeleteDrop : undefined}
          >
            {cloudDeleteDrag ? (
              <div
                className={clsx(
                  "pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-danger/5 text-danger transition-colors duration-200",
                  cloudDeleteDrag.over && "bg-danger/12",
                )}
                aria-hidden
              >
                <div className="flex items-center gap-2 rounded-full border border-danger/40 bg-surface/95 px-4 py-2 text-sm font-semibold shadow-lg">
                  <Trash2 className="h-5 w-5" />
                  Thả vào panel để đưa vào Thùng rác
                </div>
              </div>
            ) : null}
            {isSearchOpen ? (
              <aside className="flex h-full min-h-0 flex-col bg-surface" aria-label="Tìm kiếm tin nhắn">
                <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
                  <h2 className="text-sm font-semibold text-text-primary">
                    Tìm kiếm tin nhắn
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setIsSearchOpen(false);
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
                    aria-label={t("common.close")}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="shrink-0 px-4 py-3">
                  <label className="relative block">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                      aria-hidden
                    />
                    <input
                      ref={searchInputRef}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={t("search.placeholder")}
                      aria-label={t("search.aria")}
                      className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-8 text-sm text-text-primary placeholder:text-text-muted focus:border-[#1976D2]/60 focus:outline-none focus:ring-2 focus:ring-[#1976D2]/15"
                    />
                    {search ? (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:bg-surface-hover"
                        aria-label={t("common.close")}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </label>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {!search.trim() ? (
                    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                      <div className="mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-[#E8F2FF]">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#C9E1FF] text-[#1565C0]">
                          <Search className="h-8 w-8" aria-hidden />
                        </div>
                      </div>
                      <h3 className="text-sm font-semibold text-text-primary">
                        Tìm kiếm trong cuộc trò chuyện
                      </h3>
                      <p className="mt-2 max-w-[250px] text-xs leading-5 text-text-muted">
                        Hãy nhập từ khóa để bắt đầu tìm kiếm tin nhắn và file trong cuộc trò chuyện.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="border-y border-border/70 px-4 py-3 text-xs font-medium text-text-secondary">
                        {searchResults.length > 0 ? `1 / ${searchResults.length} kết quả` : "0 kết quả"}
                      </div>
                      {searchResults.length > 0 ? (
                        <>
                          <p className="px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-text-muted">
                            TIN NHẮN
                          </p>
                          {searchResults.map((message, index) => {
                            const text = getCloudMessageSearchText(message);
                            const query = search.trim();
                            const parts = query
                              ? text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")})`, "ig"))
                              : [text];
                            const sender = message.senderName || currentUser.displayName || currentUser.username;
                            return (
                              <button
                                key={message.id}
                                type="button"
                                onClick={() => {
                                  setIsSearchOpen(false);
                                  const target = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(message.id)}"]`);
                                  target?.scrollIntoView({ behavior: "smooth", block: "center" });
                                }}
                                className={clsx(
                                  "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-overlay",
                                  index === 0 && "bg-[#1976D2]/10",
                                )}
                              >
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0563C9] text-xs font-semibold text-white">
                                  {sender.slice(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-baseline justify-between gap-2">
                                    <span className="truncate text-sm font-medium text-text-primary">{sender}</span>
                                    <span className="shrink-0 text-xs text-text-muted">{formatCloudTime(String(message.createdAt), "vi-VN")}</span>
                                  </div>
                                  <p className="mt-1 line-clamp-2 text-sm text-text-secondary">
                                    {parts.map((part, partIndex) =>
                                      partIndex % 2 === 1 ? <mark key={partIndex} className="rounded bg-warning/35 text-text-primary">{part}</mark> : <Fragment key={partIndex}>{part}</Fragment>,
                                    )}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </>
                      ) : (
                        <div className="flex flex-col items-center px-8 py-16 text-center text-sm text-text-muted">
                          Không tìm thấy tin nhắn phù hợp.
                        </div>
                      )}
                    </>
                  )}
                </div>
              </aside>
            ) : isPinnedPanelOpen ? (
              <PinnedMessagesPanel
                pinnedMessages={pinnedMessages}
                isLoading={isPinnedLoading}
                error={pinnedError}
                currentUserId={currentUser.id}
                onClose={() => setIsPinnedPanelOpen(false)}
                onJumpToMessage={handlePinnedJump}
                onUnpin={(message) => togglePin({ ...message, isPinned: true })}
                className="h-full w-full"
              />
            ) : (
              <CloudConversationInfoPanel
                items={cloudItems}
                trashItems={cloudTrashItems}
                quota={workspace.quota}
                onLoadAllTrash={workspace.loadAllTrash}
                showStorage
                onManageCloud={() => navigate(ROUTE_PATHS.CLOUD_MANAGE)}
                onRestoreTrashItem={handleRestore}
                onPermanentDeleteItem={handlePermanentDelete}
                onDeleteItem={(item) => handleDeleteRequest(item.id)}
                onViewOriginalMessage={handleViewOriginalResource}
                onShowInFolder={showPhaseNotice}
                userId={cloudUserId ?? currentUser.id}
                senderName={currentUser.displayName || currentUser.username || "Bạn"}
                onClose={() => setIsInfoPanelOpen(false)}
              />
            )}
          </div>
        </div>
        {isRightPanelOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-text-primary/50 xl:hidden"
            onClick={() => {
              setIsInfoPanelOpen(false);
              setIsSearchOpen(false);
              setIsPinnedPanelOpen(false);
            }}
            aria-label={t("common.close")}
          />
        ) : null}
      </section>
      <CloudDeleteDialog
        key={`${deleteTarget?.id ?? "closed"}-${viewMode}`}
        item={deleteTarget}
        // A single failed upload (or a batch containing only failed uploads)
        // can only be permanently deleted. A mixed batch still offers Trash
        // for all ready items; failed entries remain selected for the explicit
        // permanent-delete action after the successful moves complete.
        permanentOnly={
          viewMode === "trash" ||
          (deleteTarget?.status === "failed" &&
            (selectedDeleteItems.length === 0 ||
              selectedDeleteItems.every((candidate) => candidate.status === "failed")))
        }
        isLoading={workspace.isMutating}
        onClose={() => {
          setDeleteTarget(null);
          setSelectedDeleteItems([]);
        }}
        onTrash={handleDialogTrash}
        onPermanentDelete={handleDialogPermanentDelete}
      />
      {cloudForwardMessages ? (
        <ForwardModal
          messages={cloudForwardMessages}
          source="cloud"
          cloudItems={cloudItems}
          currentUserId={currentUser.id}
          onClose={() => setCloudForwardMessages(null)}
        />
      ) : null}
    </AppShell>
  );
}
