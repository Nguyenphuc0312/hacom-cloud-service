import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAdjacentConversationIds, useChatStore } from "../../../stores";
import type { HistoryQueryType } from "../../../stores/chatStore";
import { unwrapApiSuccess } from "../../../lib/apiContract";
import type { ConnectionState } from "../../../lib/socket";
import type { Conversation, Message, UserSummary } from "../../../types";
import { getConversationByIdUseCase } from "../usecases/getConversationById";
import { logMessageDebug } from "../../../utils/messageDebug";
import { markChatPerformance } from "../../../utils/chatPerformance";
import { logger } from "../../../utils/logger";
import { isChatRtkqMessagesRuntimeEnabled } from "../config/experienceFlags";
import { useGetMessagesQuery } from "../../api/chatApi";
import { getMessageSeq } from "../domain/messageMerge";
import { store } from "../../../store";
import { chatApi } from "../../api/chatApi";

const INITIAL_CONVERSATION_WINDOW_LIMIT = 40;
const RTKQ_CONVERSATION_WINDOW_LIMIT = 50;
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

const coercePositiveIntSeq = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  // BIGINT từ PG được Sequelize serialize thành string ("233"). Phải coerce
  // ở mọi điểm đọc seq để mark-read và stale-read guard hoạt động đúng.
  if (typeof value === "string" && value.length > 0 && /^[1-9]\d*$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
};

const getMessageReadSeq = (message: Message): number | null => {
  const record = message as unknown as {
    messageSeq?: unknown;
    serverSeq?: unknown;
    seq?: unknown;
  };
  const candidates = [record.messageSeq, record.serverSeq, record.seq];
  for (const candidate of candidates) {
    const seq = coercePositiveIntSeq(candidate);
    if (seq !== null) return seq;
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
    isChatRtkqMessagesRuntimeEnabled()
      ? false
      : selectedConversationId
        ? (state.hasMoreMessages[selectedConversationId] ?? true)
        : false,
  );
  const currentIsLoading = useChatStore((state) =>
    isChatRtkqMessagesRuntimeEnabled()
      ? false
      : selectedConversationId
        ? Boolean(state.isLoadingMessagesByConversation[selectedConversationId])
        : false,
  );
  const currentMessageError = useChatStore((state) =>
    isChatRtkqMessagesRuntimeEnabled()
      ? null
      : selectedConversationId
        ? (state.messageErrors[selectedConversationId] ?? null)
        : null,
  );
  const isSelectedConversationHydrated = useChatStore((state) =>
    isChatRtkqMessagesRuntimeEnabled()
      ? Boolean(selectedConversationId)
      : selectedConversationId
        ? Boolean(state.messagesHydratedByConversation[selectedConversationId])
        : false,
  );
  const currentHistoryStage = useChatStore((state) =>
    isChatRtkqMessagesRuntimeEnabled()
      ? "live_realtime"
      : selectedConversationId
        ? (state.historyStageByConversation[selectedConversationId] ?? "empty")
        : "empty",
  );
  const hasAuthoritativeHistory = useChatStore((state) =>
    isChatRtkqMessagesRuntimeEnabled()
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

  // Subscribe to RTKQ messages so that when they load (or new messages arrive
  // via WS patch), we can fire mark-read. The cache key is serialized as
  // `getMessages:<conversationId>` so this shares the same cache entry with
  // useConversationMessagesRTK — no duplicate HTTP request.
  const { data: rtkqMessagesData } = useGetMessagesQuery(
    {
      conversationId: selectedConversationId ?? "",
      limit: RTKQ_CONVERSATION_WINDOW_LIMIT,
    },
    { skip: !isChatRtkqMessagesRuntimeEnabled() || !selectedConversationId },
  );

  // Derive a stable string signature that changes whenever the newest
  // non-pending message seq changes in the RTKQ cache.
  const rtkqLatestSeqSig = useMemo(() => {
    if (!isChatRtkqMessagesRuntimeEnabled() || !rtkqMessagesData?.messages) return "";
    const msgs = rtkqMessagesData.messages;
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      const candidate = msgs[i];
      if (!candidate || typeof candidate.id !== "string") continue;
      if (candidate.id.startsWith("temp-")) continue;
      const seq = getMessageSeq(candidate);
      if (seq !== null && seq > 0) {
        return `${seq}:${candidate.id}`;
      }
    }
    return "";
  }, [rtkqMessagesData]);
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

      if (isChatRtkqMessagesRuntimeEnabled()) {
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

      // Read unread state at execution time so this effect doesn't re-run on every incoming message
      const currentConversation = latestState.conversationById[selectedConversationId];
      const currentUnreadCount = currentConversation?.unreadCount ?? 0;
      const currentFirstUnreadMessageId = currentConversation?.firstUnreadMessageId ?? null;
      if (
        !latestHasAuthoritativeHistory &&
        latestStage !== "partial_unread_bootstrap" &&
        (currentUnreadCount > 0 || Boolean(currentFirstUnreadMessageId))
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
    stopTyping,
    updateConversation,
  ]);

  useEffect(() => {
    lastVisibleReadAnchorKeyRef.current = null;
  }, [selectedConversationId]);

  // Reset dedup ref khi reconnect để re-fire mark-read ngay sau khi WS khôi phục.
  // Nếu user offline trong lúc có tin mới, ref cũ có thể kẹt với key đã fire
  // nhưng API chưa thành công — cần fire lại khi connection được lập lại.
  useEffect(() => {
    if (connectionState === "connected") {
      lastVisibleReadAnchorKeyRef.current = null;
    }
  }, [connectionState]);

  const handleLoadOlderMessages = useCallback(async () => {
    if (isChatRtkqMessagesRuntimeEnabled()) {
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
    if (isChatRtkqMessagesRuntimeEnabled()) {
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

  // Resolve seq cao nhất hiện FE biết được:
  //   max( loaded message seq, conversation.lastMessage.messageSeq )
  // Khi RTKQ enabled, messages nằm trong Redux store (không phải Zustand state.messages).
  // Phải đọc RTKQ cache imperatively để tìm latest seq.
  const resolveLatestKnownAnchor = useCallback((): {
    seq: number;
    messageId: string | null;
  } | null => {
    if (!selectedConversationId) return null;
    const state = useChatStore.getState();
    const conversation = state.conversationById[selectedConversationId];
    let loadedSeq = 0;
    let loadedMessageId: string | null = null;

    if (isChatRtkqMessagesRuntimeEnabled()) {
      // RTKQ path: messages are in Redux store, not Zustand state.messages
      const rtkqState = chatApi.endpoints.getMessages.select(
        { conversationId: selectedConversationId },
      )(store.getState());
      const msgs = rtkqState.data?.messages ?? [];
      for (let i = msgs.length - 1; i >= 0; i -= 1) {
        const candidate = msgs[i];
        if (!candidate || typeof candidate.id !== "string") continue;
        if (candidate.id.startsWith("temp-")) continue;
        const seq = getMessageSeq(candidate);
        if (seq !== null && seq > 0) {
          loadedSeq = seq;
          loadedMessageId = candidate.id;
          break;
        }
      }
    } else {
      // Legacy Zustand path
      const list = state.messages?.[selectedConversationId];
      if (Array.isArray(list)) {
        for (let i = list.length - 1; i >= 0; i -= 1) {
          const candidate = list[i];
          if (!candidate || typeof candidate.id !== "string") continue;
          if (candidate.id.startsWith("temp-")) continue;
          const candidateSeq = getMessageReadSeq(candidate);
          if (candidateSeq !== null) {
            loadedSeq = candidateSeq;
            loadedMessageId = candidate.id;
          }
          break;
        }
      }
    }

    const summaryRaw = (
      conversation?.lastMessage as { messageSeq?: unknown; id?: unknown } | undefined
    ) ?? undefined;
    const summarySeq = coercePositiveIntSeq(summaryRaw?.messageSeq);
    const summaryId =
      typeof summaryRaw?.id === "string" ? (summaryRaw.id as string) : null;

    let seq = 0;
    let messageId: string | null = null;
    if (loadedSeq > 0) {
      seq = loadedSeq;
      messageId = loadedMessageId;
    }
    if (summarySeq !== null && summarySeq > seq) {
      seq = summarySeq;
      // Khi summary seq vượt loaded seq, không có message id verifiable trong
      // messages list. Vẫn ưu tiên BE resolve theo lastReadSeq.
      messageId = summaryId;
    }
    if (seq <= 0) return null;
    return { seq, messageId };
  }, [selectedConversationId]);

  const fireMarkReadToLatest = useCallback(() => {
    if (!selectedConversationId) return;
    const anchor = resolveLatestKnownAnchor();
    const conversation =
      useChatStore.getState().conversationById[selectedConversationId];
    const currentLastReadSeq = coercePositiveIntSeq(conversation?.lastReadSeq) ?? 0;
    const currentUnread = conversation?.unreadCount ?? 0;

    logMessageDebug("chat-session", "markRead.evaluating", {
      conversationId: selectedConversationId,
      newestSeq: anchor?.seq ?? null,
      currentLastReadSeq,
      unreadCount: currentUnread,
    });

    if (!anchor) return;
    if (!conversation) return;

    if (currentLastReadSeq >= anchor.seq && currentUnread <= 0) {
      return;
    }

    const latestKey = `${selectedConversationId}:${anchor.messageId ?? "by-seq"}:${anchor.seq}`;
    if (lastVisibleReadAnchorKeyRef.current === latestKey) {
      return;
    }
    lastVisibleReadAnchorKeyRef.current = latestKey;

    const markReadInput: { lastReadSeq: number; lastVisibleMessageId?: string } = {
      lastReadSeq: anchor.seq,
    };
    if (anchor.messageId) {
      markReadInput.lastVisibleMessageId = anchor.messageId;
    }

    logMessageDebug("chat-session", "markRead.request", {
      conversationId: selectedConversationId,
      lastReadSeq: anchor.seq,
      anchorMessageId: anchor.messageId,
    });
    logger.debug("chat-session", "markRead.firing", {
      conversationId: selectedConversationId,
      lastReadSeq: anchor.seq,
      anchorMessageId: anchor.messageId,
      currentLastReadSeq,
      currentUnread,
    });
    void markAsRead(selectedConversationId, markReadInput)
      .then(() => {
        logMessageDebug("chat-session", "markRead.success", {
          conversationId: selectedConversationId,
          lastReadSeq: anchor.seq,
        });
        // Reset ref sau khi API thành công để nếu server snapshot sau đó ghi
        // đè unreadCount về > 0 với cùng seq (projection chưa kịp catch up),
        // lần gọi fireMarkReadToLatest tiếp theo sẽ không bị dedup block.
        if (lastVisibleReadAnchorKeyRef.current === latestKey) {
          lastVisibleReadAnchorKeyRef.current = null;
        }
      })
      .catch((error: unknown) => {
        logger.warn("chat-session", "markRead.failed", {
          conversationId: selectedConversationId,
          lastReadSeq: anchor.seq,
          error: error instanceof Error ? error.message : String(error),
        });
        if (lastVisibleReadAnchorKeyRef.current === latestKey) {
          lastVisibleReadAnchorKeyRef.current = null;
        }
      });
  }, [markAsRead, resolveLatestKnownAnchor, selectedConversationId]);

  const handleReachedLatestMessage = useCallback(
    () => {
      // Giữ chữ ký cũ để các callsite khác không break. Logic giờ luôn resolve
      // anchor theo max(loaded, conversation.lastMessage) thay vì chỉ message
      // truyền vào.
      fireMarkReadToLatest();
    },
    [fireMarkReadToLatest],
  );

  useEffect(() => {
    if (isChatRtkqMessagesRuntimeEnabled()) {
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

  // Auto mark-as-read khi:
  //   1) selectedConversationId change (user mở conversation) VÀ messages đã sẵn sàng
  //   2) tin nhắn mới arrive trong active conversation đã visible
  //   3) tab được focus lại trong khi conversation đang mở
  // handleReachedLatestMessage đã dedupe nội bộ qua lastVisibleReadAnchorKeyRef
  // và short-circuit nếu lastReadSeq đã >= seq mới — gọi nhiều lần an toàn.
  useEffect(() => {
    if (!selectedConversationId) return;
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      return;
    }

    // Chỉ mark-read khi messages thực sự sẵn sàng hiển thị cho user.
    // Không fire sớm chỉ dựa vào lastMessage.messageSeq từ summary trước khi
    // messages load — đây là root cause của badge "0.5s rồi biến mất".
    // Effect sẽ re-run khi isConversationHistoryReady/canBootstrapFromCache thay
    // đổi, lúc đó sẽ gọi fireMarkReadToLatest() và add lại listeners.
    if (isConversationHistoryReady || canBootstrapConversationFromCache) {
      fireMarkReadToLatest();
    }

    if (typeof document === "undefined") return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fireMarkReadToLatest();
      }
    };
    const onFocus = () => fireMarkReadToLatest();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [selectedConversationId, fireMarkReadToLatest, isConversationHistoryReady, canBootstrapConversationFromCache]);

  // Trigger lại mark-read mỗi khi seq cao nhất FE biết được thay đổi — bất
  // kể seq đó tới từ message list (load thêm, realtime) hay từ conversation
  // summary (lastMessage.messageSeq tăng do WebSocket bump conversation list).
  const latestKnownSeqSignature = useChatStore((state) => {
    if (!selectedConversationId) return "";
    const list = state.messages?.[selectedConversationId];
    let loadedSeq = 0;
    let loadedId = "";
    if (Array.isArray(list)) {
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const candidate = list[i];
        if (!candidate || typeof candidate.id !== "string") continue;
        if (candidate.id.startsWith("temp-")) continue;
        const seq = getMessageReadSeq(candidate);
        if (seq !== null) {
          loadedSeq = seq;
          loadedId = candidate.id;
        }
        break;
      }
    }
    const summaryRaw = (
      state.conversationById[selectedConversationId]?.lastMessage as
        | { messageSeq?: unknown; id?: unknown }
        | undefined
    ) ?? undefined;
    const summarySeq = coercePositiveIntSeq(summaryRaw?.messageSeq) ?? 0;
    const seq = Math.max(loadedSeq, summarySeq);
    const id =
      summarySeq > loadedSeq && typeof summaryRaw?.id === "string"
        ? (summaryRaw.id as string)
        : loadedId;
    return `${seq}:${id}`;
  });

  useEffect(() => {
    if (!selectedConversationId) return;
    if (!latestKnownSeqSignature || latestKnownSeqSignature === "0:") return;
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      return;
    }
    // latestKnownSeqSignature có thể dùng summarySeq từ conversation list ngay
    // khi conversation được chọn, trước khi messages thực sự load. Không mark-read
    // dựa trên summary seq — phải chờ messages hiển thị thật sự.
    if (!isConversationHistoryReady && !canBootstrapConversationFromCache) {
      return;
    }
    // Debounce 400ms để gom nhiều message arrival liên tiếp thành 1 mark-read.
    const handle = setTimeout(() => {
      fireMarkReadToLatest();
    }, 400);
    return () => clearTimeout(handle);
  }, [selectedConversationId, latestKnownSeqSignature, fireMarkReadToLatest, isConversationHistoryReady, canBootstrapConversationFromCache]);

  // RTKQ reactive trigger: khi RTKQ enabled, latestKnownSeqSignature luôn là
  // "0:" vì Zustand state.messages không được populate. Effect này subscribe
  // trực tiếp vào RTKQ cache và gọi mark-read khi messages load lần đầu hoặc
  // khi message mới đến (WS patch vào RTKQ cache).
  useEffect(() => {
    if (!selectedConversationId || !isChatRtkqMessagesRuntimeEnabled()) return;
    if (!rtkqLatestSeqSig || rtkqLatestSeqSig === "") return;
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      return;
    }
    // Debounce 400ms để gom nhiều message arrival liên tiếp thành 1 mark-read.
    const handle = setTimeout(() => {
      fireMarkReadToLatest();
    }, 400);
    return () => clearTimeout(handle);
  }, [selectedConversationId, rtkqLatestSeqSig, fireMarkReadToLatest]);

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
