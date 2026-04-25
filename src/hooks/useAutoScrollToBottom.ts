import React from "react";
import type { Message } from "../types";
import { getMessageStableKey } from "../utils/messageTimeline";
import {
  resolvePinnedToBottom,
  type ScrollMode,
} from "../utils/scrollController";
import { logScrollTrace } from "../utils/scrollTrace";

const LOAD_MORE_TRIGGER_PX = 120;
const MAX_SCROLL_SESSIONS = 60;

interface UseAutoScrollToBottomParams {
  conversationId: string;
  messages: Message[];
  currentUserId: string;
  preferUnreadAnchor?: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  isRefreshingMessages?: boolean;
  onLoadMore?: () => void | Promise<void>;
  onBeforeLoadMore?: () => void;
  onAfterPrepend?: () => void;
  outerRef: React.RefObject<HTMLDivElement | null>;
  requestScrollToBottom: (reason: string) => void;
  captureScrollAnchor?: () => {
    messageId: string | null;
    offsetFromTop: number;
  } | null;
}

export interface UseAutoScrollToBottomResult {
  pendingNewMessages: number;
  isPinnedToBottom: boolean;
  scrollMode: ScrollMode;
  firstDetachedUnreadMessageId: string | null;
  handleScroll: (scrollOffset: number) => void;
  jumpToLatest: () => void;
  detachAutoFollow: (reason?: string) => void;
  syncScrollStateFromDom: (reason?: string) => void;
  clearPendingRestore: (reason?: string) => void;
  pendingRestoreAnchor:
    | {
        messageId: string | null;
        offsetFromTop: number;
      }
    | null;
  pendingRestoreScrollTop: number | null;
  pendingRestoreVersion: number;
}

interface ConversationScrollSession {
  isPinnedToBottom: boolean;
  scrollTop: number;
  anchorMessageId: string | null;
  anchorOffsetFromTop: number;
  latestMessageKey: string | null;
  messageCount: number;
  updatedAt: number;
}

const conversationScrollSessions = new Map<string, ConversationScrollSession>();

export const __resetConversationScrollSessionsForTest = (): void => {
  conversationScrollSessions.clear();
};

const getLatestMessageKey = (messages: Message[]): string | null => {
  const latestMessage = messages[messages.length - 1];
  return latestMessage ? getMessageStableKey(latestMessage) : null;
};

const pruneScrollSessions = (): void => {
  if (conversationScrollSessions.size <= MAX_SCROLL_SESSIONS) return;

  const sessionsByAge = Array.from(conversationScrollSessions.entries()).sort(
    ([, first], [, second]) => first.updatedAt - second.updatedAt,
  );
  const removableCount = Math.max(
    0,
    conversationScrollSessions.size - MAX_SCROLL_SESSIONS,
  );
  sessionsByAge.slice(0, removableCount).forEach(([conversationId]) => {
    conversationScrollSessions.delete(conversationId);
  });
};

const getTailAppendMessages = (
  previousMessages: Message[],
  nextMessages: Message[],
): Message[] | null => {
  if (previousMessages.length === 0) {
    return nextMessages;
  }

  const previousLastKey = getMessageStableKey(
    previousMessages[previousMessages.length - 1],
  );
  const previousLastIndex = nextMessages.findIndex(
    (message) => getMessageStableKey(message) === previousLastKey,
  );

  if (previousLastIndex < 0) {
    return null;
  }

  return nextMessages.slice(previousLastIndex + 1);
};

export const useAutoScrollToBottom = ({
  conversationId,
  messages,
  currentUserId,
  preferUnreadAnchor,
  hasMore,
  isLoadingMore,
  isRefreshingMessages = false,
  onLoadMore,
  onBeforeLoadMore,
  onAfterPrepend,
  outerRef,
  requestScrollToBottom,
  captureScrollAnchor,
}: UseAutoScrollToBottomParams): UseAutoScrollToBottomResult => {
  const [pendingNewMessages, setPendingNewMessages] = React.useState(0);
  const [isPinnedToBottom, setIsPinnedToBottom] = React.useState(true);
  const [scrollMode, setScrollMode] = React.useState<ScrollMode>("at_bottom");
  const [firstDetachedUnreadMessageId, setFirstDetachedUnreadMessageId] =
    React.useState<string | null>(null);
  const [pendingRestoreAnchor, setPendingRestoreAnchor] = React.useState<{
    messageId: string | null;
    offsetFromTop: number;
  } | null>(null);
  const [pendingRestoreScrollTop, setPendingRestoreScrollTop] =
    React.useState<number | null>(null);
  const [pendingRestoreVersion, setPendingRestoreVersion] = React.useState(0);

  const isPinnedRef = React.useRef(true);
  const loadingOlderRef = React.useRef(false);
  const prevConversationIdRef = React.useRef<string | null>(null);
  const prevMessagesRef = React.useRef<Message[]>(messages);
  const prevFirstMessageIdRef = React.useRef<string | undefined>(messages[0]?.id);
  const restorePendingRef = React.useRef(false);
  const restoredSessionLatestMessageKeyRef = React.useRef<string | null>(null);
  const restoreRefreshInFlightRef = React.useRef(false);

  const persistSession = React.useCallback(
    (
      nextPinnedToBottom: boolean = isPinnedRef.current,
      nextScrollTop?: number,
    ) => {
      const outer = outerRef.current;
      const anchor = captureScrollAnchor?.();
      conversationScrollSessions.set(conversationId, {
        isPinnedToBottom: nextPinnedToBottom,
        scrollTop: Math.max(0, nextScrollTop ?? outer?.scrollTop ?? 0),
        anchorMessageId: anchor?.messageId ?? null,
        anchorOffsetFromTop: anchor?.offsetFromTop ?? 0,
        latestMessageKey: getLatestMessageKey(messages),
        messageCount: messages.length,
        updatedAt: Date.now(),
      });
      pruneScrollSessions();
    },
    [captureScrollAnchor, conversationId, messages, outerRef],
  );

  const updatePinnedState = React.useCallback(
    (
      nextPinnedToBottom: boolean,
      reason: string,
      nextScrollTop?: number,
      nextPendingNewMessages?: number,
      nextScrollMode?: ScrollMode,
    ) => {
      isPinnedRef.current = nextPinnedToBottom;
      setIsPinnedToBottom((previous) =>
        previous === nextPinnedToBottom ? previous : nextPinnedToBottom,
      );
      setScrollMode((previous) => {
        const nextMode =
          nextScrollMode ??
          (nextPinnedToBottom ? "at_bottom" : "reading_history");
        return previous === nextMode ? previous : nextMode;
      });

      if (typeof nextPendingNewMessages === "number") {
        setPendingNewMessages(nextPendingNewMessages);
      } else if (nextPinnedToBottom) {
        setPendingNewMessages(0);
      }
      if (nextPinnedToBottom) {
        setFirstDetachedUnreadMessageId(null);
      }

      persistSession(nextPinnedToBottom, nextScrollTop);
      logScrollTrace("follow_state_changed", {
        conversationId,
        reason,
        isPinnedToBottom: nextPinnedToBottom,
        scrollTop: nextScrollTop ?? outerRef.current?.scrollTop ?? 0,
      });
    },
    [conversationId, outerRef, persistSession],
  );

  const clearPendingRestore = React.useCallback(
    (reason: string = "restore-consumed") => {
      const preserveRestoredBaseline =
        reason === "conversation-restore-anchor-applied" ||
        reason === "conversation-restore-applied";
      const hadPendingRestore =
        restorePendingRef.current ||
        pendingRestoreAnchor !== null ||
        pendingRestoreScrollTop !== null ||
        (!preserveRestoredBaseline &&
          restoredSessionLatestMessageKeyRef.current !== null);
      if (!hadPendingRestore) {
        return;
      }

      restorePendingRef.current = false;
      if (!preserveRestoredBaseline) {
        restoredSessionLatestMessageKeyRef.current = null;
        restoreRefreshInFlightRef.current = false;
      }
      setPendingRestoreAnchor(null);
      setPendingRestoreScrollTop(null);
      setPendingRestoreVersion((version) => version + 1);
      logScrollTrace("restore_scroll_consumed", {
        conversationId,
        reason,
      });
    },
    [conversationId, pendingRestoreAnchor, pendingRestoreScrollTop],
  );

  const syncScrollStateFromDom = React.useCallback(
    (reason: string = "sync-from-dom") => {
      const outer = outerRef.current;
      if (!outer) return;

      const nextScrollTop = outer.scrollTop;
      const nextPinnedState = resolvePinnedToBottom(outer, undefined, {
        previouslyPinnedToBottom: isPinnedRef.current,
      });
      setScrollMode((previous) =>
        previous === nextPinnedState.mode ? previous : nextPinnedState.mode,
      );
      updatePinnedState(
        nextPinnedState.isPinnedToBottom,
        reason,
        nextScrollTop,
        undefined,
        nextPinnedState.mode,
      );
    },
    [outerRef, updatePinnedState],
  );

  const detachAutoFollow = React.useCallback(
    (reason: string = "detach") => {
      const outer = outerRef.current;
      const nextMode: ScrollMode =
        reason === "jump-to-message" ? "jump_to_message" : "reading_history";
      clearPendingRestore(reason);
      updatePinnedState(
        false,
        reason,
        outer?.scrollTop ?? 0,
        pendingNewMessages,
        nextMode,
      );
    },
    [clearPendingRestore, outerRef, pendingNewMessages, updatePinnedState],
  );

  const jumpToLatest = React.useCallback(() => {
    clearPendingRestore("jump-to-latest");
    updatePinnedState(true, "jump-to-latest", outerRef.current?.scrollTop ?? 0, 0);
    requestScrollToBottom("jump-to-latest");
  }, [clearPendingRestore, outerRef, requestScrollToBottom, updatePinnedState]);

  React.useEffect(() => {
    const conversationChanged =
      prevConversationIdRef.current !== conversationId;
    if (!conversationChanged) return;

    prevConversationIdRef.current = conversationId;
    prevMessagesRef.current = messages;
    prevFirstMessageIdRef.current = messages[0]?.id;
    loadingOlderRef.current = false;
    restorePendingRef.current = false;
    restoredSessionLatestMessageKeyRef.current = null;
    restoreRefreshInFlightRef.current = false;
    setPendingNewMessages(0);
    setFirstDetachedUnreadMessageId(null);
    setPendingRestoreAnchor(null);
    setPendingRestoreScrollTop(null);

    const previousSession = conversationScrollSessions.get(conversationId);
    const currentLatestMessageKey = getLatestMessageKey(messages);
    const canRestoreReadingSession = Boolean(
      !preferUnreadAnchor &&
        previousSession &&
        !previousSession.isPinnedToBottom &&
        messages.length > 0 &&
        previousSession.latestMessageKey === currentLatestMessageKey,
    );

    if (canRestoreReadingSession && previousSession) {
      restorePendingRef.current = true;
      restoredSessionLatestMessageKeyRef.current =
        previousSession.latestMessageKey;
      restoreRefreshInFlightRef.current = isRefreshingMessages;
      isPinnedRef.current = false;
      setIsPinnedToBottom(false);
      setScrollMode("reading_history");

      if (previousSession.anchorMessageId) {
        setPendingRestoreAnchor({
          messageId: previousSession.anchorMessageId,
          offsetFromTop: previousSession.anchorOffsetFromTop,
        });
        setPendingRestoreScrollTop(null);
      } else {
        setPendingRestoreAnchor(null);
        setPendingRestoreScrollTop(previousSession.scrollTop);
      }
      setPendingRestoreVersion((version) => version + 1);
      logScrollTrace("conversation_restore_session_requested", {
        conversationId,
        anchorMessageId: previousSession.anchorMessageId,
        scrollTop: previousSession.scrollTop,
        messageCount: previousSession.messageCount,
        latestMessageKey: currentLatestMessageKey,
        preferUnreadAnchor,
      });
      return;
    }

    isPinnedRef.current = true;
    restorePendingRef.current = false;
    restoredSessionLatestMessageKeyRef.current = null;
    restoreRefreshInFlightRef.current = false;
    setIsPinnedToBottom(true);
    setScrollMode("at_bottom");
    setPendingRestoreVersion((version) => version + 1);
    logScrollTrace("conversation_open_latest_requested", {
      conversationId,
      restoredSession: false,
      hadPreviousSession: Boolean(previousSession),
      previousLatestMessageKey: previousSession?.latestMessageKey ?? null,
      currentLatestMessageKey,
      preferUnreadAnchor,
    });
    requestScrollToBottom("conversation-change");
  }, [
    conversationId,
    isRefreshingMessages,
    messages,
    preferUnreadAnchor,
    requestScrollToBottom,
  ]);

  React.useEffect(() => {
    if (isRefreshingMessages && restoredSessionLatestMessageKeyRef.current) {
      restoreRefreshInFlightRef.current = true;
    }
  }, [isRefreshingMessages]);

  React.useEffect(() => {
    const previousMessages = prevMessagesRef.current;
    const firstMessageId = messages[0]?.id;
    const prependedMessageCount = messages.length - previousMessages.length;
    const prependedOlderMessages =
      loadingOlderRef.current &&
      prependedMessageCount > 0 &&
      previousMessages.length > 0 &&
      firstMessageId &&
      prevFirstMessageIdRef.current &&
      firstMessageId !== prevFirstMessageIdRef.current &&
      previousMessages.every(
        (message, index) => {
          const nextMessage = messages[index + prependedMessageCount];
          return (
            Boolean(nextMessage) &&
            getMessageStableKey(nextMessage) === getMessageStableKey(message)
          );
        },
      );

    if (prependedOlderMessages) {
      loadingOlderRef.current = false;
      setScrollMode(isPinnedRef.current ? "at_bottom" : "reading_history");
      // Prepending history preserves the current viewport via an anchor restore.
      // It must not be conflated with append-follow behavior.
      onAfterPrepend?.();
      prevMessagesRef.current = messages;
      prevFirstMessageIdRef.current = firstMessageId;
      return;
    }

    const appendedMessages = getTailAppendMessages(previousMessages, messages);
    if (appendedMessages && appendedMessages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      const latestMessageKey = latestMessage
        ? getMessageStableKey(latestMessage)
        : null;
      const restoredSessionLatestMessageKey =
        restoredSessionLatestMessageKeyRef.current;
      const restoreInvalidatedByNewerTail = Boolean(
        (restorePendingRef.current || restoreRefreshInFlightRef.current) &&
          restoredSessionLatestMessageKey &&
          latestMessageKey &&
          latestMessageKey !== restoredSessionLatestMessageKey,
      );
      const shouldForceFollowOwnMessage =
        previousMessages.length > 0 &&
        appendedMessages.some((message) => message.senderId === currentUserId);

      // Append cases are intentionally asymmetric:
      // - pinned bottom: follow the tail
      // - own message while detached: reattach and follow
      // - reading history + remote append: preserve viewport and buffer unread
      if (
        isPinnedRef.current ||
        shouldForceFollowOwnMessage ||
        restoreInvalidatedByNewerTail
      ) {
        setScrollMode(
          shouldForceFollowOwnMessage ? "sending_own_message" : "receiving_new_message",
        );
        if (
          (shouldForceFollowOwnMessage || restoreInvalidatedByNewerTail) &&
          !isPinnedRef.current
        ) {
          updatePinnedState(
            true,
            restoreInvalidatedByNewerTail
              ? "restore-invalidated-newer-messages"
              : "self-message",
            outerRef.current?.scrollTop ?? 0,
            0,
            shouldForceFollowOwnMessage
              ? "sending_own_message"
              : "receiving_new_message",
          );
        }
        if (restoreInvalidatedByNewerTail) {
          clearPendingRestore("restore-invalidated-newer-messages");
        }
        setPendingNewMessages(0);
        requestScrollToBottom(
          restoreInvalidatedByNewerTail
            ? "conversation-change-newer-messages"
            : shouldForceFollowOwnMessage
              ? "self-message"
              : "incoming-message",
        );
        logScrollTrace("realtime_message_appended", {
          conversationId,
          appendedCount: appendedMessages.length,
          followed: true,
          forcedByOwnMessage: shouldForceFollowOwnMessage,
          restoreInvalidatedByNewerTail,
          lastMessageId: latestMessage?.id ?? null,
          lastSeq: latestMessage?.serverSeq ?? null,
        });
        logScrollTrace("incoming_followed", {
          conversationId,
          appendedCount: appendedMessages.length,
          forcedByOwnMessage: shouldForceFollowOwnMessage,
          restoreInvalidatedByNewerTail,
        });
      } else {
        setScrollMode("reading_history");
        const firstBufferedMessage = appendedMessages[0];
        setPendingNewMessages((previous) => previous + appendedMessages.length);
        setFirstDetachedUnreadMessageId((current) =>
          current || getMessageStableKey(firstBufferedMessage),
        );
        logScrollTrace("incoming_buffered_for_reader", {
          conversationId,
          appendedCount: appendedMessages.length,
        });
        logScrollTrace("realtime_message_appended", {
          conversationId,
          appendedCount: appendedMessages.length,
          followed: false,
          lastMessageId: latestMessage?.id ?? null,
          lastSeq: latestMessage?.serverSeq ?? null,
        });
      }
    }

    prevMessagesRef.current = messages;
    prevFirstMessageIdRef.current = firstMessageId;
  }, [
    conversationId,
    currentUserId,
    clearPendingRestore,
    isRefreshingMessages,
    messages,
    onAfterPrepend,
    outerRef,
    requestScrollToBottom,
    updatePinnedState,
  ]);

  React.useEffect(() => {
    if (isRefreshingMessages || !restoreRefreshInFlightRef.current) {
      return;
    }

    restoreRefreshInFlightRef.current = false;
    if (!restorePendingRef.current) {
      restoredSessionLatestMessageKeyRef.current = null;
    }
  }, [isRefreshingMessages, messages]);

  React.useEffect(() => {
    if (messages.length !== 0) return;

    isPinnedRef.current = true;
    restorePendingRef.current = false;
    restoredSessionLatestMessageKeyRef.current = null;
    restoreRefreshInFlightRef.current = false;
    setPendingNewMessages(0);
    setIsPinnedToBottom(true);
    setScrollMode("at_bottom");
    setFirstDetachedUnreadMessageId(null);
  }, [messages.length]);

  const handleScroll = React.useCallback(
    (scrollOffset: number) => {
      const outer = outerRef.current;
      if (!outer) return;

      const nextPinnedState = resolvePinnedToBottom(outer, undefined, {
        previouslyPinnedToBottom: isPinnedRef.current,
      });
      const nearBottom = nextPinnedState.mode !== "reading_history";
      logScrollTrace(nearBottom ? "near_bottom_true" : "near_bottom_false", {
        conversationId,
        scrollTop: scrollOffset,
        scrollHeight: outer.scrollHeight,
        clientHeight: outer.clientHeight,
        distanceToBottom: nextPinnedState.distanceFromBottomPx,
        reason: "user-scroll",
      });
      setScrollMode((previous) =>
        previous === nextPinnedState.mode ? previous : nextPinnedState.mode,
      );
      clearPendingRestore("user-scroll");

      if (nextPinnedState.isPinnedToBottom !== isPinnedRef.current) {
        updatePinnedState(
          nextPinnedState.isPinnedToBottom,
          "user-scroll",
          scrollOffset,
          undefined,
          nextPinnedState.mode,
        );
      } else {
        persistSession(nextPinnedState.isPinnedToBottom, scrollOffset);
      }

      if (
        onLoadMore &&
        hasMore &&
        !isLoadingMore &&
        !loadingOlderRef.current &&
        scrollOffset < LOAD_MORE_TRIGGER_PX
      ) {
        onBeforeLoadMore?.();
        loadingOlderRef.current = true;
        setScrollMode("prepending_history");
        logScrollTrace("load_more_requested", {
          conversationId,
          scrollOffset,
        });

        Promise.resolve(onLoadMore()).catch(() => {
          loadingOlderRef.current = false;
        });
      }
    },
    [
      conversationId,
      hasMore,
      isLoadingMore,
      clearPendingRestore,
      onBeforeLoadMore,
      onLoadMore,
      outerRef,
      persistSession,
      updatePinnedState,
    ],
  );

  React.useEffect(
    () => () => {
      persistSession();
    },
    [persistSession],
  );

  return {
    pendingNewMessages,
    isPinnedToBottom,
    scrollMode,
    firstDetachedUnreadMessageId,
    handleScroll,
    jumpToLatest,
    detachAutoFollow,
    syncScrollStateFromDom,
    clearPendingRestore,
    pendingRestoreAnchor,
    pendingRestoreScrollTop,
    pendingRestoreVersion,
  };
};

export default useAutoScrollToBottom;
