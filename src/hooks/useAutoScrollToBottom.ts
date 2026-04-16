import React from "react";
import type { Message } from "../types";
import { getMessageStableKey } from "../utils/messageTimeline";
import {
  resolvePinnedToBottom,
  type ScrollMode,
} from "../utils/scrollController";
import { logScrollTrace } from "../utils/scrollTrace";

const LOAD_MORE_TRIGGER_PX = 120;

interface UseAutoScrollToBottomParams {
  conversationId: string;
  messages: Message[];
  currentUserId: string;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore?: () => void | Promise<void>;
  onBeforeLoadMore?: () => void;
  onAfterPrepend?: () => void;
  outerRef: React.RefObject<HTMLDivElement | null>;
  requestScrollToBottom: (reason: string) => void;
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
  pendingRestoreScrollTop: number | null;
  pendingRestoreVersion: number;
}

interface ConversationScrollSession {
  isPinnedToBottom: boolean;
  scrollTop: number;
}

const conversationScrollSessions = new Map<string, ConversationScrollSession>();

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
  hasMore,
  isLoadingMore,
  onLoadMore,
  onBeforeLoadMore,
  onAfterPrepend,
  outerRef,
  requestScrollToBottom,
}: UseAutoScrollToBottomParams): UseAutoScrollToBottomResult => {
  const [pendingNewMessages, setPendingNewMessages] = React.useState(0);
  const [isPinnedToBottom, setIsPinnedToBottom] = React.useState(true);
  const [scrollMode, setScrollMode] = React.useState<ScrollMode>("at_bottom");
  const [firstDetachedUnreadMessageId, setFirstDetachedUnreadMessageId] =
    React.useState<string | null>(null);
  const [pendingRestoreScrollTop, setPendingRestoreScrollTop] =
    React.useState<number | null>(null);
  const [pendingRestoreVersion, setPendingRestoreVersion] = React.useState(0);

  const isPinnedRef = React.useRef(true);
  const loadingOlderRef = React.useRef(false);
  const prevConversationIdRef = React.useRef<string | null>(null);
  const prevMessagesRef = React.useRef<Message[]>(messages);
  const prevFirstMessageIdRef = React.useRef<string | undefined>(messages[0]?.id);

  const persistSession = React.useCallback(
    (
      nextPinnedToBottom: boolean = isPinnedRef.current,
      nextScrollTop?: number,
    ) => {
      const outer = outerRef.current;
      conversationScrollSessions.set(conversationId, {
        isPinnedToBottom: nextPinnedToBottom,
        scrollTop: Math.max(0, nextScrollTop ?? outer?.scrollTop ?? 0),
      });
    },
    [conversationId, outerRef],
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
      updatePinnedState(
        false,
        reason,
        outer?.scrollTop ?? 0,
        pendingNewMessages,
        nextMode,
      );
    },
    [outerRef, pendingNewMessages, updatePinnedState],
  );

  const jumpToLatest = React.useCallback(() => {
    updatePinnedState(true, "jump-to-latest", outerRef.current?.scrollTop ?? 0, 0);
    requestScrollToBottom("jump-to-latest");
  }, [outerRef, requestScrollToBottom, updatePinnedState]);

  React.useEffect(() => {
    const conversationChanged =
      prevConversationIdRef.current !== conversationId;
    if (!conversationChanged) return;

    prevConversationIdRef.current = conversationId;
    prevMessagesRef.current = messages;
    prevFirstMessageIdRef.current = messages[0]?.id;
    loadingOlderRef.current = false;
    setPendingNewMessages(0);
    setFirstDetachedUnreadMessageId(null);

    const savedSession = conversationScrollSessions.get(conversationId);
    if (savedSession && !savedSession.isPinnedToBottom) {
      isPinnedRef.current = false;
      setIsPinnedToBottom(false);
      setScrollMode("reading_history");
      setPendingRestoreScrollTop(savedSession.scrollTop);
      setPendingRestoreVersion((value) => value + 1);
      logScrollTrace("conversation_restore_requested", {
        conversationId,
        scrollTop: savedSession.scrollTop,
      });
      return;
    }

    isPinnedRef.current = true;
    setIsPinnedToBottom(true);
    setScrollMode("at_bottom");
    setPendingRestoreScrollTop(null);
    requestScrollToBottom("conversation-change");
  }, [conversationId, messages, requestScrollToBottom]);

  React.useEffect(() => {
    const previousMessages = prevMessagesRef.current;
    const firstMessageId = messages[0]?.id;

    if (
      loadingOlderRef.current &&
      firstMessageId &&
      prevFirstMessageIdRef.current &&
      firstMessageId !== prevFirstMessageIdRef.current
    ) {
      loadingOlderRef.current = false;
      setScrollMode(isPinnedRef.current ? "at_bottom" : "reading_history");
      onAfterPrepend?.();
      prevMessagesRef.current = messages;
      prevFirstMessageIdRef.current = firstMessageId;
      return;
    }

    const appendedMessages = getTailAppendMessages(previousMessages, messages);
    if (appendedMessages && appendedMessages.length > 0) {
      const shouldForceFollowOwnMessage =
        previousMessages.length > 0 &&
        appendedMessages.some((message) => message.senderId === currentUserId);

      if (isPinnedRef.current || shouldForceFollowOwnMessage) {
        setScrollMode(
          shouldForceFollowOwnMessage ? "sending_own_message" : "receiving_new_message",
        );
        if (shouldForceFollowOwnMessage && !isPinnedRef.current) {
          updatePinnedState(true, "self-message", outerRef.current?.scrollTop ?? 0, 0, "sending_own_message");
        }
        setPendingNewMessages(0);
        requestScrollToBottom(
          shouldForceFollowOwnMessage ? "self-message" : "incoming-message",
        );
        logScrollTrace("incoming_followed", {
          conversationId,
          appendedCount: appendedMessages.length,
          forcedByOwnMessage: shouldForceFollowOwnMessage,
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
      }
    }

    prevMessagesRef.current = messages;
    prevFirstMessageIdRef.current = firstMessageId;
  }, [
    conversationId,
    currentUserId,
    messages,
    onAfterPrepend,
    outerRef,
    requestScrollToBottom,
    updatePinnedState,
  ]);

  React.useEffect(() => {
    if (!isLoadingMore) {
      loadingOlderRef.current = false;
    }
  }, [isLoadingMore]);

  React.useEffect(() => {
    if (messages.length !== 0) return;

    isPinnedRef.current = true;
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
      setScrollMode((previous) =>
        previous === nextPinnedState.mode ? previous : nextPinnedState.mode,
      );

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
    pendingRestoreScrollTop,
    pendingRestoreVersion,
  };
};

export default useAutoScrollToBottom;
