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
import { ErrorState, NoChatSelected, Spinner } from "../components/ui";
import { toast } from "../components/ui";
import {
  useAuthStore,
  useChatStore,
  useSelectedConversation,
  useCurrentMessages,
  useCurrentTypingStatus,
  useConversationCount,
} from "../stores";
import { useWebSocket } from "../hooks";
import type { Attachment, UserSummary } from "../types";
import { useFilePreview } from "../hooks/useFilePreview";
import type { PreviewTarget } from "../hooks/useFilePreview";
import { getPreviewType } from "../utils/formatFileSize";
import { UserStatus } from "../types";
import { isDirectConversation } from "../lib/conversationAdapter";
import { getOtherParticipant } from "../utils/messageHelpers";
import { resolveUserDisplayName } from "../features/chat/identity/resolveUserDisplayName";
import { logMessageDebug } from "../utils/messageDebug";
import { ErrorCode } from "@hacom/chat-shared-types";
import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";
import { useSendMessage } from "../features/chat/hooks/useSendMessage";
import { useConversationSession } from "../features/chat/hooks/useConversationSession";
import { useConversationValidation } from "../features/chat/hooks/useConversationValidation";
import {
  CHAT_OPEN_NEW_CHAT_EVENT,
  consumeOpenNewChatIntent,
} from "../lib/commandPalette";
import { chatApi } from "../features/chat/api";
import { selectConversationMessagesFromState } from "../stores/chatStore";
import type { ChatLayoutState } from "../utils/densityPolicy";

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

type InfoPanelMode = "conversation" | "self-profile";

const CONVERSATIONS_PAGE_SIZE = 100;

const DeferredPanelFallback: React.FC = () => (
  <div className="flex h-full items-center justify-center px-6">
    <Spinner size="md" />
  </div>
);

const DeferredModalFallback: React.FC = () => (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-text-primary/40 backdrop-blur-sm">
    <div className="rounded-2xl border border-border/80 bg-surface/95 p-4 shadow-elev3">
      <Spinner size="md" />
    </div>
  </div>
);

const loadReactionUseCases = () =>
  import("../features/chat/usecases/addReaction").then(
    async ({ addReactionUseCase }) => {
      const { removeReactionUseCase } = await import(
        "../features/chat/usecases/removeReaction"
      );
      return { addReactionUseCase, removeReactionUseCase };
    },
  );

const loadMessageMutationUseCases = () =>
  import("../features/chat/usecases/editMessage").then(
    async ({ editMessageUseCase }) => {
      const { deleteMessageUseCase } = await import(
        "../features/chat/usecases/deleteMessage"
      );
      return { editMessageUseCase, deleteMessageUseCase };
    },
  );

const loadConversationMutationUseCases = () =>
  import("../features/chat/usecases/createPrivateConversation").then(
    async ({ createPrivateConversationUseCase }) => {
      const [{ createGroupConversationUseCase }, { deleteConversationUseCase }] =
        await Promise.all([
          import("../features/chat/usecases/createGroupConversation"),
          import("../features/chat/usecases/deleteConversation"),
        ]);

      return {
        createPrivateConversationUseCase,
        createGroupConversationUseCase,
        deleteConversationUseCase,
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
    removeConversation,
    updateStoreMessage,
    removeStoreMessage,
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
      removeConversation: state.removeConversation,
      updateStoreMessage: state.updateMessage,
      removeStoreMessage: state.removeMessage,
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
  const conversationMessages = useCurrentMessages();
  const typingStatus = useCurrentTypingStatus();
  const conversationCount = useConversationCount();
  // WebSocket
  const { connectionState, sendTyping, stopTyping, joinRoom, leaveRoom } =
    useWebSocket();

  // Local state
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);
  const [infoPanelMode, setInfoPanelMode] = useState<InfoPanelMode | null>(
    null,
  );
  const [isMobileMenuOpen, setIsMobileMenuOpen] =
    useState(!routeConversationId);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1440,
  );
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const filePreview = useFilePreview();
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
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
    messageCount: conversationMessages.length,
    fetchMessages,
    markAsRead,
    joinRoom,
    leaveRoom,
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
      setIsMobileMenuOpen(false);
      if (id === routeConversationId) {
        return;
      }
      navigate(`/chat/${id}`);
    },
    [navigate, routeConversationId],
  );

  const handleSendMessage = useSendMessage({
    selectedConversationId,
    isConversationReady: sessionIsConversationReady,
    source: "ChatPage",
  });

  const handleReactMessage = useCallback(
    async (messageId: string, emoji: string) => {
      if (!selectedConversationId || !currentUserSummary) return;

      // Read directly from store to avoid depending on conversationMessages
      // (prevents callback recreation on every incoming message)
      const storeState = useChatStore.getState();
      const storeMessages = selectConversationMessagesFromState(
        storeState,
        selectedConversationId,
      );
      const targetMessage = storeMessages.find(
        (message) => message.id === messageId || message.localId === messageId,
      );
      if (!targetMessage) return;

      const existingReaction = targetMessage.reactions?.find(
        (reaction) => reaction.emoji === emoji,
      );
      const hasReacted = Boolean(
        existingReaction?.userIds?.includes(currentUserSummary.id),
      );

      // Optimistic update — apply immediately for snappy UX
      const optimisticReactions = hasReacted
        ? (targetMessage.reactions || [])
            .map((r) =>
              r.emoji === emoji
                ? {
                    ...r,
                    userIds: r.userIds.filter(
                      (id) => id !== currentUserSummary.id,
                    ),
                    count: r.count - 1,
                  }
                : r,
            )
            .filter((r) => r.count > 0)
        : [
            ...(targetMessage.reactions || []).filter((r) => r.emoji !== emoji),
            {
              emoji,
              userIds: [
                ...(existingReaction?.userIds || []),
                currentUserSummary.id,
              ],
              count: (existingReaction?.count || 0) + 1,
            },
          ];

      updateStoreMessage(selectedConversationId, messageId, {
        reactions: optimisticReactions,
      });

      try {
        const { addReactionUseCase, removeReactionUseCase } =
          await loadReactionUseCases();
        const response = hasReacted
          ? await removeReactionUseCase({ messageId, emoji })
          : await addReactionUseCase({ messageId, emoji });
        const updatedMessage = unwrapApiSuccess(response);

        updateStoreMessage(selectedConversationId, messageId, {
          reactions: Array.isArray(updatedMessage.reactions)
            ? updatedMessage.reactions
            : [],
        });
      } catch (error) {
        // Rollback to pre-optimistic state
        updateStoreMessage(selectedConversationId, messageId, {
          reactions: targetMessage.reactions,
        });
        const apiError = extractApiError(error);
        toast.error(apiError.message || t("error:generic.requestFailed"));
      }
    },
    [currentUserSummary, selectedConversationId, t, updateStoreMessage],
  );

  const handleEditMessage = useCallback(
    async (messageId: string, content: string) => {
      if (!selectedConversationId) return;

      try {
        const { editMessageUseCase } = await loadMessageMutationUseCases();
        const response = await editMessageUseCase({ messageId, content });
        const updatedMessage = unwrapApiSuccess(response);

        updateStoreMessage(selectedConversationId, messageId, {
          content: updatedMessage.content || content,
          isEdited: true,
          editedAt: updatedMessage.editedAt || new Date(),
        });
        toast.success(t("chat:toast.messageEdited"));
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(apiError.message || t("chat:toast.editFailed"));
      }
    },
    [selectedConversationId, t, updateStoreMessage],
  );

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      if (!selectedConversationId) return;

      try {
        const { deleteMessageUseCase } = await loadMessageMutationUseCases();
        await deleteMessageUseCase(messageId);
        removeStoreMessage(selectedConversationId, messageId);
        toast.success(t("chat:toast.messageDeleted"));
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(apiError.message || t("chat:toast.deleteFailed"));
      }
    },
    [removeStoreMessage, selectedConversationId, t],
  );

  const closeInfoPanel = useCallback(() => {
    setIsInfoPanelOpen(false);
    setInfoPanelMode(null);
  }, []);

  const openSelfProfile = useCallback(() => {
    setInfoPanelMode("self-profile");
    setIsInfoPanelOpen(true);
  }, []);

  const openConversationInfoPanel = useCallback(() => {
    setInfoPanelMode("conversation");
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

  useEffect(() => {
    if (infoPanelMode !== "conversation") {
      return;
    }

    if (!routeConversationId) {
      closeInfoPanel();
    }
  }, [
    closeInfoPanel,
    infoPanelMode,
    routeConversationId,
  ]);

  const handleDeleteConversation = useCallback(async () => {
    if (!selectedConversation) return;
    if (!window.confirm(t("profile:userProfile.deleteConversation"))) return;

    try {
      const { deleteConversationUseCase } =
        await loadConversationMutationUseCases();
      await deleteConversationUseCase(selectedConversation.id);
      removeConversation(selectedConversation.id);
      closeInfoPanel();
      selectConversation(null);
      navigate("/chat");
      toast.success(t("chat:toast.messageDeleted"));
    } catch (error) {
      const apiError = extractApiError(error);
      toast.error(apiError.message || t("error:generic.requestFailed"));
    }
  }, [
    closeInfoPanel,
    navigate,
    removeConversation,
    selectConversation,
    selectedConversation,
    t,
  ]);

  // Handle back (mobile)
  const handleBack = useCallback(() => {
    setIsMobileMenuOpen(true);
    navigate("/chat");
  }, [navigate]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Handle new chat
  const handleStartChat = useCallback(
    async (userId: string) => {
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
        const conversationId = payload.id;
        if (!conversationId) {
          throw new Error(t("error:chat.roomIdMissing"));
        }

        // Refresh list to get full conversation shape (participants, display fields...)
        fetchConversations().catch((error) => {
          console.warn(
            "Refresh conversations after creating direct conversation failed:",
            error,
          );
        });
        selectConversation(conversationId);
        navigate(`/chat/${conversationId}`);
      } catch (error) {
        const apiError = extractApiError(error);
        const details =
          apiError.details && typeof apiError.details === "object"
            ? (apiError.details as Record<string, unknown>)
            : null;
        const existingConversationId =
          details && typeof details.conversationId === "string"
            ? details.conversationId
            : details && typeof details.roomId === "string"
              ? details.roomId
              : null;

        if (
          existingConversationId &&
          (apiError.code === ErrorCode.CONFLICT ||
            apiError.code === ErrorCode.ROOM_ALREADY_EXISTS)
        ) {
          fetchConversations().catch((refreshError) => {
            console.warn(
              "Refresh conversations after conflict conversation lookup failed:",
              refreshError,
            );
          });
          selectConversation(existingConversationId);
          navigate(`/chat/${existingConversationId}`);
          return;
        }

        console.error("Create direct conversation failed:", apiError);
        toast.error(
          apiError.message || t("error:chat.startConversationFailed"),
        );
      } finally {
        roomCreationLockRef.current = false;
        setIsCreatingRoom(false);
      }
    },
    [fetchConversations, isCreatingRoom, navigate, selectConversation, t],
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
        const conversationId = conversationPayload.id;
        if (!conversationId) {
          throw new Error(t("error:chat.roomIdMissing"));
        }

        fetchConversations().catch((error) => {
          console.warn(
            "Refresh conversations after creating group conversation failed:",
            error,
          );
        });
        selectConversation(conversationId);
        navigate(`/chat/${conversationId}`);
      } catch (error) {
        const apiError = extractApiError(error);
        console.error("Create group conversation failed:", apiError);
        toast.error(apiError.message || t("error:chat.createGroupFailed"));
      } finally {
        roomCreationLockRef.current = false;
        setIsCreatingRoom(false);
      }
    },
    [fetchConversations, isCreatingRoom, navigate, selectConversation, t],
  );

  // Handle new chat modal
  const handleOpenNewChat = useCallback(() => {
    setIsNewChatModalOpen(true);
  }, []);

  useEffect(() => {
    if (consumeOpenNewChatIntent()) {
      setIsNewChatModalOpen(true);
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

  const showSidebarOnMobile = !routeConversationId || isMobileMenuOpen;
  const shouldRenderInfoContent =
    isInfoPanelOpen &&
    (infoPanelMode === "self-profile" ||
      (infoPanelMode === "conversation" && Boolean(routeConversationId)));
  const chatLayoutState = useMemo<ChatLayoutState>(() => {
    if (viewportWidth < 1024) {
      return "mobile";
    }

    return shouldRenderInfoContent ? "with-panel" : "normal";
  }, [shouldRenderInfoContent, viewportWidth]);
  const showConversationSkeleton =
    (!hasFetchedConversationsOnce && conversationCount === 0) ||
    (isLoadingConversations && conversationCount === 0);

  const handleOpenFilePreview = useCallback(
    (attachment: Attachment) => {
      if (!selectedConversation) {
        return;
      }

      const target: PreviewTarget = {
        attachment,
        conversationId: selectedConversation.id,
        previewType: getPreviewType(attachment.mimeType),
      };
      const gallery = conversationMessages
        .flatMap((message) =>
          (message.attachments ?? []).map((candidate) => ({
            attachment: candidate,
            conversationId: selectedConversation.id,
            messageId: message.id,
            previewType: getPreviewType(candidate.mimeType),
          })),
        )
        .filter((candidate) => candidate.previewType !== "unsupported");
      filePreview.open(target, gallery.length > 0 ? gallery : undefined);
    },
    [conversationMessages, filePreview, selectedConversation],
  );

  const handleExternalJumpHandled = useCallback((messageId: string) => {
    setExternalJumpTargetMessageId((current) =>
      current === messageId ? null : current,
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ userId?: string }>;
      const userId = customEvent.detail?.userId;
      if (!userId) return;

      void handleStartChat(userId).then(() => {
        openConversationInfoPanel();
      });
    };

    window.addEventListener(
      "chat:contact:view-profile",
      handler as EventListener,
    );
    return () => {
      window.removeEventListener(
        "chat:contact:view-profile",
        handler as EventListener,
      );
    };
  }, [handleStartChat, openConversationInfoPanel]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (
      event: Event,
    ) => {
      const customEvent = event as CustomEvent<{
        conversationId?: string;
        messageId?: string;
      }>;
      const nextConversationId = customEvent.detail?.conversationId;
      const nextMessageId = customEvent.detail?.messageId;
      if (!nextConversationId) return;

      setIsMobileMenuOpen(false);
      if (nextMessageId) {
        setExternalJumpTargetMessageId(nextMessageId);
        setExternalJumpRequestVersion((current) => current + 1);
      }

      if (routeConversationId !== nextConversationId) {
        navigate(`/chat/${nextConversationId}`);
      }
    };

    window.addEventListener(
      "chat:notification:clicked",
      handler as EventListener,
    );
    return () => {
      window.removeEventListener(
        "chat:notification:clicked",
        handler as EventListener,
      );
    };
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
      return (
        <div className="flex h-[100dvh] items-center justify-center bg-[hsl(var(--color-chat-canvas))] px-6">
          <div className="w-full max-w-xl space-y-5 rounded-2xl border border-border/80 bg-surface/90 p-6 shadow-elev1">
            <div className="flex items-center gap-3">
              <Spinner size="md" />
              <p className="text-sm font-medium text-text-secondary">
                {t("common:loading.checkingAuth", {
                  defaultValue: "Checking your session...",
                })}
              </p>
            </div>
            <div className="space-y-3">
              <div className="h-3 w-1/2 animate-pulse rounded-full bg-surface-overlay" />
              <div className="h-3 w-full animate-pulse rounded-full bg-surface-overlay" />
              <div className="h-3 w-4/5 animate-pulse rounded-full bg-surface-overlay" />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[hsl(var(--color-chat-canvas))] px-6">
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
    <div
      className="chat-page-shell relative flex h-[100dvh] max-h-[100dvh] overflow-hidden bg-[hsl(var(--color-chat-canvas))]"
      data-chat-layout-state={chatLayoutState}
    >
      {/* Sidebar */}
      <div
        className={clsx(
          "absolute inset-y-0 left-0 z-30 w-full max-w-full transition-transform duration-300 sm:max-w-[min(23rem,94vw)] lg:relative lg:z-0 lg:w-auto lg:max-w-none lg:flex-shrink-0",
          showSidebarOnMobile
            ? "translate-x-0"
            : "-translate-x-full lg:translate-x-0",
        )}
        aria-hidden={!showSidebarOnMobile}
      >
        <Sidebar
          layoutState={chatLayoutState}
          currentUser={currentUserSummary}
          selectedId={routeConversationId}
          isLoadingConversations={isLoadingConversations}
          isLoadingMoreConversations={isLoadingMoreConversations}
          hasMoreConversations={hasMoreConversations}
          showConversationSkeleton={showConversationSkeleton}
          conversationsError={conversationsError}
          onSelectConversation={handleSelectConversation}
          onRetryConversations={fetchConversations}
          onLoadMoreConversations={handleLoadMoreConversations}
          onNewChat={handleOpenNewChat}
          onCurrentUserClick={handleOpenCurrentUserProfile}
        />
      </div>

      {showSidebarOnMobile && routeConversationId && (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-text-primary/40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-label={t("common:actions.close")}
        />
      )}

      {/* Chat window */}
      <div
        className={clsx(
          "relative z-10 flex min-w-0 flex-1 flex-col",
          !selectedConversation && "hidden lg:flex",
        )}
      >
        {selectedConversation ? (
          <ChatWindow
            layoutState={chatLayoutState}
            conversation={selectedConversation}
            messages={conversationMessages}
            currentUser={currentUserSummary}
            typingStatus={typingStatus || undefined}
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
            "fixed inset-y-0 right-0 z-40 w-full max-w-full border-l border-border bg-surface transition-transform duration-300 sm:max-w-[min(26rem,94vw)] lg:relative lg:z-0 lg:w-[clamp(19.5rem,24vw,22rem)] lg:max-w-none",
            isInfoPanelOpen ? "translate-x-0" : "translate-x-full lg:hidden",
          )}
            style={{ backgroundColor: "hsl(var(--color-sidebar-surface))" }}
          >
            {shouldRenderInfoContent ? (
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
                ) : infoPanelMode === "conversation" && !selectedConversation ? (
                  <DeferredPanelFallback />
                ) : isSelectedDirectConversation ? (
                  otherUser ? (
                    <UserProfile
                      key={`conversation-profile:${selectedConversation?.id ?? "unknown"}:${otherUser.id}`}
                      userId={otherUser.id}
                      currentUserId={currentUserSummary.id}
                    initialUser={{
                      id: otherUser.id,
                      username: otherUser.username,
                      displayName: otherUser.displayName,
                      avatar: otherUser.avatar,
                      status: otherUser.status,
                    }}
                    onClose={closeInfoPanel}
                    onDeleteConversation={handleDeleteConversation}
                    onStartConversation={handleStartChat}
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                    <Spinner size="md" />
                    <p className="text-sm text-text-muted">
                      {t("common:loading.default")}
                    </p>
                  </div>
                )
              ) : selectedConversation ? (
                <GroupInfo
                  conversation={selectedConversation}
                  currentUserId={currentUserSummary.id}
                  onClose={closeInfoPanel}
                  onDeleteConversation={handleDeleteConversation}
                />
              ) : null}
            </React.Suspense>
          ) : null}
        </div>
      )}

      {/* Info panel overlay (mobile) */}
      {isInfoPanelOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-text-primary/50 lg:hidden"
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
    </div>
  );
};

export default ChatPage;
