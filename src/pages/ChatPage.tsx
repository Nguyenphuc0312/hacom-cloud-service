/**
 * @fileoverview Chat Page - Main chat interface
 * Integrated with Zustand stores and WebSocket.
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { Sidebar } from "../components/layout/Sidebar";
import { ChatWindow } from "../components/layout/ChatWindow";
import { AppShell, ModuleSidebar } from "../shared/layout";
import {
  ConfirmDialog,
  ErrorState,
  NoChatSelected,
  NotificationListSkeleton,
  PageSkeleton,
  ProfileSkeleton,
  Skeleton,
} from "../components/ui";
import { toast } from "../components/ui";
import {
  useAuthStore,
  useChatStore,
  useSelectedConversation,
  useCurrentTypingStatus,
  useCurrentTypingStatuses,
  useConversationCount,
  useFriendshipStore,
} from "../stores";
import { useGlobalWebSocket } from "../features/realtime/GlobalWebSocketProvider";
import type { Attachment, Conversation, UserSummary } from "../types";
import { useFilePreview } from "../hooks/useFilePreview";
import type { PreviewTarget } from "../hooks/useFilePreview";
import { getPreviewType } from "../utils/formatFileSize";
import type { PreviewType } from "../utils/formatFileSize";
import { UserStatus } from "../types";
import { isDirectConversation } from "../lib/conversationAdapter";
import { resolveConversationId } from "../lib/conversationIdentity";
import { getOtherParticipant } from "../utils/messageHelpers";
import { resolveUserDisplayName } from "../features/chat/identity/resolveUserDisplayName";
import {
  listenForContactProfileView,
  listenForNotificationClick,
} from "../features/chat/events/chatUiEvents";
import { logMessageDebug } from "../utils/messageDebug";
import { logger } from "../utils/logger";
import { ErrorCode } from "@hacom/chat-shared-types/core";
import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";
import {
  chatApi as rtkChatApi,
  useAddReactionMutation,
  useDeleteMessageMutation,
  useEditMessageMutation,
  useRemoveReactionMutation,
} from "../features/api/chatApi";
import { useSendMessage } from "../features/chat/hooks/useSendMessage";
import { useConversationSession } from "../features/chat/hooks/useConversationSession";
import { useConversationValidation } from "../features/chat/hooks/useConversationValidation";
import {
  CHAT_OPEN_NEW_CHAT_EVENT,
  consumeOpenNewChatIntent,
} from "../lib/commandPalette";
import { chatApi } from "../features/chat/api";
import { store } from "../store";
import type { ChatLayoutState } from "../utils/densityPolicy";
import { isUuid } from "../utils/isUuid";
import { useResponsive } from "../responsive/responsive";

const UserProfile = React.lazy(() => import("../components/info/UserProfile"));
const GroupInfo = React.lazy(() => import("../components/info/GroupInfo"));
const NewChatModal = React.lazy(
  () => import("../components/modals/NewChatModal"),
);
const ImagePreviewModal = React.lazy(
  () => import("../components/modals/ImagePreviewModal"),
);
const FilePreviewModal = React.lazy(
  () => import("../components/modals/FilePreviewModal"),
);

type InfoPanelMode = "conversation" | "self-profile" | "contact-profile";

const CONVERSATIONS_PAGE_SIZE = 100;

/**
 * Minimal shape check: is this payload complete enough to drop straight into
 * the sidebar without a follow-up fetch? We require the identity (`id`), the
 * room `type` (drives direct/group rendering) and a `participants` array
 * (drives display name/avatar for direct chats). Fields are derived from the
 * `Conversation` type + `conversationAdapter` normalization, not hardcoded.
 */
const isCompleteConversation = (value: unknown): value is Conversation => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Conversation> & {
    participants?: unknown;
  };
  return Boolean(
    candidate.id &&
      candidate.type &&
      Array.isArray(candidate.participants),
  );
};

const DeferredPanelFallback: React.FC = () => (
  <div className="h-full px-1 py-2" aria-busy="true">
    <NotificationListSkeleton count={5} />
  </div>
);

const DeferredModalFallback: React.FC = () => (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-text-primary/40 backdrop-blur-sm">
    <div
      className="w-[min(30rem,calc(100vw-2rem))] rounded-2xl border border-border/80 bg-surface/95 p-4 shadow-elev3"
      aria-busy="true"
    >
      <Skeleton className="h-6 w-40" rounded="sm" />
      <div className="mt-4 space-y-3">
        <Skeleton className="h-10 w-full" rounded="md" />
        <Skeleton className="h-10 w-full" rounded="md" />
        <Skeleton className="h-10 w-2/3" rounded="md" />
      </div>
    </div>
  </div>
);

const INFO_PANEL_EXIT_DURATION_MS = 240;

const loadConversationMutationUseCases = () =>
  import("../features/chat/usecases/createPrivateConversation").then(
    async ({ createPrivateConversationUseCase }) => {
      const { createGroupConversationUseCase } = await import(
        "../features/chat/usecases/createGroupConversation"
      );

      return {
        createPrivateConversationUseCase,
        createGroupConversationUseCase,
      };
    },
  );

export const ChatPage: React.FC = () => {
  const { t } = useTranslation();
  const { conversationId } = useParams<{ conversationId?: string }>();
  const routeConversationId = conversationId ?? null;
  const navigate = useNavigate();
  const shouldTraceRenderLoop = import.meta.env.DEV;

  // Auth store
  const {
    user,
    isLoading: isAuthLoading,
    isInitialized: isAuthInitialized,
    refreshUser,
  } = useAuthStore();

  // Chat store — stable functions + data that drives re-renders.
  // Per-conversation loading/error/hasMore are derived separately below to
  // avoid re-renders when OTHER conversations' states change (e.g. during
  // idle prefetch of adjacent rooms).
  const {
    selectedConversationId,
    selectConversation,
    addConversation,
    updateConversation,
    isLoadingConversations,
    hasFetchedConversationsOnce,
    conversationsError,
    fetchConversations,
    fetchMessages,
    markAsRead,
  } = useChatStore(
    useShallow((state) => ({
      selectedConversationId: state.selectedConversationId,
      selectConversation: state.selectConversation,
      addConversation: state.addConversation,
      updateConversation: state.updateConversation,
      isLoadingConversations: state.isLoadingConversations,
      hasFetchedConversationsOnce: state.hasFetchedConversationsOnce,
      conversationsError: state.conversationsError,
      fetchConversations: state.fetchConversations,
      fetchMessages: state.fetchMessages,
      markAsRead: state.markAsRead,
    })),
  );

  // Per-conversation derived selectors — only re-render when THIS
  // conversation's values change, not when other conversations load.


  // Selectors
  const selectedConversation = useSelectedConversation();
  const typingStatus = useCurrentTypingStatus();
  const typingStatuses = useCurrentTypingStatuses();
  const conversationCount = useConversationCount();
  const refreshFriendshipDirectory = useFriendshipStore(
    (state) => state.refreshDirectory,
  );
  // WebSocket
  const {
    connectionState,
    sendTyping,
    stopTyping,
    joinConversation,
    leaveConversation,
  } = useGlobalWebSocket();

  // Local state
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);
  const [infoPanelMode, setInfoPanelMode] = useState<InfoPanelMode | null>(
    null,
  );
  const [contactProfileUserId, setContactProfileUserId] = useState<string | null>(null);
  const { chatLayoutBreakpoint } = useResponsive();
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const filePreview = useFilePreview();
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [pendingDeleteMessage, setPendingDeleteMessage] = useState<{
    messageId: string;
    mode: "FOR_ME" | "FOR_EVERYONE";
    /** true khi viewer là admin/owner xóa tin của người khác → copy khác sender recall. */
    isAdminDeletion?: boolean;
  } | null>(null);
  const [isDeletingMessage, setIsDeletingMessage] = useState(false);
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] =
    useState(false);
  const [hasMoreConversations, setHasMoreConversations] = useState(true);
  const conversationsPageRef = useRef(1);
  const roomCreationLockRef = useRef(false);
  const [externalJumpTargetMessageId, setExternalJumpTargetMessageId] =
    useState<string | null>(null);
  const [externalJumpRequestVersion, setExternalJumpRequestVersion] =
    useState(0);
  const renderCountRef = useRef(0);
  const chatPaneRef = useRef<HTMLDivElement | null>(null);

  const conversationAccessDeniedMessage = t(
    "error:chat.conversationAccessDenied",
  );
  const conversationOpenFailedMessage = t("error:chat.conversationOpenFailed");
  const {
    isValidatingRoom,
    lastValidatedConversationId,
    conversationValidationError,
    handleRetryConversationValidation,
  } = useConversationValidation({
    routeConversationId,
    addConversation,
    updateConversation,
    conversationAccessDeniedMessage,
    conversationOpenFailedMessage,
    shouldTraceRenderLoop,
  });

  useEffect(() => {
    if (!shouldTraceRenderLoop) {
      return;
    }

    renderCountRef.current += 1;
    logMessageDebug("ChatPage", "render_count", {
      renderCount: renderCountRef.current,
      routeConversationId,
      selectedConversationId,
      lastValidatedConversationId,
      isValidatingRoom,
    });
  });

  useEffect(() => {
    if (!shouldTraceRenderLoop) {
      return;
    }

    logMessageDebug("ChatPage", "route_param_changed", {
      routeConversationId,
      selectedConversationId,
      lastValidatedConversationId,
    });
  }, [
    lastValidatedConversationId,
    routeConversationId,
    selectedConversationId,
    shouldTraceRenderLoop,
  ]);

  useEffect(() => {
    const storeSelectedConversationId =
      useChatStore.getState().selectedConversationId;
    if (storeSelectedConversationId !== routeConversationId) {
      if (shouldTraceRenderLoop) {
        logMessageDebug("ChatPage", "selected_conversation_sync", {
          from: storeSelectedConversationId,
          to: routeConversationId,
        });
      }
      selectConversation(routeConversationId);
    }
  }, [routeConversationId, selectConversation, shouldTraceRenderLoop]);

  // Current user as UserSummary for components
  const currentUserSummary = useMemo<UserSummary | null>(
    () =>
      user
        ? {
          id: user.id,
          username: user.username,
          displayName:
            resolveUserDisplayName(user, { allowLegacyFallback: true }) ||
            user.username,
          avatar: user.avatar,
          status: user.status as UserStatus,
          isBot: false,
        }
        : null,
    [user],
  );

  const isSelectedDirectConversation =
    isDirectConversation(selectedConversation);

  // Get other user for direct chat
  const otherUser =
    selectedConversation && isSelectedDirectConversation && currentUserSummary
      ? getOtherParticipant(selectedConversation, currentUserSummary.id)
      : null;

  const {
    currentHasMore: sessionCurrentHasMore,
    currentIsLoading: sessionCurrentIsLoading,
    currentMessageError: sessionCurrentMessageError,
    currentHistoryStage: sessionCurrentHistoryStage,
    isHistoryPartial: sessionIsHistoryPartial,
    isConversationHistoryReady: sessionIsConversationHistoryReady,
    isConversationReady: sessionIsConversationReady,
    handleLoadOlderMessages: sessionHandleLoadOlderMessages,
    handleRetryMessages: sessionHandleRetryMessages,
    handleReachedLatestMessage: sessionHandleReachedLatestMessage,
    handleTyping: sessionHandleTyping,
  } = useConversationSession({
    routeConversationId,
    selectedConversationId,
    selectedConversation,
    isSelectedDirectConversation,
    otherUser: otherUser ?? null,
    connectionState,
    isValidatingRoom,
    lastValidatedConversationId,
    messageCount: 0,
    fetchMessages,
    markAsRead,
    joinConversation,
    leaveConversation,
    stopTyping,
    sendTyping,
    updateConversation,
  });
  // Load conversations on mount
  useEffect(() => {
    void (async () => {
      await fetchConversations();
      const initialCount = useChatStore.getState().conversations.length;
      setHasMoreConversations(initialCount >= CONVERSATIONS_PAGE_SIZE);
      conversationsPageRef.current = 1;
    })();
  }, [fetchConversations]);

  const handleLoadMoreConversations = useCallback(async () => {
    if (isLoadingMoreConversations || !hasMoreConversations) {
      return;
    }

    setIsLoadingMoreConversations(true);
    try {
      const nextPage = conversationsPageRef.current + 1;
      const response = await chatApi.conversation.getConversations(
        nextPage,
        CONVERSATIONS_PAGE_SIZE,
      );
      const fetched = unwrapApiSuccess(response);

      if (!Array.isArray(fetched) || fetched.length === 0) {
        setHasMoreConversations(false);
        return;
      }

      useChatStore.getState().mergeConversationPage(fetched);
      conversationsPageRef.current = nextPage;
      setHasMoreConversations(fetched.length >= CONVERSATIONS_PAGE_SIZE);
    } catch (error) {
      const apiError = extractApiError(error);
      toast.error(apiError.message || t("error:chat.fetchConversationsFailed"));
    } finally {
      setIsLoadingMoreConversations(false);
    }
  }, [hasMoreConversations, isLoadingMoreConversations, t]);

  // Handle select conversation
  const handleSelectConversation = useCallback(
    (id: string) => {
      if (id === routeConversationId) {
        return;
      }
      navigate(`/chat/${id}`);
    },
    [navigate, routeConversationId],
  );

  const { sendMessage: handleSendMessage } = useSendMessage({
    selectedConversationId,
    isConversationReady: sessionIsConversationReady,
    source: "ChatPage",
  });
  const [editMessageMutation] = useEditMessageMutation();
  const [deleteMessageMutation] = useDeleteMessageMutation();
  const [addReactionMutation] = useAddReactionMutation();
  const [removeReactionMutation] = useRemoveReactionMutation();

  const handleReactMessage = useCallback(
    async (messageId: string, emoji: string) => {
      if (!selectedConversationId || !currentUserSummary) return;

      const targetMessage = rtkChatApi.endpoints.getMessages
        .select({ conversationId: selectedConversationId })(store.getState())
        .data?.messages.find((message) =>
          [
            message.id,
            message.localId,
            message.stableId,
            message.clientMessageId,
          ].some((value) => value === messageId),
        );
      if (!targetMessage) return;

      const existingReaction = targetMessage.reactions?.find(
        (reaction) => reaction.emoji === emoji,
      );
      const hasReacted = Boolean(
        existingReaction?.userIds?.includes(currentUserSummary.id),
      );

      // RTKQ mutation owns the optimistic timeline patch and rollback.
      try {
        const mutationInput = {
          conversationId: selectedConversationId,
          messageId,
          emoji,
          userId: currentUserSummary.id,
        };
        await (hasReacted
          ? removeReactionMutation(mutationInput)
          : addReactionMutation(mutationInput)
        ).unwrap();
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(apiError.message || t("error:generic.requestFailed"));
      }
    },
    [
      addReactionMutation,
      currentUserSummary,
      removeReactionMutation,
      selectedConversationId,
      t,
    ],
  );

  const handleEditMessage = useCallback(
    async (messageId: string, content: string) => {
      if (!selectedConversationId) return;

      try {
        await editMessageMutation({
          conversationId: selectedConversationId,
          messageId,
          content,
        }).unwrap();
        toast.success(t("chat:toast.messageEdited"));
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(apiError.message || t("chat:toast.editFailed"));
      }
    },
    [editMessageMutation, selectedConversationId, t],
  );

  const handleDeleteMessage = useCallback(
    (
      messageId: string,
      mode: "FOR_ME" | "FOR_EVERYONE" = "FOR_ME",
      context?: "ADMIN_DELETE",
    ) => {
      if (!selectedConversationId) return;
      setPendingDeleteMessage({
        messageId,
        mode,
        isAdminDeletion: context === "ADMIN_DELETE",
      });
    },
    [selectedConversationId],
  );

  const closePendingDeleteMessage = useCallback(() => {
    if (isDeletingMessage) return;
    setPendingDeleteMessage(null);
  }, [isDeletingMessage]);

  const confirmDeleteMessage = useCallback(async () => {
    if (!selectedConversationId || !pendingDeleteMessage) return;
    setIsDeletingMessage(true);
    try {
      await deleteMessageMutation({
        conversationId: selectedConversationId,
        messageId: pendingDeleteMessage.messageId,
        mode: pendingDeleteMessage.mode,
      }).unwrap();
      toast.success(
        pendingDeleteMessage.mode === "FOR_EVERYONE"
          ? pendingDeleteMessage.isAdminDeletion
            ? t("chat:toast.messageDeletedGlobal", {
              defaultValue: "Đã xóa tin nhắn ở mọi người",
            })
            : t("chat:toast.messageRecalled", {
              defaultValue: "Đã thu hồi tin nhắn",
            })
          : t("chat:toast.messageDeleted"),
      );

      // Sync conversation lastMessage in sidebar after delete/recall
      const storeState = useChatStore.getState();
      const affectedConv = storeState.conversationById[selectedConversationId];
      if (affectedConv?.lastMessage?.id === pendingDeleteMessage.messageId) {
        if (pendingDeleteMessage.mode === "FOR_ME") {
          updateConversation(selectedConversationId, { lastMessage: undefined });
        } else {
          updateConversation(selectedConversationId, {
            lastMessage: {
              ...affectedConv.lastMessage,
              isDeleted: true,
              content: "",
            },
          });
        }
      }

      setPendingDeleteMessage(null);
    } catch (error) {
      const apiError = extractApiError(error);
      toast.error(apiError.message || t("chat:toast.deleteFailed"));
    } finally {
      setIsDeletingMessage(false);
    }
  }, [
    deleteMessageMutation,
    pendingDeleteMessage,
    selectedConversationId,
    t,
    updateConversation,
  ]);

  const closeInfoPanel = useCallback(() => {
    setIsInfoPanelOpen(false);
  }, []);

  const openSelfProfile = useCallback(() => {
    setInfoPanelMode("self-profile");
    setIsInfoPanelOpen(true);
  }, []);

  const openConversationInfoPanel = useCallback(() => {
    setInfoPanelMode("conversation");
    setIsInfoPanelOpen(true);
  }, []);

  const openContactProfile = useCallback((userId: string) => {
    setContactProfileUserId(userId);
    setInfoPanelMode("contact-profile");
    setIsInfoPanelOpen(true);
  }, []);

  // Handle toggle info panel
  const handleToggleInfoPanel = useCallback(() => {
    if (isInfoPanelOpen && infoPanelMode === "conversation") {
      closeInfoPanel();
      return;
    }

    openConversationInfoPanel();
  }, [
    closeInfoPanel,
    infoPanelMode,
    isInfoPanelOpen,
    openConversationInfoPanel,
  ]);

  const [prevRouteConversationId, setPrevRouteConversationId] = useState(routeConversationId);

  if (routeConversationId !== prevRouteConversationId) {
    setPrevRouteConversationId(routeConversationId);
    if (!routeConversationId && infoPanelMode === "conversation") {
      setIsInfoPanelOpen(false);
    }
  }

  // Handle back (mobile)
  const handleBack = useCallback(() => {
    navigate("/chat");
  }, [navigate]);

  /**
   * Merge a just-created conversation into the sidebar instead of refetching
   * the whole list. If the create response already carries a full shape we use
   * it directly (instant sidebar + makes the room "cached" so ChatWindow can
   * render immediately). If it doesn't, we deliberately do NOT fetch the detail
   * here: navigating to `/chat/:id` makes `useConversationValidation` fetch the
   * authoritative conversation via `getConversationById` exactly once and merge
   * it. Fetching here too would re-introduce a duplicate detail call — the very
   * thing this optimization removes.
   */
  const mergeCreatedConversation = useCallback(
    (conversationId: string, createdPayload: unknown, context: string) => {
      if (isCompleteConversation(createdPayload)) {
        addConversation(createdPayload);
        if (import.meta.env.DEV) {
          logger.debug("conversation", "created_conversation_merged", {
            conversationId,
            context,
            source: "create_response",
          });
        }
        return;
      }

      if (import.meta.env.DEV) {
        logger.debug("conversation", "created_conversation_deferred_to_validation", {
          conversationId,
          context,
          reason: "create_response_incomplete",
        });
      }
    },
    [addConversation],
  );

  // Handle new chat
  const handleStartChat = useCallback(
    async (userId: string) => {
      logger.debug("direct_dm", "source_trace", {
        source: "ChatPage.handleStartChat",
        userId,
      });

      if (!isUuid(typeof userId === "string" ? userId.trim() : "")) {
        toast.error(
          t("chat:contactShare.invalidProfile", {
            defaultValue: "This contact card cannot start a chat.",
          }),
        );
        return;
      }

      if (isCreatingRoom) {
        return;
      }

      if (roomCreationLockRef.current) {
        return;
      }
      roomCreationLockRef.current = true;
      setIsCreatingRoom(true);
      try {
        const { createPrivateConversationUseCase } =
          await loadConversationMutationUseCases();
        const response = await createPrivateConversationUseCase(userId);
        const payload = unwrapApiSuccess(response);
        const conversationId = resolveConversationId(payload, {
          source: "ChatPage.handleStartChat.createPrivateConversation",
          includeEntityId: true,
        });
        if (!conversationId) {
          throw new Error(t("error:chat.conversationIdMissing"));
        }

        // Merge the new room into the sidebar (no full-list refetch). The route
        // validation hook fetches the authoritative shape once after navigate.
        mergeCreatedConversation(conversationId, payload, "create_direct");
        selectConversation(conversationId);
        navigate(`/chat/${conversationId}`);
      } catch (error) {
        const apiError = extractApiError(error);
        const details =
          apiError.details && typeof apiError.details === "object"
            ? (apiError.details as Record<string, unknown>)
            : null;
        const existingConversationId = resolveConversationId(details, {
          source: "ChatPage.handleStartChat.errorDetails",
        });

        if (
          existingConversationId &&
          (apiError.code === ErrorCode.CONFLICT ||
            apiError.code === ErrorCode.ROOM_ALREADY_EXISTS)
        ) {
          // Existing room — no full conversation payload to merge here. The
          // route validation hook fetches + merges it via getConversationById
          // once after navigate, so we skip the full-list refetch.
          selectConversation(existingConversationId);
          navigate(`/chat/${existingConversationId}`);
          return;
        }

        logger.error("conversation", "create_direct_failed", apiError);
        if (apiError.code === ErrorCode.DIRECT_CHAT_TARGET_UNAVAILABLE) {
          void refreshFriendshipDirectory({
            reason: "explicit_refresh",
            includeFullSnapshot: true,
          });
        }
        toast.error(
          apiError.message || t("error:chat.startConversationFailed"),
        );
      } finally {
        roomCreationLockRef.current = false;
        setIsCreatingRoom(false);
      }
    },
    [
      isCreatingRoom,
      mergeCreatedConversation,
      navigate,
      refreshFriendshipDirectory,
      selectConversation,
      t,
    ],
  );

  const handleOpenCurrentUserProfile = useCallback(() => {
    if (!currentUserSummary) return;
    openSelfProfile();
  }, [currentUserSummary, openSelfProfile]);

  const handleCreateGroup = useCallback(
    async (payload: { name: string; memberIds: string[] }) => {
      if (isCreatingRoom) {
        return;
      }

      if (roomCreationLockRef.current) {
        return;
      }
      roomCreationLockRef.current = true;
      setIsCreatingRoom(true);
      try {
        const { createGroupConversationUseCase } =
          await loadConversationMutationUseCases();
        const response = await createGroupConversationUseCase({
          name: payload.name,
          memberIds: payload.memberIds,
        });
        const conversationPayload = unwrapApiSuccess(response);
        const conversationId = resolveConversationId(conversationPayload, {
          source: "ChatPage.handleCreateGroup.createGroupConversation",
          includeEntityId: true,
        });
        if (!conversationId) {
          throw new Error(t("error:chat.conversationIdMissing"));
        }

        // Merge the new group into the sidebar (no full-list refetch). The route
        // validation hook fetches the authoritative shape once after navigate.
        mergeCreatedConversation(
          conversationId,
          conversationPayload,
          "create_group",
        );
        selectConversation(conversationId);
        navigate(`/chat/${conversationId}`);
      } catch (error) {
        const apiError = extractApiError(error);
        logger.error("conversation", "create_group_failed", apiError);
        toast.error(apiError.message || t("error:chat.createGroupFailed"));
      } finally {
        roomCreationLockRef.current = false;
        setIsCreatingRoom(false);
      }
    },
    [
      isCreatingRoom,
      mergeCreatedConversation,
      navigate,
      selectConversation,
      t,
    ],
  );

  // Handle new chat modal
  const handleOpenNewChat = useCallback(() => {
    setIsNewChatModalOpen(true);
  }, []);

  useEffect(() => {
    if (consumeOpenNewChatIntent()) {
      setTimeout(() => setIsNewChatModalOpen(true), 0);
    }

    const openFromCommandPalette = () => {
      setIsNewChatModalOpen(true);
    };

    window.addEventListener(CHAT_OPEN_NEW_CHAT_EVENT, openFromCommandPalette);
    return () => {
      window.removeEventListener(
        CHAT_OPEN_NEW_CHAT_EVENT,
        openFromCommandPalette,
      );
    };
  }, []);

  const shouldRenderInfoContent =
    isInfoPanelOpen &&
    (infoPanelMode === "self-profile" ||
      infoPanelMode === "contact-profile" ||
      (infoPanelMode === "conversation" && Boolean(routeConversationId)));
  const isDockedInfoPanelViewport = chatLayoutBreakpoint === "wide";
  const chatLayoutState = useMemo<ChatLayoutState>(() => {
    if (chatLayoutBreakpoint === "compact") {
      return "mobile";
    }

    return shouldRenderInfoContent && isDockedInfoPanelViewport
      ? "with-panel"
      : "normal";
  }, [
    chatLayoutBreakpoint,
    isDockedInfoPanelViewport,
    shouldRenderInfoContent,
  ]);
  const chatWindowLayoutState = useMemo<ChatLayoutState>(() => {
    return chatLayoutBreakpoint === "compact" ? "mobile" : "normal";
  }, [chatLayoutBreakpoint]);
  const sidebarLayoutState = useMemo<ChatLayoutState>(() => {
    return chatLayoutBreakpoint === "compact" ? "mobile" : "normal";
  }, [chatLayoutBreakpoint]);

  const showConversationSkeleton =
    (!hasFetchedConversationsOnce && conversationCount === 0) ||
    (isLoadingConversations && conversationCount === 0);

  useEffect(() => {
    if (isInfoPanelOpen || infoPanelMode === null) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setInfoPanelMode(null);
    }, INFO_PANEL_EXIT_DURATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [infoPanelMode, isInfoPanelOpen]);

  const handleOpenFilePreview = useCallback(
    (attachment: Attachment) => {
      if (!selectedConversation) {
        return;
      }

      const target: PreviewTarget = {
        attachment,
        conversationId: selectedConversation.id,
        previewType: getPreviewType(
          attachment.mimeType,
          attachment.fileName,
        ) as PreviewType,
      };
      const cachedMessages = rtkChatApi.endpoints.getMessages
        .select({ conversationId: selectedConversation.id })(store.getState())
        .data?.messages ?? [];
      const gallery = cachedMessages
        .flatMap((message) =>
          (message.attachments ?? []).map((candidate) => ({
            attachment: candidate,
            conversationId: selectedConversation.id,
            messageId: message.id,
            previewType: getPreviewType(
              candidate.mimeType,
              candidate.fileName,
            ) as PreviewType,
          })),
        )
        .filter((candidate) => candidate.previewType !== "unknown");
      filePreview.open(target, gallery.length > 0 ? gallery : undefined);
    },
    [filePreview, selectedConversation],
  );

  const handleExternalJumpHandled = useCallback((messageId: string) => {
    setExternalJumpTargetMessageId((current) =>
      current === messageId ? null : current,
    );
  }, []);

  useEffect(() => {
    return listenForContactProfileView(({ userId }) => {
      if (!userId) return;
      openContactProfile(userId);
    });
  }, [openContactProfile]);

  useEffect(() => {
    return listenForNotificationClick(
      ({ conversationId: nextConversationId, messageId: nextMessageId }) => {
        if (!nextConversationId) return;

        if (nextMessageId) {
          setExternalJumpTargetMessageId(nextMessageId);
          setExternalJumpRequestVersion((current) => current + 1);
        }

        if (routeConversationId !== nextConversationId) {
          navigate(`/chat/${nextConversationId}`);
        }
      },
    );
  }, [navigate, routeConversationId]);

  const handleRetryBootstrap = useCallback(() => {
    void refreshUser().then(() => {
      if (useAuthStore.getState().user) {
        void fetchConversations();
      }
    });
  }, [fetchConversations, refreshUser]);

  if (!currentUserSummary) {
    if (!isAuthInitialized || isAuthLoading) {
      return <PageSkeleton />;
    }

    return (
      <div className="flex h-full items-center justify-center bg-[hsl(var(--color-chat-canvas))] px-6">
        <ErrorState
          title={t("error:auth.profileMissing", {
            defaultValue: "Unable to load profile",
          })}
          message={t("error:auth.profileRetryHint", {
            defaultValue:
              "We could not load your session profile. Please retry.",
          })}
          onRetry={handleRetryBootstrap}
        />
      </div>
    );
  }

  return (
    <AppShell
      className="chat-page-shell"
      data-chat-layout-state={chatLayoutState}
      moduleSidebar={
        <ModuleSidebar
          className="chat-page-module-sidebar"
          contentClassName="min-h-0"
        >
          <div className="h-full min-h-0 w-full">
            <Sidebar
              layoutState={sidebarLayoutState}
              currentUser={currentUserSummary}
              selectedId={routeConversationId}
              isLoadingMoreConversations={isLoadingMoreConversations}
              hasMoreConversations={hasMoreConversations}
              showConversationSkeleton={showConversationSkeleton}
              conversationsError={conversationsError}
              onSelectConversation={handleSelectConversation}
              onRetryConversations={fetchConversations}
              onLoadMoreConversations={handleLoadMoreConversations}
              onCurrentUserClick={handleOpenCurrentUserProfile}
            />
          </div>
        </ModuleSidebar>
      }
    >

      {/* Chat window */}
      <div
        ref={chatPaneRef}
        tabIndex={-1}
        className={clsx(
          "relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden bg-[hsl(var(--chat-panel-bg))]",
          !selectedConversation && "hidden lg:flex",
        )}
      >
        {selectedConversation ? (
          <ChatWindow
            layoutState={chatWindowLayoutState}
            conversation={selectedConversation}
            currentUser={currentUserSummary}
            typingStatus={typingStatus || undefined}
            typingStatuses={typingStatuses}
            onSendMessage={handleSendMessage}
            onReactMessage={handleReactMessage}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
            onToggleInfoPanel={handleToggleInfoPanel}
            onBack={handleBack}
            onTyping={sessionHandleTyping}
            hasMoreMessages={sessionCurrentHasMore}
            isLoadingMessages={
              sessionCurrentIsLoading || !sessionIsConversationHistoryReady
            }
            historyLoadingState={
              sessionIsHistoryPartial
                ? {
                  stage: sessionCurrentHistoryStage,
                  isPartial: sessionIsHistoryPartial,
                }
                : null
            }
            onLoadOlderMessages={sessionHandleLoadOlderMessages}
            onImageClick={setImagePreview}
            onFilePreview={handleOpenFilePreview}
            messageError={sessionCurrentMessageError}
            onRetryMessages={sessionHandleRetryMessages}
            onReachedLatestMessage={sessionHandleReachedLatestMessage}
            connectionState={connectionState}
            isConversationReady={sessionIsConversationReady}
            externalJumpToMessageId={externalJumpTargetMessageId}
            externalJumpRequestVersion={externalJumpRequestVersion}
            onExternalJumpHandled={handleExternalJumpHandled}
          />
        ) : routeConversationId &&
          conversationValidationError?.conversationId ===
          routeConversationId ? (
          <div className="flex h-full items-center justify-center px-6">
            <ErrorState
              title={t("error:chat.conversationOpenFailed", {
                defaultValue: "Unable to open conversation",
              })}
              message={conversationValidationError.message}
              onRetry={handleRetryConversationValidation}
            />
          </div>
        ) : (
          <NoChatSelected onNewChat={handleOpenNewChat} />
        )}
      </div>

      {/* Info panel */}
      {(infoPanelMode === "self-profile" ||
        (infoPanelMode === "conversation" && Boolean(routeConversationId)) ||
        Boolean(selectedConversation)) && (
          <div
            className={clsx(
              "fixed inset-y-0 right-0 z-40 w-full max-w-full transform-gpu transition-transform duration-300 ease-out sm:max-w-[min(26rem,94vw)] xl:relative xl:z-0 xl:max-w-none xl:flex-shrink-0 xl:overflow-hidden xl:bg-transparent xl:transition-[width,border-color] xl:duration-300",
              isInfoPanelOpen
                ? "translate-x-0 xl:w-[var(--app-inspector-width)] xl:border-l xl:border-border/60"
                : "translate-x-full xl:w-0 xl:border-l xl:border-border/0",
            )}
            aria-hidden={!isInfoPanelOpen}
          >
            <div
              className={clsx(
                "h-full w-full transform-gpu bg-surface transition-[transform,opacity] duration-300 ease-out xl:absolute xl:inset-y-0 xl:right-0 xl:w-[var(--app-inspector-width)]",
                isInfoPanelOpen
                  ? "translate-x-0 opacity-100"
                  : "pointer-events-none translate-x-4 opacity-0 xl:translate-x-6",
              )}
              style={{ backgroundColor: "hsl(var(--color-sidebar-surface))" }}
            >
              {infoPanelMode !== null ? (
                <React.Suspense fallback={<DeferredPanelFallback />}>
                  {infoPanelMode === "self-profile" ? (
                    <UserProfile
                      key={`self-profile:${currentUserSummary.id}`}
                      userId={currentUserSummary.id}
                      currentUserId={currentUserSummary.id}
                      initialUser={{
                        id: currentUserSummary.id,
                        username: currentUserSummary.username,
                        displayName: currentUserSummary.displayName,
                        avatar: currentUserSummary.avatar,
                        status: currentUserSummary.status,
                      }}
                      onClose={closeInfoPanel}
                      onStartConversation={handleStartChat}
                    />
                  ) : infoPanelMode === "contact-profile" && contactProfileUserId ? (
                    <UserProfile
                      key={`contact-profile:${contactProfileUserId}`}
                      userId={contactProfileUserId}
                      currentUserId={currentUserSummary.id}
                      onClose={closeInfoPanel}
                      onStartConversation={handleStartChat}
                    />
                  ) : infoPanelMode === "conversation" && !selectedConversation ? (
                    <DeferredPanelFallback />
                  ) : isSelectedDirectConversation ? (
                    otherUser ? (
                      <UserProfile
                        key={`conversation-profile:${selectedConversation?.id ?? "unknown"}:${otherUser.id}`}
                        userId={otherUser.id}
                        currentUserId={currentUserSummary.id}
                        conversationId={selectedConversation?.id}
                        conversationContext="direct"
                        initialUser={{
                          id: otherUser.id,
                          username: otherUser.username,
                          displayName: otherUser.displayName,
                          avatar: otherUser.avatar,
                          status: otherUser.status,
                        }}
                        onClose={closeInfoPanel}
                        onStartConversation={handleStartChat}
                      />
                    ) : (
                      <ProfileSkeleton />
                    )
                  ) : selectedConversation ? (
                    <GroupInfo
                      conversation={selectedConversation}
                      currentUserId={currentUserSummary.id}
                      onClose={closeInfoPanel}
                    />
                  ) : null}
                </React.Suspense>
              ) : null}
            </div>
          </div>
        )}

      {/* Info panel overlay (mobile) */}
      {isInfoPanelOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-text-primary/50 xl:hidden"
          onClick={closeInfoPanel}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeInfoPanel();
          }}
          aria-label={t("common:actions.close")}
        />
      )}

      {/* New Chat Modal */}
      {isNewChatModalOpen && (
        <React.Suspense fallback={<DeferredModalFallback />}>
          <NewChatModal
            isOpen={isNewChatModalOpen}
            onClose={() => setIsNewChatModalOpen(false)}
            onStartChat={handleStartChat}
            onCreateGroup={handleCreateGroup}
            isSubmitting={isCreatingRoom}
          />
        </React.Suspense>
      )}

      {/* Image Preview Modal */}
      {imagePreview && (
        <React.Suspense fallback={<DeferredModalFallback />}>
          <ImagePreviewModal
            isOpen={!!imagePreview}
            onClose={() => setImagePreview(null)}
            imageUrl={imagePreview}
          />
        </React.Suspense>
      )}

      {/* File Preview Modal */}
      {(filePreview.isOpen || filePreview.current) && (
        <React.Suspense fallback={<DeferredModalFallback />}>
          <FilePreviewModal
            isOpen={filePreview.isOpen}
            onClose={filePreview.close}
            current={filePreview.current}
            currentIndex={filePreview.currentIndex}
            totalItems={filePreview.totalItems}
            secureUrl={filePreview.secureUrl}
            isLoadingUrl={filePreview.isLoadingUrl}
            urlError={filePreview.urlError}
            hasPrev={filePreview.hasPrev}
            hasNext={filePreview.hasNext}
            onPrev={filePreview.prev}
            onNext={filePreview.next}
            onRefreshUrl={filePreview.refreshUrl}
          />
        </React.Suspense>
      )}

      <ConfirmDialog
        isOpen={pendingDeleteMessage !== null}
        onClose={closePendingDeleteMessage}
        onConfirm={() => {
          void confirmDeleteMessage();
        }}
        title={
          pendingDeleteMessage?.mode === "FOR_EVERYONE"
            ? pendingDeleteMessage.isAdminDeletion
              ? t("chat:confirm.deleteByAdminTitle", {
                defaultValue: "Xóa tin nhắn ở mọi người?",
              })
              : t("chat:confirm.deleteForEveryoneTitle", {
                defaultValue: "Thu hồi tin nhắn?",
              })
            : t("chat:confirm.deleteForMeTitle", {
              defaultValue: "Xóa tin nhắn ở phía bạn?",
            })
        }
        message={
          pendingDeleteMessage?.mode === "FOR_EVERYONE"
            ? pendingDeleteMessage.isAdminDeletion
              ? t("chat:confirm.deleteByAdmin", {
                defaultValue:
                  "Bạn đang xóa tin nhắn của thành viên khác với tư cách quản trị viên. Mọi người trong cuộc trò chuyện sẽ không còn thấy nội dung này.",
              })
              : t("chat:confirm.deleteForEveryone", {
                defaultValue:
                  "Tin nhắn này sẽ bị thu hồi với tất cả mọi người trong cuộc trò chuyện. Người khác sẽ không còn xem được nội dung tin nhắn.",
              })
            : t("chat:confirm.deleteForMe", {
              defaultValue:
                "Tin nhắn này chỉ bị xóa khỏi giao diện của bạn. Những người khác trong cuộc trò chuyện vẫn có thể xem tin nhắn.",
            })
        }
        confirmText={
          pendingDeleteMessage?.mode === "FOR_EVERYONE"
            ? pendingDeleteMessage.isAdminDeletion
              ? t("chat:confirm.deleteByAdminButton", {
                defaultValue: "Xóa ở mọi người",
              })
              : t("chat:confirm.recall", { defaultValue: "Thu hồi" })
            : t("common:actions.delete", { defaultValue: "Xóa" })
        }
        isLoading={isDeletingMessage}
        variant="danger"
      />
    </AppShell>
  );
};

export default ChatPage;
