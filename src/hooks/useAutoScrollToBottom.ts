import React from "react";
import type { Message } from "../types";
import { getMessageStableKey } from "../utils/messageTimeline";
import { resolvePinnedToBottom } from "../utils/scrollController";
import { logScrollTrace } from "../utils/scrollTrace";

const LOAD_MORE_TRIGGER_PX = 120;

interface UseAutoScrollToBottomParams {
  conversationId: string;
  messages: Message[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore?: () => void | Promise<void>;
  onBeforeLoadMore?: () => void;
  onAfterPrepend?: () => void;
  outerRef: React.RefObject<HTMLDivElement | null>;
  requestScrollToBottom: (reason: string) => void;
}

interface UseAutoScrollToBottomResult {
  pendingNewMessages: number;
  isPinnedToBottom: boolean;
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
    ) => {
      isPinnedRef.current = nextPinnedToBottom;
      setIsPinnedToBottom((previous) =>
        previous === nextPinnedToBottom ? previous : nextPinnedToBottom,
      );

      if (typeof nextPendingNewMessages === "number") {
        setPendingNewMessages(nextPendingNewMessages);
      } else if (nextPinnedToBottom) {
        setPendingNewMessages(0);
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
      const nextPinnedToBottom = resolvePinnedToBottom(outer).isPinnedToBottom;
      updatePinnedState(nextPinnedToBottom, reason, nextScrollTop);
    },
    [outerRef, updatePinnedState],
  );

  const detachAutoFollow = React.useCallback(
    (reason: string = "detach") => {
      const outer = outerRef.current;
      updatePinnedState(
        false,
        reason,
        outer?.scrollTop ?? 0,
        pendingNewMessages,
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

    const savedSession = conversationScrollSessions.get(conversationId);
    if (savedSession && !savedSession.isPinnedToBottom) {
      isPinnedRef.current = false;
      setIsPinnedToBottom(false);
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
      onAfterPrepend?.();
      prevMessagesRef.current = messages;
      prevFirstMessageIdRef.current = firstMessageId;
      return;
    }

    const appendedMessages = getTailAppendMessages(previousMessages, messages);
    if (appendedMessages && appendedMessages.length > 0) {
      if (isPinnedRef.current) {
        setPendingNewMessages(0);
        requestScrollToBottom("incoming-message");
        logScrollTrace("incoming_followed", {
          conversationId,
          appendedCount: appendedMessages.length,
        });
      } else {
        setPendingNewMessages((previous) => previous + appendedMessages.length);
        logScrollTrace("incoming_buffered_for_reader", {
          conversationId,
          appendedCount: appendedMessages.length,
        });
      }
    }

    prevMessagesRef.current = messages;
    prevFirstMessageIdRef.current = firstMessageId;
  }, [conversationId, messages, onAfterPrepend, requestScrollToBottom]);

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
  }, [messages.length]);

  const handleScroll = React.useCallback(
    (scrollOffset: number) => {
      const outer = outerRef.current;
      if (!outer) return;

      const { isPinnedToBottom: nextPinnedToBottom } =
        resolvePinnedToBottom(outer);

      if (nextPinnedToBottom !== isPinnedRef.current) {
        updatePinnedState(nextPinnedToBottom, "user-scroll", scrollOffset);
      } else {
        persistSession(nextPinnedToBottom, scrollOffset);
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
    handleScroll,
    jumpToLatest,
    detachAutoFollow,
    syncScrollStateFromDom,
    pendingRestoreScrollTop,
    pendingRestoreVersion,
  };
};

export default useAutoScrollToBottom;
