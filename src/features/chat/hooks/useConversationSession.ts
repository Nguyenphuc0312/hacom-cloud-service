import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAdjacentConversationIds, useChatStore } from "../../../stores";
import {
  selectConversationMessagesFromState,
} from "../../../stores/chatStore";
import { unwrapApiSuccess } from "../../../lib/apiContract";
import type { ConnectionState } from "../../../lib/socket";
import type {
  Conversation,
  Message,
  UserSummary,
} from "../../../types";
import { getConversationByIdUseCase } from "../usecases/getConversationById";
import { logMessageDebug } from "../../../utils/messageDebug";

type IdleCallbackDeadline = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

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

interface UseConversationSessionOptions {
  routeConversationId: string | null;
  selectedConversationId: string | null;
  selectedConversation: Conversation | null;
  isSelectedDirectConversation: boolean;
  otherUser: UserSummary | null;
  connectionState: ConnectionState;
  isValidatingRoom: boolean;
  lastValidatedConversationId: string | null;
  messageCount: number;
  fetchMessages: (
    conversationId: string,
    before?: string,
    after?: string,
    options?: {
      force?: boolean;
      limit?: number;
      beforeId?: string;
      afterId?: string;
      syncReason?: "initial-sync" | "reconnect" | "room-refresh";
    },
  ) => Promise<unknown>;
  markAsRead: (
    conversationId: string,
    lastVisibleMessageId?: string,
  ) => Promise<void>;
  joinRoom: (
    roomId: string,
    options?: { skipInitialDeltaSync?: boolean; reason?: string },
  ) => void;
  leaveRoom: (roomId: string) => void;
  stopTyping: (conversationId: string) => void;
  sendTyping: (conversationId: string) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
}

interface UseConversationSessionResult {
  currentHasMore: boolean;
  currentIsLoading: boolean;
  currentMessageError: string | null;
  isSelectedConversationHydrated: boolean;
  canBootstrapConversationFromCache: boolean;
  isCurrentRouteValidated: boolean;
  isConversationHistoryReady: boolean;
  isConversationReady: boolean;
  websocketReady: boolean;
  handleLoadOlderMessages: () => Promise<void>;
  handleRetryMessages: () => Promise<void>;
  handleReachedLatestMessage: (message: Message) => void;
  handleTyping: (isTyping: boolean) => void;
}

export const useConversationSession = ({
  routeConversationId,
  selectedConversationId,
  selectedConversation,
  isSelectedDirectConversation,
  otherUser,
  connectionState,
  isValidatingRoom,
  lastValidatedConversationId,
  messageCount,
  fetchMessages,
  markAsRead,
  joinRoom,
  leaveRoom,
  stopTyping,
  sendTyping,
  updateConversation,
}: UseConversationSessionOptions): UseConversationSessionResult => {
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
  const isSelectedConversationHydrated = useChatStore((state) =>
    selectedConversationId
      ? Boolean(state.messagesHydratedByConversation[selectedConversationId])
      : false,
  );
  const [previousConversationId, nextConversationId] =
    useAdjacentConversationIds(selectedConversationId);
  const lastVisibleReadAnchorKeyRef = useRef<string | null>(null);
  const directInfoHydratedRef = useRef<Set<string>>(new Set());
  const hasConversationCachedForRoute = useChatStore((state) =>
    routeConversationId ? Boolean(state.conversationById[routeConversationId]) : false,
  );

  const canBootstrapConversationFromCache = useMemo(
    () =>
      Boolean(
        hasConversationCachedForRoute &&
          routeConversationId === selectedConversationId,
      ),
    [hasConversationCachedForRoute, routeConversationId, selectedConversationId],
  );

  const isCurrentRouteValidated = useMemo(
    () =>
      routeConversationId
        ? lastValidatedConversationId === routeConversationId ||
          hasConversationCachedForRoute
        : true,
    [
      hasConversationCachedForRoute,
      lastValidatedConversationId,
      routeConversationId,
    ],
  );
  const isConversationHistoryReady = isSelectedConversationHydrated;
  const isConversationReady = Boolean(
    selectedConversationId &&
      selectedConversation &&
      isCurrentRouteValidated,
  );
  const websocketReady = connectionState === "connected";

  useEffect(() => {
    if (
      !selectedConversationId ||
      (isValidatingRoom && !canBootstrapConversationFromCache)
    ) {
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
    fetchMessages,
    isValidatingRoom,
    joinRoom,
    leaveRoom,
    selectedConversationId,
    stopTyping,
  ]);

  useEffect(() => {
    lastVisibleReadAnchorKeyRef.current = null;
  }, [selectedConversationId]);

  const handleLoadOlderMessages = useCallback(async () => {
    if (!selectedConversationId) return;

    const storeState = useChatStore.getState();
    if (storeState.isLoadingMessagesByConversation[selectedConversationId]) {
      return;
    }
    if (!storeState.hasMoreMessages[selectedConversationId]) return;

    const storeMessages = selectConversationMessagesFromState(
      storeState,
      selectedConversationId,
    );
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
  }, [fetchMessages, selectedConversationId]);

  const handleRetryMessages = useCallback(async () => {
    if (!selectedConversationId) return;
    const storeState = useChatStore.getState();
    if (storeState.isLoadingMessagesByConversation[selectedConversationId]) {
      return;
    }
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

      const conversation =
        useChatStore.getState().conversationById[selectedConversationId];
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
    if (
      !selectedConversationId ||
      (isValidatingRoom && !canBootstrapConversationFromCache)
    ) {
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

  const handleTyping = useCallback(
    (isTyping: boolean) => {
      if (!selectedConversationId) return;
      if (isTyping) {
        sendTyping(selectedConversationId);
      } else {
        stopTyping(selectedConversationId);
      }
    },
    [selectedConversationId, sendTyping, stopTyping],
  );

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
      messageCount,
      connectionState,
    });
  }, [
    connectionState,
    isConversationHistoryReady,
    isConversationReady,
    isCurrentRouteValidated,
    isValidatingRoom,
    messageCount,
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

  return {
    currentHasMore,
    currentIsLoading,
    currentMessageError,
    isSelectedConversationHydrated,
    canBootstrapConversationFromCache,
    isCurrentRouteValidated,
    isConversationHistoryReady,
    isConversationReady,
    websocketReady,
    handleLoadOlderMessages,
    handleRetryMessages,
    handleReachedLatestMessage,
    handleTyping,
  };
};

export default useConversationSession;
