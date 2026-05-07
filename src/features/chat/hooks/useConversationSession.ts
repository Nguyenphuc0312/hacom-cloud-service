import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAdjacentConversationIds, useChatStore } from "../../../stores";
import type { HistoryQueryType } from "../../../stores/chatStore";
import { unwrapApiSuccess } from "../../../lib/apiContract";
import type { ConnectionState } from "../../../lib/socket";
import type { Conversation, Message, UserSummary } from "../../../types";
import { getConversationByIdUseCase } from "../usecases/getConversationById";
import { logMessageDebug } from "../../../utils/messageDebug";
import { markChatPerformance } from "../../../utils/chatPerformance";
import { CHAT_RTKQ_MESSAGES_RUNTIME_ENABLED } from "../config/experienceFlags";

const INITIAL_CONVERSATION_WINDOW_LIMIT = 40;
const OLDER_MESSAGES_PAGE_LIMIT = 30;
const ADJACENT_PREFETCH_LIMIT = 20;

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

const getMessageReadSeq = (message: Message): number | null => {
  const record = message as unknown as {
    messageSeq?: unknown;
    serverSeq?: unknown;
    seq?: unknown;
  };
  const candidates = [record.messageSeq, record.serverSeq, record.seq];
  for (const candidate of candidates) {
    if (
      typeof candidate === "number" &&
      Number.isInteger(candidate) &&
      candidate > 0
    ) {
      return candidate;
    }
  }
  return null;
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
      syncReason?: "initial-sync" | "reconnect" | "conversation-refresh";
      source?: string;
      queryType?: HistoryQueryType;
      requestId?: string;
      selectedConversationIdAtDispatch?: string | null;
    },
  ) => Promise<unknown>;
  markAsRead: (
    conversationId: string,
    input?: string | { lastVisibleMessageId?: string; lastReadSeq?: number },
  ) => Promise<void>;
  joinConversation: (
    conversationId: string,
    options?: { skipInitialDeltaSync?: boolean; reason?: string },
  ) => void;
  leaveConversation: (conversationId: string) => void;
  stopTyping: (conversationId: string) => void;
  sendTyping: (conversationId: string) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
}

interface UseConversationSessionResult {
  currentHasMore: boolean;
  currentIsLoading: boolean;
  currentMessageError: string | null;
  isSelectedConversationHydrated: boolean;
  currentHistoryStage:
    | "empty"
    | "partial_unread_bootstrap"
    | "partial_prefetch"
    | "authoritative_initial_window"
    | "paginating_older"
    | "live_realtime";
  isHistoryPartial: boolean;
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
  joinConversation,
  leaveConversation,
  stopTyping,
  sendTyping,
  updateConversation,
}: UseConversationSessionOptions): UseConversationSessionResult => {
  const currentHasMore = useChatStore((state) =>
    CHAT_RTKQ_MESSAGES_RUNTIME_ENABLED
      ? false
      : selectedConversationId
        ? (state.hasMoreMessages[selectedConversationId] ?? true)
        : false,
  );
  const currentIsLoading = useChatStore((state) =>
    CHAT_RTKQ_MESSAGES_RUNTIME_ENABLED
      ? false
      : selectedConversationId
        ? Boolean(state.isLoadingMessagesByConversation[selectedConversationId])
        : false,
  );
  const currentMessageError = useChatStore((state) =>
    CHAT_RTKQ_MESSAGES_RUNTIME_ENABLED
      ? null
      : selectedConversationId
        ? (state.messageErrors[selectedConversationId] ?? null)
        : null,
  );
  const isSelectedConversationHydrated = useChatStore((state) =>
    CHAT_RTKQ_MESSAGES_RUNTIME_ENABLED
      ? Boolean(selectedConversationId)
      : selectedConversationId
        ? Boolean(state.messagesHydratedByConversation[selectedConversationId])
        : false,
  );
  const currentHistoryStage = useChatStore((state) =>
    CHAT_RTKQ_MESSAGES_RUNTIME_ENABLED
      ? "live_realtime"
      : selectedConversationId
        ? (state.historyStageByConversation[selectedConversationId] ?? "empty")
        : "empty",
  );
  const hasAuthoritativeHistory = useChatStore((state) =>
    CHAT_RTKQ_MESSAGES_RUNTIME_ENABLED
      ? Boolean(selectedConversationId)
      : selectedConversationId
        ? Boolean(
            state.hasAuthoritativeHistoryByConversation[selectedConversationId],
          )
        : false,
  );
  const [previousConversationId, nextConversationId] =
    useAdjacentConversationIds(selectedConversationId);
  const lastVisibleReadAnchorKeyRef = useRef<string | null>(null);
  const directInfoHydratedRef = useRef<Set<string>>(new Set());
  const hasConversationCachedForRoute = useChatStore((state) =>
    routeConversationId
      ? Boolean(state.conversationById[routeConversationId])
      : false,
  );

  const canBootstrapConversationFromCache = useMemo(
    () =>
      Boolean(
        hasConversationCachedForRoute &&
        routeConversationId === selectedConversationId,
      ),
    [
      hasConversationCachedForRoute,
      routeConversationId,
      selectedConversationId,
    ],
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
  const isHistoryPartial =
    currentHistoryStage === "partial_unread_bootstrap" ||
    currentHistoryStage === "partial_prefetch";
  const isConversationHistoryReady = hasAuthoritativeHistory;
  const isConversationReady = Boolean(
    selectedConversationId && selectedConversation && isCurrentRouteValidated,
  );
  const websocketReady = connectionState === "connected";
  const selectedUnreadCount = selectedConversation?.unreadCount ?? 0;
  const selectedFirstUnreadMessageId =
    selectedConversation?.firstUnreadMessageId ?? null;

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
        chatState.hasAuthoritativeHistoryByConversation[
          selectedConversationId
        ] === true;
      const hasNewerMessages =
        chatState.hasNewerMessagesByConversation[selectedConversationId] ??
        false;

      logMessageDebug("ChatPage", "conversation_open_started", {
        conversationId: selectedConversationId,
        isHydrated: isConversationHydrated,
        isValidatingRoom,
        hasNewer: hasNewerMessages,
      });
      markChatPerformance("conversation-open-start", selectedConversationId, {
        isHydrated: isConversationHydrated,
        hasNewer: hasNewerMessages,
      });
      logMessageDebug("ChatPage", "conversation_join_requested", {
        conversationId: selectedConversationId,
        skipInitialDeltaSync: false,
        reason: "conversation_open",
      });
      joinConversation(selectedConversationId, {
        skipInitialDeltaSync: false,
      });

      if (CHAT_RTKQ_MESSAGES_RUNTIME_ENABLED) {
        logMessageDebug(
          "ChatPage",
          "legacy_message_fetch_skipped_rtkq_runtime",
          {
            conversationId: selectedConversationId,
          },
        );
        return;
      }

      const latestState = useChatStore.getState();
      const latestStage =
        latestState.historyStageByConversation[selectedConversationId] ??
        "empty";
      const latestHasAuthoritativeHistory =
        latestState.hasAuthoritativeHistoryByConversation[
          selectedConversationId
        ] === true;

      if (
        !latestHasAuthoritativeHistory &&
        latestStage !== "partial_unread_bootstrap" &&
        (selectedUnreadCount > 0 || Boolean(selectedFirstUnreadMessageId))
      ) {
        await fetchMessages(selectedConversationId, undefined, undefined, {
          limit: INITIAL_CONVERSATION_WINDOW_LIMIT,
          source: "unread_feed",
          queryType: "unread_feed",
          selectedConversationIdAtDispatch: selectedConversationId,
        });
      }

      const stateAfterUnreadBootstrap = useChatStore.getState();
      const stageAfterUnreadBootstrap =
        stateAfterUnreadBootstrap.historyStageByConversation[
          selectedConversationId
        ] ?? "empty";
      const hasAuthoritativeHistoryAfterUnreadBootstrap =
        stateAfterUnreadBootstrap.hasAuthoritativeHistoryByConversation[
          selectedConversationId
        ] === true;
      if (
        !hasAuthoritativeHistoryAfterUnreadBootstrap ||
        stageAfterUnreadBootstrap === "partial_unread_bootstrap" ||
        stageAfterUnreadBootstrap === "partial_prefetch"
      ) {
        const initialFetchResult = await fetchMessages(
          selectedConversationId,
          undefined,
          undefined,
          {
            limit: INITIAL_CONVERSATION_WINDOW_LIMIT,
            source: "initial_fetch",
            queryType: "authoritative_open",
            selectedConversationIdAtDispatch: selectedConversationId,
          },
        );
        logMessageDebug(
          "ChatPage",
          "initial_fetch_completed",
          {
            conversationId: selectedConversationId,
            result: initialFetchResult,
          },
          {
            alwaysOn: true,
            level: "info",
          },
        );
      }
    })();

    return () => {
      stopTyping(selectedConversationId);
      leaveConversation(selectedConversationId);
    };
  }, [
    canBootstrapConversationFromCache,
    fetchMessages,
    isValidatingRoom,
    joinConversation,
    leaveConversation,
    selectedConversationId,
    selectedFirstUnreadMessageId,
    selectedUnreadCount,
    stopTyping,
    updateConversation,
  ]);

  useEffect(() => {
    lastVisibleReadAnchorKeyRef.current = null;
  }, [selectedConversationId]);

  const handleLoadOlderMessages = useCallback(async () => {
    if (CHAT_RTKQ_MESSAGES_RUNTIME_ENABLED) {
      return;
    }
    if (!selectedConversationId) return;

    const storeState = useChatStore.getState();
    if (storeState.isLoadingMessagesByConversation[selectedConversationId]) {
      return;
    }
    if (!storeState.hasMoreMessages[selectedConversationId]) return;
    const loadedWindow =
      storeState.messageWindowByConversation[selectedConversationId];
    if (!loadedWindow?.oldestLoadedMessageId || !loadedWindow.oldestLoadedAt) {
      return;
    }

    markChatPerformance("load-older-start", selectedConversationId, {
      oldestLoadedMessageId: loadedWindow.oldestLoadedMessageId,
      oldestLoadedAt: loadedWindow.oldestLoadedAt,
    });
    await fetchMessages(
      selectedConversationId,
      new Date(loadedWindow.oldestLoadedAt).toISOString(),
      undefined,
      {
        limit: OLDER_MESSAGES_PAGE_LIMIT,
        beforeId: loadedWindow.oldestLoadedMessageId,
        source: "scroll_pagination",
      },
    );
  }, [fetchMessages, selectedConversationId]);

  const handleRetryMessages = useCallback(async () => {
    if (CHAT_RTKQ_MESSAGES_RUNTIME_ENABLED) {
      return;
    }
    if (!selectedConversationId) return;
    const storeState = useChatStore.getState();
    if (storeState.isLoadingMessagesByConversation[selectedConversationId]) {
      return;
    }
    await fetchMessages(selectedConversationId, undefined, undefined, {
      force: true,
      limit: INITIAL_CONVERSATION_WINDOW_LIMIT,
      source: "retry_initial_fetch",
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
      const lastReadSeq = getMessageReadSeq(message);
      const alreadyReadUpToLatest =
        (lastReadSeq !== null &&
          (conversation.lastReadSeq ?? 0) >= lastReadSeq) ||
        (conversation.lastReadMessageId === message.id &&
          (conversation.unreadCount ?? 0) <= 0);
      if (alreadyReadUpToLatest) {
        return;
      }

      const latestKey = `${selectedConversationId}:${message.id}:${
        lastReadSeq ?? "no-seq"
      }`;
      if (lastVisibleReadAnchorKeyRef.current === latestKey) {
        return;
      }

      lastVisibleReadAnchorKeyRef.current = latestKey;
      const markReadInput =
        lastReadSeq !== null
          ? { lastVisibleMessageId: message.id, lastReadSeq }
          : message.id;
      void markAsRead(selectedConversationId, markReadInput).catch(() => {
        if (lastVisibleReadAnchorKeyRef.current === latestKey) {
          lastVisibleReadAnchorKeyRef.current = null;
        }
      });
    },
    [markAsRead, selectedConversationId],
  );

  useEffect(() => {
    if (CHAT_RTKQ_MESSAGES_RUNTIME_ENABLED) {
      return;
    }
    if (
      !selectedConversationId ||
      (isValidatingRoom && !canBootstrapConversationFromCache)
    ) {
      return;
    }

    const candidateRoomIds = [
      previousConversationId,
      nextConversationId,
    ].filter((id): id is string => typeof id === "string" && id.length > 0);
    if (candidateRoomIds.length === 0) return;

    let isCancelled = false;
    const cancelScheduledTask = scheduleIdleTask(() => {
      void (async () => {
        for (const candidateRoomId of candidateRoomIds) {
          if (isCancelled) return;
          const state = useChatStore.getState();
          if (state.hasAuthoritativeHistoryByConversation[candidateRoomId]) {
            continue;
          }
          if (state.isLoadingMessagesByConversation[candidateRoomId]) continue;
          await state.fetchMessages(candidateRoomId, undefined, undefined, {
            limit: ADJACENT_PREFETCH_LIMIT,
            source: "prefetch_adjacent",
            queryType: "prefetch",
            selectedConversationIdAtDispatch:
              state.selectedConversationId ?? null,
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
    currentHistoryStage,
    isHistoryPartial,
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
