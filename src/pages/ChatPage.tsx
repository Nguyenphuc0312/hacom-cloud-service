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
  useHasConversation,
  useAdjacentConversationIds,
} from "../stores";
import { useWebSocket } from "../hooks";
import type { Attachment, Message, UserSummary } from "../types";
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
import { getConversationByIdUseCase } from "../features/chat/usecases/getConversationById";
import { createPrivateConversationUseCase } from "../features/chat/usecases/createPrivateConversation";
import { createGroupConversationUseCase } from "../features/chat/usecases/createGroupConversation";
import { deleteConversationUseCase } from "../features/chat/usecases/deleteConversation";
import { addReactionUseCase } from "../features/chat/usecases/addReaction";
import { removeReactionUseCase } from "../features/chat/usecases/removeReaction";
import { editMessageUseCase } from "../features/chat/usecases/editMessage";
import { deleteMessageUseCase } from "../features/chat/usecases/deleteMessage";
import { useSendMessage } from "../features/chat/hooks/useSendMessage";
import {
  CHAT_OPEN_NEW_CHAT_EVENT,
  consumeOpenNewChatIntent,
} from "../lib/commandPalette";
import { chatApi } from "../features/chat/api";

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

type IdleCallbackDeadline = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

interface ProfilePanelTarget {
  userId: string;
  initialUser?: {
    id: string;
    username?: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    status?: UserStatus;
  } | null;
}

interface ConversationValidationError {
  conversationId: string;
  message: string;
}

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (
    callback: (deadline: IdleCallbackDeadline) => void,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const scheduleIdleTask = (task: () => void): (() => void) => {
  if (typeof window === "undefined") return () => {};

  const idleWindow = window as WindowWithIdleCallback;
  if (typeof idleWindow.requestIdleCallback === "function") {
    const handle = idleWindow.requestIdleCallback(
      (deadline) => {
        if (deadline.didTimeout || deadline.timeRemaining() > 4) {
          task();
          return;
        }
        window.setTimeout(task, 0);
      },
      { timeout: 1200 },
    );

    return () => {
      idleWindow.cancelIdleCallback?.(handle);
    };
  }

  const timeoutId = window.setTimeout(task, 240);
  return () => {
    window.clearTimeout(timeoutId);
  };
};

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
  const currentHasMore = useChatStore((state) =>
    selectedConversationId
      ? (state.hasMoreMessages[selectedConversationId] ?? true)
      : false,
  );
  const currentIsLoading = useChatStore((state) =>
    selectedConversationId
      ? Boolean(state.isLoadingMessagesByConversation[selectedConversationId])
      : false,
  );
  const currentMessageError = useChatStore((state) =>
    selectedConversationId
      ? (state.messageErrors[selectedConversationId] ?? null)
      : null,
  );

  // Selectors
  const selectedConversation = useSelectedConversation();
  const conversationMessages = useCurrentMessages();
  const typingStatus = useCurrentTypingStatus();
  const isSelectedConversationHydrated = useChatStore((state) =>
    selectedConversationId
      ? Boolean(state.messagesHydratedByConversation[selectedConversationId])
      : false,
  );
  const conversationCount = useConversationCount();
  const hasConversationCachedForRoute = useHasConversation(routeConversationId);
  const [previousConversationId, nextConversationId] =
    useAdjacentConversationIds(selectedConversationId);
  // WebSocket
  const { connectionState, sendTyping, stopTyping, joinRoom, leaveRoom } =
    useWebSocket();

  // Local state
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);
  const [profilePanelTarget, setProfilePanelTarget] =
    useState<ProfilePanelTarget | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] =
    useState(!routeConversationId);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const filePreview = useFilePreview();
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] =
    useState(false);
  const [hasMoreConversations, setHasMoreConversations] = useState(true);
  const conversationsPageRef = useRef(1);
  const roomCreationLockRef = useRef(false);
  const [isValidatingRoom, setIsValidatingRoom] = useState(false);
  const [lastValidatedConversationId, setLastValidatedConversationId] =
    useState<string | null>(null);
  const [conversationValidationError, setConversationValidationError] =
    useState<ConversationValidationError | null>(null);
  const [validationRetryToken, setValidationRetryToken] = useState(0);
  const [externalJumpTargetMessageId, setExternalJumpTargetMessageId] =
    useState<string | null>(null);
  const [externalJumpRequestVersion, setExternalJumpRequestVersion] =
    useState(0);
  const directInfoHydratedRef = useRef<Set<string>>(new Set());
  const lastVisibleReadAnchorKeyRef = useRef<string | null>(null);
  const renderCountRef = useRef(0);
  const validatingConversationIdRef = useRef<string | null>(null);

  const conversationAccessDeniedMessage = t(
    "error:chat.conversationAccessDenied",
  );
  const conversationOpenFailedMessage = t("error:chat.conversationOpenFailed");

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

  // Validate room in URL then sync to store.
  useEffect(() => {
    let isCancelled = false;

    if (!conversationId) {
      if (validatingConversationIdRef.current) {
        validatingConversationIdRef.current = null;
      }
      setLastValidatedConversationId((previous) =>
        previous === null ? previous : null,
      );
      setConversationValidationError(null);
      setIsValidatingRoom(false);
      return;
    }

    const chatState = useChatStore.getState();
    const hasConversationInStore = chatState.conversations.some(
      (conversation) => conversation.id === conversationId,
    );

    if (
      lastValidatedConversationId === conversationId &&
      hasConversationInStore
    ) {
      if (shouldTraceRenderLoop) {
        logMessageDebug("ChatPage", "conversation_validation_skipped_cached", {
          conversationId,
        });
      }
      return;
    }

    if (validatingConversationIdRef.current === conversationId) {
      if (shouldTraceRenderLoop) {
        logMessageDebug(
          "ChatPage",
          "conversation_validation_skipped_in_flight",
          {
            conversationId,
          },
        );
      }
      return;
    }

    validatingConversationIdRef.current = conversationId;

    const validateConversation = async () => {
      setIsValidatingRoom(true);
      setConversationValidationError((previous) =>
        previous?.conversationId === conversationId ? null : previous,
      );
      if (shouldTraceRenderLoop) {
        logMessageDebug("ChatPage", "conversation_validation_requested", {
          conversationId,
        });
      }
      try {
        const response = await getConversationByIdUseCase(conversationId);
        const room = unwrapApiSuccess(response);
        if (isCancelled) return;

        const existingRoom = useChatStore
          .getState()
          .conversations.find(
            (conversation) => conversation.id === conversationId,
          );

        const shouldUpdateExistingRoom = Boolean(
          existingRoom &&
          (existingRoom.updatedAt !== room.updatedAt ||
            existingRoom.unreadCount !== room.unreadCount ||
            existingRoom.lastMessage?.id !== room.lastMessage?.id ||
            existingRoom.displayName !== room.displayName ||
            existingRoom.name !== room.name ||
            existingRoom.avatar !== room.avatar ||
            existingRoom.participants?.length !== room.participants?.length),
        );

        if (!existingRoom) {
          addConversation(room);
        } else if (shouldUpdateExistingRoom) {
          updateConversation(conversationId, room);
        }

        setLastValidatedConversationId((previous) =>
          previous === conversationId ? previous : conversationId,
        );
        setConversationValidationError(null);
        if (shouldTraceRenderLoop) {
          logMessageDebug("ChatPage", "conversation_validation_succeeded", {
            conversationId,
            roomInserted: !existingRoom,
            roomUpdated: shouldUpdateExistingRoom,
          });
        }
      } catch (error: unknown) {
        if (isCancelled) return;

        const apiError = extractApiError(error);
        const code = String(apiError.code || "").toUpperCase();
        const roomInvalidCodes = new Set([
          "NOT_FOUND",
          "ROOM_NOT_FOUND",
          "FORBIDDEN",
          "ROOM_ACCESS_DENIED",
        ]);

        if (roomInvalidCodes.has(code)) {
          setConversationValidationError(null);
          toast.error(conversationAccessDeniedMessage);
          navigate("/chat", { replace: true });
        } else {
          const message = apiError.message || conversationOpenFailedMessage;
          setConversationValidationError({
            conversationId,
            message,
          });
          toast.error(message);
        }

        setLastValidatedConversationId((previous) =>
          previous === null ? previous : null,
        );
        if (shouldTraceRenderLoop) {
          logMessageDebug("ChatPage", "conversation_validation_failed", {
            conversationId,
            code,
            message: apiError.message,
          });
        }
      } finally {
        if (
          !isCancelled &&
          validatingConversationIdRef.current === conversationId
        ) {
          validatingConversationIdRef.current = null;
          setIsValidatingRoom(false);
        }
      }
    };

    void validateConversation();

    return () => {
      isCancelled = true;
    };
  }, [
    addConversation,
    conversationAccessDeniedMessage,
    conversationId,
    conversationOpenFailedMessage,
    lastValidatedConversationId,
    navigate,
    shouldTraceRenderLoop,
    updateConversation,
    validationRetryToken,
  ]);

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

      useChatStore.getState().setConversations(fetched);
      conversationsPageRef.current = nextPage;
      setHasMoreConversations(fetched.length >= CONVERSATIONS_PAGE_SIZE);
    } catch (error) {
      const apiError = extractApiError(error);
      toast.error(apiError.message || t("error:chat.fetchConversationsFailed"));
    } finally {
      setIsLoadingMoreConversations(false);
    }
  }, [hasMoreConversations, isLoadingMoreConversations, t]);

  const canBootstrapConversationFromCache =
    hasConversationCachedForRoute && routeConversationId === selectedConversationId;

  // Load messages when conversation changes & join/leave rooms
  useEffect(() => {
    if (!selectedConversationId || (isValidatingRoom && !canBootstrapConversationFromCache)) {
      return;
    }

    void (async () => {
      const chatState = useChatStore.getState();
      const isConversationHydrated =
        chatState.messagesHydratedByConversation[selectedConversationId] ===
        true;
      const hasNewerMessages =
        chatState.hasNewerMessagesByConversation[selectedConversationId] ??
        false;

      logMessageDebug("ChatPage", "conversation_open_started", {
        conversationId: selectedConversationId,
        isHydrated: isConversationHydrated,
        isValidatingRoom,
        hasNewer: hasNewerMessages,
      });
      logMessageDebug("ChatPage", "room_join_requested", {
        conversationId: selectedConversationId,
        skipInitialDeltaSync: false,
        reason: "conversation_open",
      });
      joinRoom(selectedConversationId, { skipInitialDeltaSync: false });

      if (!isConversationHydrated) {
        const initialFetchResult = await fetchMessages(selectedConversationId);
        logMessageDebug("ChatPage", "initial_fetch_completed", {
          conversationId: selectedConversationId,
          result: initialFetchResult,
        });
      }
    })();

    return () => {
      stopTyping(selectedConversationId);
      leaveRoom(selectedConversationId);
    };
  }, [
    canBootstrapConversationFromCache,
    selectedConversationId,
    isValidatingRoom,
    fetchMessages,
    joinRoom,
    leaveRoom,
    stopTyping,
  ]);

  useEffect(() => {
    lastVisibleReadAnchorKeyRef.current = null;
  }, [selectedConversationId]);

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

  const isCurrentRouteValidated = conversationId
    ? lastValidatedConversationId === conversationId ||
      hasConversationCachedForRoute
    : true;
  const isConversationHistoryReady = isSelectedConversationHydrated;
  const isConversationReady = Boolean(
    selectedConversationId &&
    selectedConversation &&
    isCurrentRouteValidated,
  );
  const websocketReady = connectionState === "connected";

  const handleSendMessage = useSendMessage({
    selectedConversationId,
    isConversationReady,
    source: "ChatPage",
  });

  const handleLoadOlderMessages = useCallback(async () => {
    if (!selectedConversationId) return;

    // Read from store directly to avoid depending on conversationMessages,
    // hasMoreMessages, and isLoadingMessagesByConversation — prevents
    // callback recreation on every incoming message.
    const storeState = useChatStore.getState();
    if (storeState.isLoadingMessagesByConversation[selectedConversationId]) {
      return;
    }
    if (!storeState.hasMoreMessages[selectedConversationId]) return;

    const storeMessages = storeState.messages[selectedConversationId] || [];
    const oldestMessage = storeMessages.find(
      (message) => !message.id.startsWith("temp-"),
    );
    if (!oldestMessage) return;

    await fetchMessages(
      selectedConversationId,
      new Date(oldestMessage.createdAt).toISOString(),
      undefined,
      { beforeId: oldestMessage.id },
    );
  }, [selectedConversationId, fetchMessages]);

  const handleRetryMessages = useCallback(async () => {
    if (!selectedConversationId) return;
    const storeState = useChatStore.getState();
    if (storeState.isLoadingMessagesByConversation[selectedConversationId])
      return;
    await fetchMessages(selectedConversationId, undefined, undefined, {
      force: true,
    });
  }, [fetchMessages, selectedConversationId]);

  const handleReachedLatestMessage = useCallback(
    (message: Message) => {
      if (!selectedConversationId) return;
      if (message.id.startsWith("temp-")) {
        return;
      }

      const conversation = useChatStore
        .getState()
        .conversations.find((item) => item.id === selectedConversationId);
      if (!conversation) return;
      const alreadyReadUpToLatest =
        conversation.lastReadMessageId === message.id &&
        (conversation.unreadCount ?? 0) <= 0;
      if (alreadyReadUpToLatest) {
        return;
      }

      const latestKey = `${selectedConversationId}:${message.id}`;
      if (lastVisibleReadAnchorKeyRef.current === latestKey) {
        return;
      }

      lastVisibleReadAnchorKeyRef.current = latestKey;
      void markAsRead(selectedConversationId, message.id).catch(() => {
        if (lastVisibleReadAnchorKeyRef.current === latestKey) {
          lastVisibleReadAnchorKeyRef.current = null;
        }
      });
    },
    [markAsRead, selectedConversationId],
  );

  useEffect(() => {
    if (!selectedConversationId || (isValidatingRoom && !canBootstrapConversationFromCache)) {
      return;
    }

    const candidateRoomIds = [previousConversationId, nextConversationId].filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
    if (candidateRoomIds.length === 0) return;

    let isCancelled = false;
    const cancelScheduledTask = scheduleIdleTask(() => {
      void (async () => {
        for (const candidateRoomId of candidateRoomIds) {
          if (isCancelled) return;
          const state = useChatStore.getState();
          if (state.messagesHydratedByConversation[candidateRoomId]) continue;
          if (state.isLoadingMessagesByConversation[candidateRoomId]) continue;
          await state.fetchMessages(candidateRoomId, undefined, undefined, {
            limit: 20,
          });
        }
      })();
    });

    return () => {
      isCancelled = true;
      cancelScheduledTask();
    };
  }, [
    canBootstrapConversationFromCache,
    isValidatingRoom,
    nextConversationId,
    previousConversationId,
    selectedConversationId,
  ]);

  const handleReactMessage = useCallback(
    async (messageId: string, emoji: string) => {
      if (!selectedConversationId || !currentUserSummary) return;

      // Read directly from store to avoid depending on conversationMessages
      // (prevents callback recreation on every incoming message)
      const storeState = useChatStore.getState();
      const storeMessages = storeState.messages[selectedConversationId] || [];
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

  // Handle typing
  const handleTyping = useCallback(
    (isTyping: boolean) => {
      if (selectedConversationId) {
        if (isTyping) {
          sendTyping(selectedConversationId);
        } else {
          stopTyping(selectedConversationId);
        }
      }
    },
    [selectedConversationId, sendTyping, stopTyping],
  );

  const closeInfoPanel = useCallback(() => {
    setIsInfoPanelOpen(false);
    setProfilePanelTarget(null);
  }, []);

  const openUserProfile = useCallback((target: ProfilePanelTarget) => {
    setProfilePanelTarget(target);
    setIsInfoPanelOpen(true);
  }, []);

  // Handle toggle info panel
  const handleToggleInfoPanel = useCallback(() => {
    if (isInfoPanelOpen) {
      closeInfoPanel();
      return;
    }

    if (isSelectedDirectConversation && otherUser) {
      openUserProfile({
        userId: otherUser.id,
        initialUser: {
          id: otherUser.id,
          username: otherUser.username,
          displayName: otherUser.displayName,
          avatar: otherUser.avatar,
          status: otherUser.status,
        },
      });
      return;
    }

    setProfilePanelTarget(null);
    setIsInfoPanelOpen(true);
  }, [
    closeInfoPanel,
    isInfoPanelOpen,
    isSelectedDirectConversation,
    openUserProfile,
    otherUser,
  ]);

  const handleDeleteConversation = useCallback(async () => {
    if (!selectedConversation) return;
    if (!window.confirm(t("profile:userProfile.deleteConversation"))) return;

    try {
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
    openUserProfile({
      userId: currentUserSummary.id,
      initialUser: {
        id: currentUserSummary.id,
        username: currentUserSummary.username,
        displayName: currentUserSummary.displayName,
        avatar: currentUserSummary.avatar,
        status: currentUserSummary.status,
      },
    });
  }, [currentUserSummary, openUserProfile]);

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
        const conversationPayloadRecord = conversationPayload as unknown as {
          invitedMemberIds?: unknown[];
        };
        const invited = Array.isArray(
          conversationPayloadRecord.invitedMemberIds,
        )
          ? conversationPayloadRecord.invitedMemberIds.length
          : 0;
        if (invited > 0) {
          toast.info(`${invited} member invite(s) are pending acceptance`);
        }
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
    isInfoPanelOpen || Boolean(profilePanelTarget);
  const showConversationSkeleton =
    (!hasFetchedConversationsOnce && conversationCount === 0) ||
    (isLoadingConversations && conversationCount === 0);

  const previewGallery = useMemo<PreviewTarget[]>(() => {
    if (!selectedConversation) {
      return [];
    }

    return conversationMessages
      .flatMap((msg) =>
        (msg.attachments ?? []).map((att) => ({
          attachment: att,
          conversationId: selectedConversation.id,
          messageId: msg.id,
          previewType: getPreviewType(att.mimeType),
        })),
      )
      .filter((target) => target.previewType !== "unsupported");
  }, [conversationMessages, selectedConversation]);

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
      filePreview.open(target, previewGallery.length > 0 ? previewGallery : undefined);
    },
    [filePreview, previewGallery, selectedConversation],
  );

  const handleExternalJumpHandled = useCallback((messageId: string) => {
    setExternalJumpTargetMessageId((current) =>
      current === messageId ? null : current,
    );
  }, []);

  useEffect(() => {
    if (!selectedConversationId) return;

    logMessageDebug("ChatPage", "conversation_readiness_changed", {
      conversationId: selectedConversationId,
      isValidatingRoom,
      isHydrated: isConversationHistoryReady,
      isHistoryReady: isConversationHistoryReady,
      isCurrentRouteValidated,
      isReady: isConversationReady,
      isSendReady: isConversationReady,
      websocketReady,
      messageCount: conversationMessages.length,
      connectionState,
    });
  }, [
    connectionState,
    conversationMessages.length,
    isCurrentRouteValidated,
    isConversationReady,
    isConversationHistoryReady,
    isValidatingRoom,
    lastValidatedConversationId,
    selectedConversationId,
    websocketReady,
  ]);

  useEffect(() => {
    if (!selectedConversationId || !isSelectedDirectConversation || otherUser) {
      return;
    }

    if (directInfoHydratedRef.current.has(selectedConversationId)) {
      return;
    }
    directInfoHydratedRef.current.add(selectedConversationId);

    let isCancelled = false;
    void getConversationByIdUseCase(selectedConversationId)
      .then((response) => {
        if (isCancelled) return;
        const conversation = unwrapApiSuccess(response);
        updateConversation(selectedConversationId, conversation);
      })
      .catch(() => {
        // no-op: fallback UI keeps skeleton and retries on next navigation
      });

    return () => {
      isCancelled = true;
    };
  }, [
    isSelectedDirectConversation,
    otherUser,
    selectedConversationId,
    updateConversation,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ userId?: string }>;
      const userId = customEvent.detail?.userId;
      if (!userId) return;

      void handleStartChat(userId).then(() => {
        openUserProfile({
          userId,
          initialUser: { id: userId },
        });
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
  }, [handleStartChat, openUserProfile]);

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

  const handleRetryConversationValidation = useCallback(() => {
    if (!routeConversationId) {
      return;
    }

    setConversationValidationError(null);
    setLastValidatedConversationId(null);
    setValidationRetryToken((current) => current + 1);
  }, [routeConversationId]);

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
    <div className="relative flex h-[100dvh] max-h-[100dvh] overflow-hidden bg-[hsl(var(--color-chat-canvas))]">
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
            onTyping={handleTyping}
            hasMoreMessages={currentHasMore}
            isLoadingMessages={currentIsLoading || !isConversationHistoryReady}
            onLoadOlderMessages={handleLoadOlderMessages}
            onImageClick={setImagePreview}
            onFilePreview={handleOpenFilePreview}
            messageError={currentMessageError}
            onRetryMessages={handleRetryMessages}
            onReachedLatestMessage={handleReachedLatestMessage}
            connectionState={connectionState}
            isConversationReady={isConversationReady}
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
      {(selectedConversation || profilePanelTarget) && (
        <div
          className={clsx(
            "fixed inset-y-0 right-0 z-40 w-full max-w-full border-l border-border bg-surface transition-transform duration-300 sm:max-w-[min(26rem,94vw)] lg:relative lg:z-0 lg:w-[clamp(20rem,28vw,24rem)] lg:max-w-none",
            isInfoPanelOpen ? "translate-x-0" : "translate-x-full lg:hidden",
          )}
          style={{ backgroundColor: "hsl(var(--color-sidebar-surface))" }}
        >
          {shouldRenderInfoContent ? (
            <React.Suspense fallback={<DeferredPanelFallback />}>
              {profilePanelTarget ? (
                <UserProfile
                  userId={profilePanelTarget.userId}
                  currentUserId={currentUserSummary.id}
                  initialUser={profilePanelTarget.initialUser ?? null}
                  onClose={closeInfoPanel}
                  onDeleteConversation={
                    selectedConversation &&
                    isSelectedDirectConversation &&
                    otherUser?.id === profilePanelTarget.userId
                      ? handleDeleteConversation
                      : undefined
                  }
                  onStartConversation={handleStartChat}
                />
              ) : isSelectedDirectConversation ? (
                otherUser ? (
                  <UserProfile
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
