import React from "react";
import type { Message } from "../types";

const LOAD_MORE_TRIGGER_PX = 120;
const NEAR_BOTTOM_PX = 180;

interface UseAutoScrollToBottomParams {
  conversationId: string;
  messages: Message[];
  currentUserId: string;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore?: () => void | Promise<void>;
  outerRef: React.RefObject<HTMLDivElement | null>;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

interface UseAutoScrollToBottomResult {
  pendingNewMessages: number;
  showNewMessagesPill: boolean;
  handleScroll: (scrollOffset: number) => void;
  jumpToLatest: (behavior?: ScrollBehavior) => void;
}

export const useAutoScrollToBottom = ({
  conversationId,
  messages,
  currentUserId,
  hasMore,
  isLoadingMore,
  onLoadMore,
  outerRef,
  scrollToBottom,
}: UseAutoScrollToBottomParams): UseAutoScrollToBottomResult => {
  const [pendingNewMessages, setPendingNewMessages] = React.useState(0);
  const [showNewMessagesPill, setShowNewMessagesPill] = React.useState(false);

  const nearBottomRef = React.useRef(true);
  const loadingOlderRef = React.useRef(false);
  const pendingNewMessagesRef = React.useRef(0);
  const prevMessageCountRef = React.useRef(0);
  const prevFirstMessageIdRef = React.useRef<string | undefined>(undefined);
  const prevLastMessageIdRef = React.useRef<string | undefined>(undefined);
  const prevConversationIdRef = React.useRef<string | null>(null);
  const scrollSnapshotRef = React.useRef({ scrollTop: 0, scrollHeight: 0 });

  const resetPill = React.useCallback(() => {
    pendingNewMessagesRef.current = 0;
    setPendingNewMessages(0);
    setShowNewMessagesPill(false);
  }, []);

  const jumpToLatest = React.useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      resetPill();
      scrollToBottom(behavior);
    },
    [resetPill, scrollToBottom],
  );

  React.useEffect(() => {
    const conversationChanged = prevConversationIdRef.current !== conversationId;
    if (!conversationChanged) return;

    prevConversationIdRef.current = conversationId;
    prevMessageCountRef.current = messages.length;
    prevFirstMessageIdRef.current = messages[0]?.id;
    prevLastMessageIdRef.current = messages[messages.length - 1]?.id;
    nearBottomRef.current = true;
    loadingOlderRef.current = false;
    resetPill();

    requestAnimationFrame(() => {
      scrollToBottom("auto");
    });
  }, [conversationId, messages, resetPill, scrollToBottom]);

  React.useEffect(() => {
    const outer = outerRef.current;
    const firstMessageId = messages[0]?.id;
    const lastMessage = messages[messages.length - 1];
    const lastMessageId = lastMessage?.id;
    const messageCountDiff = messages.length - prevMessageCountRef.current;
    const hasTailChanged =
      !!lastMessageId && lastMessageId !== prevLastMessageIdRef.current;
    const incomingCount =
      messageCountDiff > 0 ? messageCountDiff : hasTailChanged ? 1 : 0;
    const isOwnLatestMessage =
      !!lastMessage && lastMessage.senderId === currentUserId;

    if (
      loadingOlderRef.current &&
      outer &&
      firstMessageId &&
      prevFirstMessageIdRef.current &&
      firstMessageId !== prevFirstMessageIdRef.current
    ) {
      const scrollDelta = outer.scrollHeight - scrollSnapshotRef.current.scrollHeight;
      outer.scrollTop = scrollSnapshotRef.current.scrollTop + scrollDelta;
      loadingOlderRef.current = false;
    } else if (incomingCount > 0) {
      if (nearBottomRef.current || isOwnLatestMessage) {
        resetPill();
        scrollToBottom(incomingCount === 1 ? "smooth" : "auto");
      } else {
        pendingNewMessagesRef.current += incomingCount;
        setPendingNewMessages(pendingNewMessagesRef.current);
        setShowNewMessagesPill(true);
      }
    }

    prevMessageCountRef.current = messages.length;
    prevFirstMessageIdRef.current = firstMessageId;
    prevLastMessageIdRef.current = lastMessageId;
  }, [messages, currentUserId, outerRef, resetPill, scrollToBottom]);

  React.useEffect(() => {
    if (!isLoadingMore) {
      loadingOlderRef.current = false;
    }
  }, [isLoadingMore]);

  React.useEffect(() => {
    if (messages.length === 0) {
      resetPill();
    }
  }, [messages.length, resetPill]);

  const handleScroll = React.useCallback(
    (scrollOffset: number) => {
      const outer = outerRef.current;
      if (!outer) return;

      const isNearBottom =
        outer.scrollHeight - scrollOffset - outer.clientHeight < NEAR_BOTTOM_PX;
      nearBottomRef.current = isNearBottom;

      if (isNearBottom) {
        resetPill();
      } else {
        setShowNewMessagesPill(pendingNewMessagesRef.current > 0);
      }

      if (
        onLoadMore &&
        hasMore &&
        !isLoadingMore &&
        !loadingOlderRef.current &&
        scrollOffset < LOAD_MORE_TRIGGER_PX
      ) {
        loadingOlderRef.current = true;
        scrollSnapshotRef.current = {
          scrollTop: scrollOffset,
          scrollHeight: outer.scrollHeight,
        };

        Promise.resolve(onLoadMore()).catch(() => {
          loadingOlderRef.current = false;
        });
      }
    },
    [outerRef, resetPill, onLoadMore, hasMore, isLoadingMore],
  );

  return {
    pendingNewMessages,
    showNewMessagesPill,
    handleScroll,
    jumpToLatest,
  };
};

export default useAutoScrollToBottom;
