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
import { UserProfile } from "../components/info/UserProfile";
import { GroupInfo } from "../components/info/GroupInfo";
import { NoChatSelected, Spinner } from "../components/ui";
import {
  NewChatModal,
  ImagePreviewModal,
  FilePreviewModal,
} from "../components/modals";
import { toast } from "../components/ui";
import {
  useAuthStore,
  useChatStore,
  useGroupStore,
  useSelectedConversation,
  useCurrentMessages,
  useCurrentTypingStatus,
} from "../stores";
import { useWebSocket } from "../hooks";
import { conversationApi, messageApi } from "../services/api";
import type { Attachment, Message, UserSummary } from "../types";
import { useFilePreview } from "../hooks/useFilePreview";
import type { PreviewTarget } from "../hooks/useFilePreview";
import { getPreviewType } from "../utils/formatFileSize";
import { rankConversations } from "../utils/conversationRanking";
import { MessageType, UserStatus } from "../types";
import { isDirectConversation } from "../lib/conversationAdapter";
import { getOtherParticipant } from "../utils/messageHelpers";
import {
  isMessageDebugEnabled,
  logMessageDebug,
} from "../utils/messageDebug";
import { ErrorCode } from "@hacom/chat-shared-types";
import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";

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

export const ChatPage: React.FC = () => {
  const { t } = useTranslation();
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();

  // Auth store
  const { user } = useAuthStore();
  const setSlowModeCooldown = useGroupStore((s) => s.setSlowModeCooldown);

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
    conversations,
    isLoadingConversations,
    hasFetchedConversationsOnce,
    conversationsError,
    fetchConversations,
    fetchMessages,
    storeSendMessage,
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
      conversations: state.conversations,
      isLoadingConversations: state.isLoadingConversations,
      hasFetchedConversationsOnce: state.hasFetchedConversationsOnce,
      conversationsError: state.conversationsError,
      fetchConversations: state.fetchConversations,
      fetchMessages: state.fetchMessages,
      storeSendMessage: state.sendMessage,
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
  const selectedConversationHasNewer = useChatStore((state) =>
    selectedConversationId
      ? (state.hasNewerMessagesByConversation[selectedConversationId] ?? false)
      : false,
  );

  // WebSocket
  const { connectionState, sendTyping, stopTyping, joinRoom, leaveRoom } =
    useWebSocket();

  // Local state
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);
  const [profilePanelTarget, setProfilePanelTarget] =
    useState<ProfilePanelTarget | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(!conversationId);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const filePreview = useFilePreview();
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const roomCreationLockRef = useRef(false);
  const [isValidatingRoom, setIsValidatingRoom] = useState(false);
  const directInfoHydratedRef = useRef<Set<string>>(new Set());
  const lastReadSyncKeyRef = useRef<string | null>(null);

  // Current user as UserSummary for components
  const currentUserSummary = useMemo<UserSummary | null>(
    () =>
      user
        ? {
            id: user.id,
            username: user.username,
            displayName:
              `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
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
      if (useChatStore.getState().selectedConversationId !== null) {
        selectConversation(null);
      }
      return;
    }

    const validateConversation = async () => {
      setIsValidatingRoom(true);
      try {
        const response =
          await conversationApi.getConversationById(conversationId);
        const room = unwrapApiSuccess(response);
        if (isCancelled) return;

        const roomExists = useChatStore
          .getState()
          .conversations.some(
            (conversation) => conversation.id === conversationId,
          );

        if (roomExists) {
          updateConversation(conversationId, room);
        } else {
          addConversation(room);
        }

        if (conversationId !== useChatStore.getState().selectedConversationId) {
          selectConversation(conversationId);
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
          toast.error(t("error:chat.conversationAccessDenied"));
        } else {
          toast.error(
            apiError.message || t("error:chat.conversationOpenFailed"),
          );
        }

        selectConversation(null);
        navigate("/chat", { replace: true });
      } finally {
        if (!isCancelled) {
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
    conversationId,
    navigate,
    selectConversation,
    updateConversation,
  ]);

  // Load conversations on mount
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Load messages when conversation changes & join/leave rooms
  useEffect(() => {
    if (!selectedConversationId || isValidatingRoom) {
      return;
    }

    let cancelled = false;

    void (async () => {
      let skipInitialDeltaSync =
        isSelectedConversationHydrated && !selectedConversationHasNewer;
      logMessageDebug("ChatPage", "conversation_open_started", {
        conversationId: selectedConversationId,
        isHydrated: isSelectedConversationHydrated,
        isValidatingRoom,
        hasNewer: selectedConversationHasNewer,
      });
      if (!isSelectedConversationHydrated) {
        const initialFetchResult = await fetchMessages(selectedConversationId);
        logMessageDebug("ChatPage", "initial_fetch_completed", {
          conversationId: selectedConversationId,
          result: initialFetchResult,
        });
        skipInitialDeltaSync =
          initialFetchResult.applied && !initialFetchResult.hasNext;
      }
      if (!cancelled) {
        logMessageDebug("ChatPage", "join_room_requested", {
          conversationId: selectedConversationId,
          skipInitialDeltaSync,
        });
        joinRoom(selectedConversationId, { skipInitialDeltaSync });
      }
    })();

    return () => {
      cancelled = true;
      stopTyping(selectedConversationId);
      leaveRoom(selectedConversationId);
    };
  }, [
    selectedConversationId,
    isSelectedConversationHydrated,
    selectedConversationHasNewer,
    isValidatingRoom,
    fetchMessages,
    joinRoom,
    leaveRoom,
    stopTyping,
  ]);

  useEffect(() => {
    lastReadSyncKeyRef.current = null;
  }, [selectedConversationId]);

  // Handle select conversation
  const handleSelectConversation = useCallback(
    (id: string) => {
      selectConversation(id);
      setIsMobileMenuOpen(false);
      navigate(`/chat/${id}`);
    },
    [selectConversation, navigate],
  );

  // Handle send message
  const handleSendMessage = useCallback(
    async (
      content: string,
      replyTo?: Message,
      fileMeta?: Attachment | Attachment[] | undefined,
      type: MessageType = MessageType.TEXT,
    ) => {
      if (!selectedConversationId) return;

      try {
        return await storeSendMessage(
          selectedConversationId,
          content,
          type,
          fileMeta,
          replyTo?.id,
          replyTo,
        );
      } catch (error) {
        const apiError = extractApiError(error);
        const details =
          apiError.details && typeof apiError.details === "object"
            ? (apiError.details as Record<string, unknown>)
            : null;
        const retryAfterSeconds =
          details && typeof details.retryAfterSeconds === "number"
            ? details.retryAfterSeconds
            : null;

        if (
          (apiError.code === ErrorCode.SLOW_MODE_ACTIVE ||
            String(apiError.code).toUpperCase() === "SLOW_MODE_ACTIVE") &&
          retryAfterSeconds &&
          retryAfterSeconds > 0
        ) {
          setSlowModeCooldown(selectedConversationId, retryAfterSeconds);
        }

        toast.error(apiError.message || t("error:chat.sendFailed"));
        throw error;
      }
    },
    [selectedConversationId, setSlowModeCooldown, storeSendMessage, t],
  );

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

      const conversation = useChatStore
        .getState()
        .conversations.find((item) => item.id === selectedConversationId);
      if (!conversation) return;
      if ((conversation.unreadCount ?? 0) <= 0) {
        return;
      }

      const latestKey = `${selectedConversationId}:${message.id}`;
      if (lastReadSyncKeyRef.current === latestKey) {
        return;
      }

      lastReadSyncKeyRef.current = latestKey;
      void markAsRead(selectedConversationId).catch(() => {
        if (lastReadSyncKeyRef.current === latestKey) {
          lastReadSyncKeyRef.current = null;
        }
      });
    },
    [markAsRead, selectedConversationId],
  );

  useEffect(() => {
    if (!selectedConversationId || isValidatingRoom) return;

    const orderedConversations = rankConversations(
      Array.isArray(conversations) ? conversations : [],
      {
        currentUserId: currentUserSummary?.id,
        currentUsername: currentUserSummary?.username,
        currentDisplayName: currentUserSummary?.displayName,
        activeConversationId: selectedConversationId,
      },
    );
    const currentIndex = orderedConversations.findIndex(
      (conversation) => conversation.id === selectedConversationId,
    );
    if (currentIndex < 0) return;

    const candidateRoomIds = [
      orderedConversations[currentIndex - 1]?.id,
      orderedConversations[currentIndex + 1]?.id,
    ].filter((id): id is string => typeof id === "string" && id.length > 0);
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
    conversations,
    currentUserSummary?.displayName,
    currentUserSummary?.id,
    currentUserSummary?.username,
    isValidatingRoom,
    selectedConversationId,
  ]);

  useEffect(() => {
    if (!isMessageDebugEnabled()) return;
    if (!selectedConversationId) return;
    if (!isSelectedConversationHydrated) return;
    if (conversationMessages.length > 0) return;

    // eslint-disable-next-line no-debugger
    debugger;
  }, [
    selectedConversationId,
    isSelectedConversationHydrated,
    conversationMessages.length,
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
          ? await messageApi.removeReaction(messageId, emoji)
          : await messageApi.addReaction(messageId, emoji);
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
    [selectedConversationId, currentUserSummary, updateStoreMessage],
  );

  const handleEditMessage = useCallback(
    async (messageId: string, content: string) => {
      if (!selectedConversationId) return;

      try {
        const response = await messageApi.editMessage(messageId, content);
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
        await messageApi.deleteMessage(messageId);
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
      await conversationApi.deleteConversation(selectedConversation.id);
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
    selectConversation(null);
    setIsMobileMenuOpen(true);
    navigate("/chat");
  }, [selectConversation, navigate]);

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
        const response =
          await conversationApi.createPrivateConversation(userId);
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
    [fetchConversations, isCreatingRoom, navigate, selectConversation],
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
        const response = await conversationApi.createGroupConversation({
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
    [fetchConversations, isCreatingRoom, navigate, selectConversation],
  );

  // Handle new chat modal
  const handleOpenNewChat = useCallback(() => {
    setIsNewChatModalOpen(true);
  }, []);

  const showSidebarOnMobile = !selectedConversationId || isMobileMenuOpen;
  const showConversationSkeleton =
    (!hasFetchedConversationsOnce && conversations.length === 0) ||
    (isLoadingConversations && conversations.length === 0);

  useEffect(() => {
    if (!selectedConversationId || !isSelectedDirectConversation || otherUser) {
      return;
    }

    if (directInfoHydratedRef.current.has(selectedConversationId)) {
      return;
    }
    directInfoHydratedRef.current.add(selectedConversationId);

    let isCancelled = false;
    void conversationApi
      .getConversationById(selectedConversationId)
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

  if (!currentUserSummary) {
    return null;
  }

  return (
    <div className="relative flex h-[100dvh] max-h-[100dvh] overflow-hidden bg-[hsl(var(--color-chat-canvas))]">
      {/* Sidebar */}
      <div
        className={clsx(
          "absolute inset-y-0 left-0 z-30 w-full max-w-full transition-transform duration-300 sm:max-w-[min(24rem,92vw)] lg:relative lg:z-0 lg:w-auto lg:max-w-none lg:flex-shrink-0",
          showSidebarOnMobile
            ? "translate-x-0"
            : "-translate-x-full lg:translate-x-0",
        )}
        aria-hidden={!showSidebarOnMobile}
      >
        <Sidebar
          conversations={conversations}
          currentUser={currentUserSummary}
          selectedId={selectedConversationId}
          isLoadingConversations={isLoadingConversations}
          showConversationSkeleton={showConversationSkeleton}
          conversationsError={conversationsError}
          onSelectConversation={handleSelectConversation}
          onRetryConversations={fetchConversations}
          onNewChat={handleOpenNewChat}
          onCurrentUserClick={handleOpenCurrentUserProfile}
        />
      </div>

      {showSidebarOnMobile && selectedConversationId && (
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
            isLoadingMessages={currentIsLoading}
            onLoadOlderMessages={handleLoadOlderMessages}
            onImageClick={setImagePreview}
            onFilePreview={(attachment: Attachment) => {
              const previewType = getPreviewType(attachment.mimeType);
              const target: PreviewTarget = {
                attachment,
                conversationId: selectedConversation.id,
                previewType,
              };
              // Build gallery from all previewable attachments in current messages
              const gallery: PreviewTarget[] = conversationMessages
                .flatMap((msg) =>
                  (msg.attachments ?? []).map((att) => ({
                    attachment: att,
                    conversationId: selectedConversation.id,
                    messageId: msg.id,
                    previewType: getPreviewType(att.mimeType),
                  })),
                )
                .filter((t) => t.previewType !== "unsupported");
              filePreview.open(
                target,
                gallery.length > 0 ? gallery : undefined,
              );
            }}
            messageError={currentMessageError}
            onRetryMessages={handleRetryMessages}
            onReachedLatestMessage={handleReachedLatestMessage}
            connectionState={connectionState}
          />
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
      <NewChatModal
        isOpen={isNewChatModalOpen}
        onClose={() => setIsNewChatModalOpen(false)}
        onStartChat={handleStartChat}
        onCreateGroup={handleCreateGroup}
        isSubmitting={isCreatingRoom}
      />

      {/* Image Preview Modal */}
      {imagePreview && (
        <ImagePreviewModal
          isOpen={!!imagePreview}
          onClose={() => setImagePreview(null)}
          imageUrl={imagePreview}
        />
      )}

      {/* File Preview Modal */}
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
    </div>
  );
};

export default ChatPage;
