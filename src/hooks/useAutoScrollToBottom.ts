import React from "react";
import type { Message } from "../types";
import { getMessageStableKey } from "../utils/messageTimeline";
import {
  decideAutoScroll,
  deriveFollowModeFromScroll,
  type ScrollFollowMode,
} from "../utils/scrollController";

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
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

interface UseAutoScrollToBottomResult {
  displayMessages: Message[];
  pendingNewMessages: number;
  showNewMessagesPill: boolean;
  showJumpToBottom: boolean;
  isAtBottom: boolean;
  autoFollowEnabled: boolean;
  followMode: ScrollFollowMode;
  handleScroll: (scrollOffset: number) => void;
  jumpToLatest: (behavior?: ScrollBehavior) => void;
}

type ScrollMetrics = {
  isAtBottom: boolean;
  distanceFromBottomPx: number;
  lastOffset: number;
  lastMeasureAt: number;
  velocityPxPerMs: number;
  lastInteractionAt: number;
};

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
  return source.filter(
    (message) => !bufferedKeys.has(getMessageStableKey(message)),
  );
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
  hasMore,
  isLoadingMore,
  onLoadMore,
  onBeforeLoadMore,
  onAfterPrepend,
  outerRef,
  scrollToBottom,
}: UseAutoScrollToBottomParams): UseAutoScrollToBottomResult => {
  const [displayMessages, setDisplayMessages] = React.useState<Message[]>(messages);
  const [pendingNewMessages, setPendingNewMessages] = React.useState(0);
  const [showNewMessagesPill, setShowNewMessagesPill] = React.useState(false);
  const [showJumpToBottom, setShowJumpToBottom] = React.useState(false);
  const [isAtBottom, setIsAtBottom] = React.useState(true);
  const [followMode, setFollowMode] =
    React.useState<ScrollFollowMode>("following");

  const scrollMetricsRef = React.useRef<ScrollMetrics>({
    isAtBottom: true,
    distanceFromBottomPx: 0,
    lastOffset: 0,
    lastMeasureAt: 0,
    velocityPxPerMs: 0,
    lastInteractionAt: Date.now(),
  });
  const loadingOlderRef = React.useRef(false);
  const followModeRef = React.useRef<ScrollFollowMode>("following");
  const prevSourceMessagesRef = React.useRef<Message[]>(messages);
  const prevFirstMessageIdRef = React.useRef<string | undefined>(undefined);
  const prevConversationIdRef = React.useRef<string | null>(null);
  const latestMessagesRef = React.useRef<Message[]>(messages);
  const bufferedMessagesRef = React.useRef<Message[]>([]);
  const scrollSnapshotRef = React.useRef({ scrollTop: 0, scrollHeight: 0 });

  const syncUiState = React.useCallback(
    (
      nextBufferedCount: number,
      nextMode: ScrollFollowMode,
      nextIsAtBottom: boolean,
    ) => {
      setPendingNewMessages(nextBufferedCount);
      setShowNewMessagesPill(nextBufferedCount > 0);
      setShowJumpToBottom(
        nextBufferedCount > 0 || nextMode !== "following" || !nextIsAtBottom,
      );
      setIsAtBottom(nextIsAtBottom);
      setFollowMode((previous) =>
        previous === nextMode ? previous : nextMode,
      );
    },
    [],
  );

  const flushLiveBuffer = React.useCallback(
    (behavior?: ScrollBehavior) => {
      followModeRef.current = "following";
      bufferedMessagesRef.current = [];
      setDisplayMessages(latestMessagesRef.current);
      scrollMetricsRef.current = {
        ...scrollMetricsRef.current,
        isAtBottom: true,
        distanceFromBottomPx: 0,
      };
      syncUiState(0, "following", true);

      if (behavior) {
        scrollToBottom(behavior);
      }
    },
    [scrollToBottom, syncUiState],
  );

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
    followModeRef.current = "following";
    scrollMetricsRef.current = {
      isAtBottom: true,
      distanceFromBottomPx: 0,
      lastOffset: 0,
      lastMeasureAt: 0,
      velocityPxPerMs: 0,
      lastInteractionAt: Date.now(),
    };
    loadingOlderRef.current = false;
    bufferedMessagesRef.current = [];
    setDisplayMessages(messages);
    syncUiState(0, "following", true);

    scrollToBottom("auto");
  }, [conversationId, messages, scrollToBottom, syncUiState]);

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
      loadingOlderRef.current = false;
      if (onAfterPrepend) {
        onAfterPrepend();
      } else {
        const scrollDelta =
          outer.scrollHeight - scrollSnapshotRef.current.scrollHeight;
        outer.scrollTop = scrollSnapshotRef.current.scrollTop + scrollDelta;
      }
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
      syncUiState(
        updatedBufferedMessages.length,
        followModeRef.current,
        scrollMetricsRef.current.isAtBottom,
      );
    } else if (tailAppend.length > 0) {
      const distanceFromBottom =
        outer?.scrollHeight !== undefined
          ? outer.scrollHeight - outer.scrollTop - outer.clientHeight
          : scrollMetricsRef.current.distanceFromBottomPx;
      const decision = decideAutoScroll({
        currentMode: followModeRef.current,
        distanceFromBottomPx: distanceFromBottom,
        clientHeightPx: outer?.clientHeight ?? 0,
        velocityPxPerMs: scrollMetricsRef.current.velocityPxPerMs,
        lastInteractionAgeMs:
          Date.now() - scrollMetricsRef.current.lastInteractionAt,
        latestIsOwnMessage,
        appendedCount: tailAppend.length,
        pendingBufferedCount: bufferedMessages.length,
      });

      if (decision.action === "follow") {
        bufferedMessagesRef.current = [];
        followModeRef.current = decision.nextMode;
        setDisplayMessages(messages);
        scrollMetricsRef.current = {
          ...scrollMetricsRef.current,
          isAtBottom: true,
          distanceFromBottomPx: 0,
        };
        syncUiState(0, decision.nextMode, true);
        scrollToBottom(decision.behavior);
      } else {
        bufferedMessagesRef.current = dedupeMessagesByStableKey([
          ...bufferedMessages,
          ...tailAppend,
        ]);
        followModeRef.current = decision.nextMode;
        setDisplayMessages(
          filterBufferedMessages(messages, bufferedMessagesRef.current),
        );
        syncUiState(
          bufferedMessagesRef.current.length,
          decision.nextMode,
          scrollMetricsRef.current.isAtBottom,
        );
      }
    } else {
      setDisplayMessages(filterBufferedMessages(messages, bufferedMessages));
      syncUiState(
        bufferedMessages.length,
        followModeRef.current,
        scrollMetricsRef.current.isAtBottom,
      );
    }

    prevSourceMessagesRef.current = messages;
    prevFirstMessageIdRef.current = firstMessageId;
  }, [
    currentUserId,
    messages,
    onAfterPrepend,
    outerRef,
    scrollToBottom,
    syncUiState,
  ]);

  React.useEffect(() => {
    if (!isLoadingMore) {
      loadingOlderRef.current = false;
    }
  }, [isLoadingMore]);

  React.useEffect(() => {
    if (messages.length === 0) {
      followModeRef.current = "following";
      bufferedMessagesRef.current = [];
      setDisplayMessages([]);
      scrollMetricsRef.current = {
        ...scrollMetricsRef.current,
        isAtBottom: true,
        distanceFromBottomPx: 0,
      };
      syncUiState(0, "following", true);
    }
  }, [messages.length, syncUiState]);

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
      const scrollDecision = deriveFollowModeFromScroll({
        distanceFromBottomPx: distanceFromBottom,
        clientHeightPx: outer.clientHeight,
        velocityPxPerMs,
        pendingBufferedCount: bufferedMessagesRef.current.length,
        currentMode: followModeRef.current,
      });

      scrollMetricsRef.current = {
        isAtBottom: scrollDecision.isAtBottom,
        distanceFromBottomPx: distanceFromBottom,
        lastOffset: scrollOffset,
        lastMeasureAt: now,
        velocityPxPerMs,
        lastInteractionAt: Date.now(),
      };
      followModeRef.current = scrollDecision.nextMode;

      if (scrollDecision.nextMode === "following") {
        if (bufferedMessagesRef.current.length > 0) {
          flushLiveBuffer("auto");
        } else {
          syncUiState(0, "following", scrollDecision.isAtBottom);
        }
      } else {
        syncUiState(
          bufferedMessagesRef.current.length,
          "detached",
          scrollDecision.isAtBottom,
        );
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
      onBeforeLoadMore,
      onLoadMore,
      outerRef,
      syncUiState,
    ],
  );

  return {
    displayMessages,
    pendingNewMessages,
    showNewMessagesPill,
    showJumpToBottom,
    isAtBottom,
    autoFollowEnabled: followMode === "following",
    followMode,
    handleScroll,
    jumpToLatest,
  };
};

export default useAutoScrollToBottom;
