import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LoaderCircle,
  Copy,
  Search,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { ChatHeader } from "../../../components/chat/ChatHeader";
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
  MessageType,
  RoomType,
  UserStatus,
  type Conversation,
  type Message,
  type UserSummary,
} from "../../../types";
import { resolveChatLayoutProfile } from "../../../utils/densityPolicy";
import { useEnrichedProfileStore } from "../../../stores/enrichedProfileStore";
import { CLOUD_CONVERSATION_ID, CLOUD_MAX_UPLOAD_BYTES } from "../constants";
import {
  CloudConversationAvatar,
  CloudConversationEntry,
} from "../components/CloudConversationEntry";
import { CloudDeleteDialog } from "../components/CloudDeleteDialog";
import { CloudTrashTimeline } from "../components/CloudTrashTimeline";
import { CloudConversationInfoPanel } from "../components/CloudConversationInfoPanel";
import { useCloudWorkspace } from "../hooks/useCloudWorkspace";
import type { CloudItem, CloudViewMode } from "../types";
import { cloudItemsToMessages } from "../utils/cloudMessageAdapter";
import {
  formatCloudTime,
  getCloudItemPreview,
  getCloudItemTitle,
} from "../utils/cloudFormat";
import { resolveCloudUserId } from "../utils/cloudIdentity";
import { ROUTE_PATHS } from "../../../router/paths";
import {
  ATTACHMENT_CONSTRAINTS,
  createAttachmentDraft,
  isDuplicateFile,
  type AttachmentDraft,
} from "../../../types/attachmentDraft";
import "../styles/cloud.css";

const getErrorTranslationKey = (code: string): string => {
  switch (code) {
    case "DEMO_USER_REQUIRED":
    case "CLOUD_USER_MISSING":
    case "CLOUD_AUTH_REQUIRED":
    case "UNAUTHORIZED":
    case "FORBIDDEN":
    case "AUTH_REQUIRED":
    case "INVALID_ACCESS_TOKEN":
    case "TOKEN_EXPIRED":
    case "SESSION_REVOKED":
    case "ACCOUNT_NOT_ACTIVE":
      return "errors.user";
    case "QUOTA_EXCEEDED":
      return "errors.quota";
    case "FILE_TOO_LARGE":
      return "errors.fileTooLarge";
    case "DRIVE_NOT_ACTIVE":
      return "errors.driveInactive";
    case "ITEM_NOT_READY":
      return "errors.itemNotReady";
    case "TRASH_EXPIRED":
      return "errors.trashExpired";
    case "INVALID_QUOTA_TIER":
      return "errors.invalidQuotaTier";
    case "QUOTA_REQUEST_PENDING":
      return "errors.quotaRequestPending";
    case "IDEMPOTENCY_CONFLICT":
      return "errors.idempotencyConflict";
    case "OBJECT_UPLOAD_NETWORK_ERROR":
    case "CLOUD_NETWORK_ERROR":
    case "CLOUD_UNAVAILABLE":
    case "AUTH_AUTHORITY_UNAVAILABLE":
    case "CLOUD_REQUEST_FAILED":
    case "SERVICE_UNAVAILABLE":
    case "DEPENDENCY_UNAVAILABLE":
    case "DATABASE_UNAVAILABLE":
    case "CLOUD_NOT_READY":
    case "INTERNAL_ERROR":
      return "errors.offline";
    default:
      return "errors.generic";
  }
};

/**
 * Search the message body only.  `createdAt` is presentation metadata and
 * must never participate in matching; media-only items are not message
 * results, so a timestamp-like filename cannot produce a false hit in the
 * "Tin nhắn" panel.
 */
const getCloudMessageSearchText = (message: Message): string => {
  if (message.type !== MessageType.TEXT) return "";
  const plainText = String(message.plainText ?? "").trim();
  const content = String(message.content ?? "").trim();
  // Cloud text messages intentionally mirror content into plainText for the
  // chat renderer. Do not concatenate identical fields or search snippets
  // will show the same message twice (e.g. "123456 123456").
  return plainText && content && plainText !== content
    ? `${plainText} ${content}`
    : plainText || content;
};

const stripRichText = (value: string): string =>
  value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();

const isStandaloneHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      parsed.toString().length > 0
    );
  } catch {
    return false;
  }
};

type CloudSelectionDrag = {
  startId: string;
  startX: number;
  startY: number;
  active: boolean;
  selecting: boolean;
  visited: Set<string>;
  holdTimer?: number;
};

export default function CloudPage() {
  const { t } = useTranslation("cloud");
  const navigate = useNavigate();
  const location = useLocation();
  const isCloudTrashRoute = location.pathname === ROUTE_PATHS.CLOUD_TRASH;
  const authUser = useAuthStore((state) => state.user);
  const { width, chatLayoutBreakpoint } = useResponsive();
  const [draft, setDraft] = useState("");
  const [draftResetKey, setDraftResetKey] = useState(0);
  const [search, setSearch] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<CloudViewMode>(() =>
    isCloudTrashRoute ? "trash" : "active",
  );
  const [deleteTarget, setDeleteTarget] = useState<CloudItem | null>(null);
  const [selectedDeleteItems, setSelectedDeleteItems] = useState<CloudItem[]>([]);
  const timelineScrollTopRef = useRef<number | null>(null);
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(isCloudTrashRoute);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const isSelectionModeRef = useRef(false);
  const selectedMessageIdsRef = useRef<Set<string>>(new Set());
  const suppressSelectionClickRef = useRef(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const selectionDragRef = useRef<CloudSelectionDrag | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentDraft[]>(
    [],
  );
  const pendingAttachmentsRef = useRef<AttachmentDraft[]>([]);
  const [isUploadingPendingAttachments, setIsUploadingPendingAttachments] =
    useState(false);
  const cloudUserId = resolveCloudUserId(authUser?.id);
  // Search is performed against the already loaded My Documents timeline,
  // matching Hacom Chat's local panel behavior. Do not refetch the Cloud
  // bundle for every keystroke (that caused the red Cloud error banner).
  const workspace = useCloudWorkspace(cloudUserId);

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
  const isRightPanelOpen = isInfoPanelOpen || isSearchOpen;

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
    () => [
      ...cloudItemsToMessages(
        cloudItems,
        currentUser,
        {
        link: t("item.untitledLink"),
        file: t("item.untitledFile"),
        },
      ),
    ].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
    [cloudItems, currentUser, t],
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
    if (!query) return cloudTrashItems;
    return cloudTrashItems.filter((item) => {
      const title = getCloudItemTitle(item, {
        text: t("item.untitledText"),
        link: t("item.untitledLink"),
        file: t("item.untitledFile"),
      });
      return `${title} ${getCloudItemPreview(item)}`
        .toLocaleLowerCase()
        .includes(query);
    });
  }, [cloudTrashItems, search, t]);

  const showPhaseNotice = useCallback(() => {
    toast.info(t("workspace.phaseAction"));
  }, [t]);

  const handleSend = useCallback(
    async (rawContent?: string) => {
      const content = stripRichText(rawContent ?? "");
      const attachments = pendingAttachments.filter((draft) => draft.file);

      if (!content && attachments.length === 0) return;

      if (attachments.length > 0) {
        setIsUploadingPendingAttachments(true);
        let failed = false;
        try {
          for (const draft of attachments) {
            setPendingAttachments((current) =>
              current.map((item) =>
                item.localId === draft.localId
                  ? { ...item, status: "uploading", progress: 0 }
                  : item,
              ),
            );
            try {
              await workspace.uploadFile(draft.file!);
              setPendingAttachments((current) =>
                current.filter((item) => item.localId !== draft.localId),
              );
              if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
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
    [pendingAttachments, t, workspace],
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
    setViewMode(isCloudTrashRoute ? "trash" : "active");
    if (isCloudTrashRoute) setIsInfoPanelOpen(true);
  }, [isCloudTrashRoute]);

  const handleViewModeChange = useCallback((mode: CloudViewMode) => {
    setViewMode(mode);
    if (mode === "trash" && location.pathname !== ROUTE_PATHS.CLOUD_TRASH) {
      navigate(ROUTE_PATHS.CLOUD_TRASH);
    } else if (mode === "active" && location.pathname === ROUTE_PATHS.CLOUD_TRASH) {
      navigate(ROUTE_PATHS.CLOUD);
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (viewMode !== "active") {
      setIsSelectionMode(false);
      setSelectedMessageIds(new Set());
    }
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

  const setMessageSelected = useCallback((messageId: string, selected: boolean) => {
    setSelectedMessageIds((current) => {
      const next = new Set(current);
      if (selected) next.add(messageId);
      else next.delete(messageId);
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

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      // Links, file cards and video surfaces are selectable too. Only native
      // controls should keep their own click/drag behavior.
      if (!target || target.closest("button,input,select,textarea")) return;
      const row = target.closest<HTMLElement>("[data-message-id]");
      const messageId = row?.dataset.messageId;
      if (!messageId || !messages.some((message) => message.id === messageId)) {
        return;
      }
      const selection: CloudSelectionDrag = {
        startId: messageId,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
        selecting: !selectedMessageIdsRef.current.has(messageId),
        visited: new Set([messageId]),
      };
      // Desktop users commonly hold a message instead of dragging. Start the
      // same selection mode after a short hold, while preserving normal click
      // behavior for a quick release.
      selection.holdTimer = window.setTimeout(() => {
        const current = selectionDragRef.current;
        if (current !== selection) return;
        current.active = true;
        document.body.style.userSelect = "none";
        window.getSelection()?.removeAllRanges();
        enterSelectionMode();
        setMessageSelected(current.startId, current.selecting);
        suppressSelectionClickRef.current = true;
      }, 450);
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
      if (!drag.active && distance < 8) return;

      if (!drag.active) {
        drag.active = true;
        document.body.style.userSelect = "none";
        window.getSelection()?.removeAllRanges();
        enterSelectionMode();
        setMessageSelected(drag.startId, drag.selecting);
      }

      const target = event.target as HTMLElement | null;
      const row = target?.closest<HTMLElement>("[data-message-id]");
      const messageId = row?.dataset.messageId;
      if (!messageId || drag.visited.has(messageId)) return;
      if (!messages.some((message) => message.id === messageId)) return;
      drag.visited.add(messageId);
      setMessageSelected(messageId, drag.selecting);
      event.preventDefault();
    };

    const handleSelectionClick = (event: MouseEvent) => {
      if (!isSelectionModeRef.current) return;
      if (suppressSelectionClickRef.current) {
        suppressSelectionClickRef.current = false;
        return;
      }
      const target = event.target as HTMLElement | null;
      if (!target || target.closest("button,input,select,textarea,a,video")) {
        return;
      }
      const row = target.closest<HTMLElement>("[data-message-id]");
      const messageId = row?.dataset.messageId;
      if (!messageId || !messages.some((message) => message.id === messageId)) {
        return;
      }
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
  }, [enterSelectionMode, messages, setMessageSelected, toggleMessageSelection]);

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
    },
    [t, workspace],
  );

  const handleRestore = useCallback(
    async (itemId: string) => {
      await workspace.restoreItem(itemId);
    },
    [t, workspace],
  );

  const handlePermanentDelete = useCallback(
    async (itemId: string) => {
      await workspace.permanentlyDeleteItem(itemId);
    },
    [t, workspace],
  );

  const selectedMessages = useMemo(
    () => messages.filter((message) => selectedMessageIds.has(message.id)),
    [messages, selectedMessageIds],
  );
  const selectedCloudItems = useMemo(
    () => cloudItems.filter((item) => selectedMessageIds.has(item.id)),
    [cloudItems, selectedMessageIds],
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

  const handleDialogTrash = useCallback(async (itemId: string) => {
    const items = selectedDeleteItems.length > 0 ? selectedDeleteItems : [{ id: itemId } as CloudItem];
    // Process the batch in a deterministic order. Running mutations with
    // Promise.all lets each refresh race the others and the last stale
    // response can make it look as if only one item was moved. Failed uploads
    // Only ready items can enter Trash. Failed/processing entries are kept in
    // the selection instead of making a rejected request abort the batch.
    const trashable = items.filter((item) => item.status === "ready");
    const blocked = items.filter((item) => item.status !== "ready");
    const remaining: CloudItem[] = [...blocked];
    try {
      for (const item of trashable) {
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
      if (blocked.length > 0) {
        toast.error("Một số mục chưa sẵn sàng để đưa vào thùng rác.");
      }
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
    () =>
      selectedMessages
        .map((message) => {
          const item = cloudItems.find((candidate) => candidate.id === message.id);
          return item?.url || item?.content || item?.title || message.plainText || message.content || message.attachments?.[0]?.fileName || "";
        })
        .filter(Boolean)
        .join("\n"),
    [cloudItems, selectedMessages],
  );

  const handleCopySelected = useCallback(async () => {
    const text = getSelectedShareText();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    exitSelectionMode();
  }, [exitSelectionMode, getSelectedShareText]);

  const handleShareSelected = useCallback(async () => {
    const text = getSelectedShareText();
    if (!text) return;
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
      }
      exitSelectionMode();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }, [exitSelectionMode, getSelectedShareText]);

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
              setIsInfoPanelOpen((isOpen) => !isOpen);
            }}
            onSearchClick={() => {
              captureTimelineScroll();
              workspace.clearError();
              setIsInfoPanelOpen(false);
              setIsSearchOpen((value) => !value);
            }}
            onPinnedClick={showPhaseNotice}
          />

          {workspace.error ? (
            <ConversationLane className="pt-3">
              <InlineNotice
                tone="error"
                message={t(getErrorTranslationKey(workspace.error.code))}
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
              onForward={noopMessageAction}
              onPin={noopMessageIdAction}
              onEdit={noopMessageAction}
              onDelete={handleDeleteRequest}
              onRetry={handleRetryCloudMessage}
              cloudMessageActionsOnly
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
              className="min-h-0 flex-1"
            />
          ) : (
            <CloudTrashTimeline
              items={visibleTrashItems}
              isLoading={workspace.isLoadingTrash}
              isLoadingMore={workspace.isLoadingMoreTrash}
              hasMore={Boolean(workspace.trashNextCursor)}
              isMutating={workspace.isMutating}
              onRestore={handleRestore}
              onDelete={(item) => {
                captureTimelineScroll();
                setSelectedDeleteItems([]);
                setDeleteTarget(item);
              }}
              onLoadMore={() => workspace.loadMoreTrash()}
            />
          )}

          {workspace.uploadProgress ? (
            <div className="cloud-chat-upload" role="status" aria-live="polite">
              <ConversationLane>
                <div className="cloud-chat-upload__pill">
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {workspace.uploadProgress.fileName}
                  </span>
                  <span className="shrink-0 font-semibold text-[#1565C0]">
                    {workspace.uploadProgress.stage === "uploading"
                      ? `${workspace.uploadProgress.percent}%`
                      : t(`upload.stage.${workspace.uploadProgress.stage}`)}
                  </span>
                </div>
              </ConversationLane>
            </div>
          ) : null}

          <div className="sticky bottom-0 z-sticky shrink-0">
            {viewMode === "active" ? (
              <>
              {isSelectionMode ? (
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
                  <button
                    type="button"
                    onClick={() => void handleShareSelected()}
                    disabled={selectedMessageIds.size === 0}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-40"
                  >
                    <Share2 className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">Chia sẻ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteSelected()}
                    disabled={selectedMessageIds.size === 0 || workspace.isMutating}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">{t("chat:message.actions.delete", { defaultValue: "Xóa" })}</span>
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
                composerMode="online"
                conversationName={t("workspace.title")}
                onAddFiles={handleAddFiles}
                onSendAudio={handleSendAudio}
                uploadDrafts={pendingAttachments}
                onRemoveDraft={handleRemovePendingAttachment}
                onCancelUpload={handleRemovePendingAttachment}
                onRetryUpload={handleRetryPendingAttachment}
                onClearAllDrafts={handleClearPendingAttachments}
                hasUploadingDrafts={isUploadingPendingAttachments}
                hasFailedDrafts={pendingAttachments.some((draft) =>
                  ["failed", "expired", "cancelled"].includes(draft.status),
                )}
                hasReadyDrafts={pendingAttachments.length > 0}
              />
              </>
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
              isRightPanelOpen
                ? "translate-x-0 opacity-100"
                : "pointer-events-none translate-x-4 opacity-0 xl:translate-x-6",
            )}
            style={{ backgroundColor: "hsl(var(--color-sidebar-surface))" }}
          >
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
            ) : (
              <CloudConversationInfoPanel
                items={cloudItems}
                trashItems={cloudTrashItems}
                quota={workspace.quota}
                viewMode={viewMode}
                onViewModeChange={handleViewModeChange}
                showStorage
                onManageCloud={() => navigate(ROUTE_PATHS.CLOUD_MANAGE)}
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
    </AppShell>
  );
}
