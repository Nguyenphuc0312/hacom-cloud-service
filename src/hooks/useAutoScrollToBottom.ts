import React from "react";
import type { Message } from "../types";

const LOAD_MORE_TRIGGER_PX = 120;
const NEAR_BOTTOM_PX = 180;
const AUTO_SCROLL_DISTANCE_PX = 120;
const LIVE_BUFFER_IDLE_FLUSH_MS = 1200;

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
  displayMessages: Message[];
  pendingNewMessages: number;
  showNewMessagesPill: boolean;
  showJumpToBottom: boolean;
  handleScroll: (scrollOffset: number) => void;
  jumpToLatest: (behavior?: ScrollBehavior) => void;
}

type ScrollMetrics = {
  isNearBottom: boolean;
  lastOffset: number;
  lastMeasureAt: number;
  velocityPxPerMs: number;
  lastInteractionAt: number;
};

const getMessageStableKey = (message: Message): string =>
  message.stableId || message.clientMessageId || message.localId || message.id;

const dedupeMessagesByStableKey = (messages: Message[]): Message[] => {
  const seen = new Set<string>();
  const deduped: Message[] = [];

  for (const message of messages) {
    const key = getMessageStableKey(message);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(message);
  }

  return deduped;
};

const filterBufferedMessages = (
  source: Message[],
  bufferedMessages: Message[],
): Message[] => {
  if (bufferedMessages.length === 0) return source;
  const bufferedKeys = new Set(bufferedMessages.map(getMessageStableKey));
  return source.filter((message) => !bufferedKeys.has(getMessageStableKey(message)));
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

const shouldAutoScroll = ({
  distanceFromBottomPx,
  velocityPxPerMs,
  lastInteractionAgeMs,
}: {
  distanceFromBottomPx: number;
  velocityPxPerMs: number;
  lastInteractionAgeMs: number;
}): boolean => {
  const engagedBottom =
    distanceFromBottomPx < AUTO_SCROLL_DISTANCE_PX &&
    velocityPxPerMs >= -0.05 &&
    lastInteractionAgeMs < 2500;
  const passiveNearBottom =
    distanceFromBottomPx < 48 && lastInteractionAgeMs < 5000;

  return engagedBottom || passiveNearBottom;
};

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
  const [displayMessages, setDisplayMessages] = React.useState<Message[]>(messages);
  const [pendingNewMessages, setPendingNewMessages] = React.useState(0);
  const [showNewMessagesPill, setShowNewMessagesPill] = React.useState(false);
  const [showJumpToBottom, setShowJumpToBottom] = React.useState(false);

  const scrollMetricsRef = React.useRef<ScrollMetrics>({
    isNearBottom: true,
    lastOffset: 0,
    lastMeasureAt: 0,
    velocityPxPerMs: 0,
    lastInteractionAt: Date.now(),
  });
  const loadingOlderRef = React.useRef(false);
  const prevSourceMessagesRef = React.useRef<Message[]>(messages);
  const prevFirstMessageIdRef = React.useRef<string | undefined>(undefined);
  const prevConversationIdRef = React.useRef<string | null>(null);
  const latestMessagesRef = React.useRef<Message[]>(messages);
  const bufferedMessagesRef = React.useRef<Message[]>([]);
  const scrollSnapshotRef = React.useRef({ scrollTop: 0, scrollHeight: 0 });
  const idleFlushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearIdleFlushTimer = React.useCallback(() => {
    if (idleFlushTimerRef.current) {
      clearTimeout(idleFlushTimerRef.current);
      idleFlushTimerRef.current = null;
    }
  }, []);

  const updatePendingUi = React.useCallback((bufferedMessages: Message[]) => {
    const count = bufferedMessages.length;
    setPendingNewMessages(count);
    setShowNewMessagesPill(count > 0);
    setShowJumpToBottom(
      count > 0 || !scrollMetricsRef.current.isNearBottom,
    );
  }, []);

  const flushLiveBuffer = React.useCallback(
    (behavior?: ScrollBehavior) => {
      clearIdleFlushTimer();
      bufferedMessagesRef.current = [];
      setDisplayMessages(latestMessagesRef.current);
      setPendingNewMessages(0);
      setShowNewMessagesPill(false);
      setShowJumpToBottom(!scrollMetricsRef.current.isNearBottom);

      if (behavior) {
        scrollToBottom(behavior);
      }
    },
    [clearIdleFlushTimer, scrollToBottom],
  );

  const scheduleIdleFlush = React.useCallback(() => {
    clearIdleFlushTimer();
    if (bufferedMessagesRef.current.length === 0) return;

    const elapsed = Date.now() - scrollMetricsRef.current.lastInteractionAt;
    const waitMs = Math.max(0, LIVE_BUFFER_IDLE_FLUSH_MS - elapsed);

    idleFlushTimerRef.current = setTimeout(() => {
      flushLiveBuffer();
    }, waitMs);
  }, [clearIdleFlushTimer, flushLiveBuffer]);

  const jumpToLatest = React.useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      flushLiveBuffer(behavior);
    },
    [flushLiveBuffer],
  );

  React.useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

  React.useEffect(() => {
    const conversationChanged =
      prevConversationIdRef.current !== conversationId;
    if (!conversationChanged) return;

    prevConversationIdRef.current = conversationId;
    prevSourceMessagesRef.current = messages;
    prevFirstMessageIdRef.current = messages[0]?.id;
    scrollMetricsRef.current = {
      isNearBottom: true,
      lastOffset: 0,
      lastMeasureAt: 0,
      velocityPxPerMs: 0,
      lastInteractionAt: Date.now(),
    };
    loadingOlderRef.current = false;
    bufferedMessagesRef.current = [];
    clearIdleFlushTimer();
    setDisplayMessages(messages);
    setPendingNewMessages(0);
    setShowNewMessagesPill(false);
    setShowJumpToBottom(false);

    scrollToBottom("auto");
    requestAnimationFrame(() => {
      scrollToBottom("auto");
    });
    const retryTimer = setTimeout(() => {
      scrollToBottom("auto");
    }, 80);

    return () => {
      clearTimeout(retryTimer);
    };
  }, [clearIdleFlushTimer, conversationId, messages, scrollToBottom]);

  React.useEffect(() => {
    const outer = outerRef.current;
    const previousMessages = prevSourceMessagesRef.current;
    const bufferedMessages = bufferedMessagesRef.current;
    const firstMessageId = messages[0]?.id;
    const tailAppend = getTailAppendMessages(previousMessages, messages);
    const latestMessage = messages[messages.length - 1];
    const latestIsOwnMessage =
      !!latestMessage && latestMessage.senderId === currentUserId;

    if (
      loadingOlderRef.current &&
      outer &&
      firstMessageId &&
      prevFirstMessageIdRef.current &&
      firstMessageId !== prevFirstMessageIdRef.current
    ) {
      setDisplayMessages(filterBufferedMessages(messages, bufferedMessages));
      const scrollDelta =
        outer.scrollHeight - scrollSnapshotRef.current.scrollHeight;
      outer.scrollTop = scrollSnapshotRef.current.scrollTop + scrollDelta;
      loadingOlderRef.current = false;
    } else if (tailAppend === null) {
      const updatedBufferedMessages = bufferedMessages
        .map((bufferedMessage) => {
          const key = getMessageStableKey(bufferedMessage);
          return (
            messages.find((message) => getMessageStableKey(message) === key) ??
            bufferedMessage
          );
        })
        .filter(Boolean);
      bufferedMessagesRef.current = updatedBufferedMessages;
      setDisplayMessages(filterBufferedMessages(messages, updatedBufferedMessages));
      updatePendingUi(updatedBufferedMessages);
    } else if (tailAppend.length > 0) {
      const outerDistance =
        outer?.scrollHeight !== undefined
          ? outer.scrollHeight - outer.scrollTop - outer.clientHeight
          : Number.POSITIVE_INFINITY;
      const canAutoScroll =
        scrollMetricsRef.current.isNearBottom ||
        latestIsOwnMessage ||
        shouldAutoScroll({
          distanceFromBottomPx: outerDistance,
          velocityPxPerMs: scrollMetricsRef.current.velocityPxPerMs,
          lastInteractionAgeMs:
            Date.now() - scrollMetricsRef.current.lastInteractionAt,
        });

      if (canAutoScroll) {
        setDisplayMessages(messages);
        bufferedMessagesRef.current = [];
        setPendingNewMessages(0);
        setShowNewMessagesPill(false);
        scrollToBottom(tailAppend.length === 1 ? "smooth" : "auto");
        setShowJumpToBottom(false);
      } else {
        bufferedMessagesRef.current = dedupeMessagesByStableKey([
          ...bufferedMessages,
          ...tailAppend,
        ]);
        setDisplayMessages(
          filterBufferedMessages(messages, bufferedMessagesRef.current),
        );
        updatePendingUi(bufferedMessagesRef.current);
        scheduleIdleFlush();
      }
    } else {
      setDisplayMessages(filterBufferedMessages(messages, bufferedMessages));
      updatePendingUi(bufferedMessages);
    }

    prevSourceMessagesRef.current = messages;
    prevFirstMessageIdRef.current = firstMessageId;
  }, [
    currentUserId,
    messages,
    outerRef,
    scheduleIdleFlush,
    scrollToBottom,
    updatePendingUi,
  ]);

  React.useEffect(() => {
    if (!isLoadingMore) {
      loadingOlderRef.current = false;
    }
  }, [isLoadingMore]);

  React.useEffect(() => {
    if (messages.length === 0) {
      clearIdleFlushTimer();
      bufferedMessagesRef.current = [];
      setDisplayMessages([]);
      setPendingNewMessages(0);
      setShowNewMessagesPill(false);
      setShowJumpToBottom(false);
    }
  }, [clearIdleFlushTimer, messages.length]);

  React.useEffect(() => () => clearIdleFlushTimer(), [clearIdleFlushTimer]);

  const handleScroll = React.useCallback(
    (scrollOffset: number) => {
      const outer = outerRef.current;
      if (!outer) return;

      const now = performance.now();
      const previousMetrics = scrollMetricsRef.current;
      const elapsed = now - previousMetrics.lastMeasureAt;
      const velocityPxPerMs =
        elapsed > 0
          ? (scrollOffset - previousMetrics.lastOffset) / elapsed
          : previousMetrics.velocityPxPerMs;
      const distanceFromBottom =
        outer.scrollHeight - scrollOffset - outer.clientHeight;
      const isNearBottom = distanceFromBottom < NEAR_BOTTOM_PX;

      scrollMetricsRef.current = {
        isNearBottom,
        lastOffset: scrollOffset,
        lastMeasureAt: now,
        velocityPxPerMs,
        lastInteractionAt: Date.now(),
      };

      if (isNearBottom) {
        if (bufferedMessagesRef.current.length > 0) {
          flushLiveBuffer("auto");
        } else {
          setPendingNewMessages(0);
          setShowNewMessagesPill(false);
          setShowJumpToBottom(false);
        }
      } else {
        setShowJumpToBottom(true);
        setShowNewMessagesPill(bufferedMessagesRef.current.length > 0);
        scheduleIdleFlush();
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
    [
      flushLiveBuffer,
      hasMore,
      isLoadingMore,
      onLoadMore,
      outerRef,
      scheduleIdleFlush,
    ],
  );

  return {
    displayMessages,
    pendingNewMessages,
    showNewMessagesPill,
    showJumpToBottom,
    handleScroll,
    jumpToLatest,
  };
};

export default useAutoScrollToBottom;
