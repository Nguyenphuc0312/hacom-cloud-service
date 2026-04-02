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

type SessionAnchor = { itemKey: string | null; offsetWithinItem: number };

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
  detachAutoFollow: () => void;
  syncDetachedScrollState: () => void;
}

// Extended params — captureAnchor is called during scroll events to capture
// the anchor key for accurate session restore on conversation re-open.
interface UseAutoScrollToBottomParamsExtended extends UseAutoScrollToBottomParams {
  captureAnchor?: () => SessionAnchor | null;
}

interface UseAutoScrollToBottomResultExtended extends UseAutoScrollToBottomResult {
  pendingRestoreAnchor: SessionAnchor | null;
  pendingRestoreAnchorVersion: number;
}

type ScrollMetrics = {
  isAtBottom: boolean;
  distanceFromBottomPx: number;
  lastOffset: number;
  lastMeasureAt: number;
  velocityPxPerMs: number;
  lastInteractionAt: number;
};

interface ConversationScrollSession {
  followMode: ScrollFollowMode;
  scrollTop: number;
  anchor?: SessionAnchor;
}

const conversationScrollSessions = new Map<string, ConversationScrollSession>();

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
  captureAnchor,
}: UseAutoScrollToBottomParamsExtended): UseAutoScrollToBottomResultExtended => {
  const [displayMessages, setDisplayMessages] =
    React.useState<Message[]>(messages);
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
  const pendingRestoreScrollTopRef = React.useRef<number | null>(null);

  // Ref to the latest captureAnchor function — updated every render so it is
  // always current without needing to be listed in effect dependency arrays.
  const captureAnchorRef = React.useRef(captureAnchor);
  captureAnchorRef.current = captureAnchor;

  // Pre-captured anchor saved during user scroll events (detached mode).
  // Using a ref avoids re-running effects; the value is read when persisting.
  const sessionAnchorRef = React.useRef<SessionAnchor | undefined>(undefined);

  const [pendingRestoreAnchor, setPendingRestoreAnchor] =
    React.useState<SessionAnchor | null>(null);
  const [pendingRestoreAnchorVersion, setPendingRestoreAnchorVersion] =
    React.useState(0);

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

  const persistScrollSession = React.useCallback(
    (
      nextMode: ScrollFollowMode = followModeRef.current,
      nextScrollTop?: number,
    ) => {
      const outer = outerRef.current;
      const scrollTop =
        typeof nextScrollTop === "number"
          ? nextScrollTop
          : (outer?.scrollTop ?? scrollMetricsRef.current.lastOffset);

      conversationScrollSessions.set(conversationId, {
        followMode: nextMode,
        scrollTop: Math.max(0, scrollTop),
        anchor: nextMode === "detached" ? sessionAnchorRef.current : undefined,
      });
    },
    [conversationId, outerRef], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // captureAnchorRef is read via ref to avoid stale closures in cleanup effects.
  const updateSessionAnchor = React.useCallback((mode: ScrollFollowMode) => {
    if (mode === "detached") {
      sessionAnchorRef.current = captureAnchorRef.current?.() ?? undefined;
    } else {
      sessionAnchorRef.current = undefined;
    }
  }, []);

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
      sessionAnchorRef.current = undefined;
      syncUiState(0, "following", true);
      persistScrollSession("following", outerRef.current?.scrollTop ?? 0);

      if (behavior) {
        scrollToBottom(behavior);
      }
    },
    [outerRef, persistScrollSession, scrollToBottom, syncUiState],
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

    sessionAnchorRef.current = undefined;
    const savedSession = conversationScrollSessions.get(conversationId);
    prevConversationIdRef.current = conversationId;
    prevSourceMessagesRef.current = messages;
    prevFirstMessageIdRef.current = messages[0]?.id;
    loadingOlderRef.current = false;
    bufferedMessagesRef.current = [];
    setDisplayMessages(messages);
    pendingRestoreScrollTopRef.current = null;

    if (savedSession?.followMode === "detached") {
      followModeRef.current = "detached";
      scrollMetricsRef.current = {
        isAtBottom: false,
        distanceFromBottomPx: 0,
        lastOffset: savedSession.scrollTop,
        lastMeasureAt: 0,
        velocityPxPerMs: 0,
        lastInteractionAt: Date.now(),
      };
      if (savedSession.anchor) {
        // Anchor-based restore: let useScrollAnchorController position precisely.
        // Skip the pixel-based fallback (pendingRestoreScrollTopRef) so they don't fight.
        setPendingRestoreAnchor(savedSession.anchor);
        setPendingRestoreAnchorVersion((v) => v + 1);
      } else {
        pendingRestoreScrollTopRef.current = savedSession.scrollTop;
      }
      syncUiState(0, "detached", false);
      return;
    }

    followModeRef.current = "following";
    scrollMetricsRef.current = {
      isAtBottom: true,
      distanceFromBottomPx: 0,
      lastOffset: 0,
      lastMeasureAt: 0,
      velocityPxPerMs: 0,
      lastInteractionAt: Date.now(),
    };
    syncUiState(0, "following", true);

    scrollToBottom("auto");
  }, [conversationId, messages, scrollToBottom, syncUiState]);

  React.useLayoutEffect(() => {
    const pendingScrollTop = pendingRestoreScrollTopRef.current;
    const outer = outerRef.current;

    if (pendingScrollTop === null || !outer) {
      return;
    }

    const nextScrollTop = Math.max(
      0,
      Math.min(pendingScrollTop, outer.scrollHeight - outer.clientHeight),
    );
    outer.scrollTop = nextScrollTop;
    pendingRestoreScrollTopRef.current = null;

    const distanceFromBottom =
      outer.scrollHeight - nextScrollTop - outer.clientHeight;
    scrollMetricsRef.current = {
      ...scrollMetricsRef.current,
      isAtBottom: distanceFromBottom <= 0,
      distanceFromBottomPx: distanceFromBottom,
      lastOffset: nextScrollTop,
      lastMeasureAt: performance.now(),
      velocityPxPerMs: 0,
      lastInteractionAt: Date.now(),
    };
    persistScrollSession("detached", nextScrollTop);
  }, [displayMessages.length, outerRef, persistScrollSession]);

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
      setDisplayMessages(
        filterBufferedMessages(messages, updatedBufferedMessages),
      );
      syncUiState(
        updatedBufferedMessages.length,
        followModeRef.current,
        scrollMetricsRef.current.isAtBottom,
      );
      // SCROLL-08: tailAppend===null means the message array changed non-contiguously
      // (e.g., history gap after reconnect resync, or force-refresh). If we are in
      // following mode with no pending buffered messages, explicitly scroll to bottom
      // rather than relying on the indirect anchor-controller fallback chain.
      if (
        followModeRef.current === "following" &&
        scrollMetricsRef.current.isAtBottom &&
        updatedBufferedMessages.length === 0
      ) {
        scrollMetricsRef.current = {
          ...scrollMetricsRef.current,
          isAtBottom: true,
          distanceFromBottomPx: 0,
        };
        scrollToBottom("auto");
      }
    } else if (tailAppend.length > 0) {
      // SCROLL-01: When scrollMetricsRef.isAtBottom is true (set after every programmatic
      // scroll-to-bottom), trust it over a live DOM read. The DOM can be stale in the
      // frame where react-window has queued the scroll but the VirtualList has not yet
      // reconciled its estimated total height with the newly-rendered item's measured size,
      // causing distanceFromBottom to appear > 0 and triggering a false "detach" decision.
      const liveDistanceFromBottom =
        outer?.scrollHeight !== undefined
          ? outer.scrollHeight - outer.scrollTop - outer.clientHeight
          : scrollMetricsRef.current.distanceFromBottomPx;
      const distanceFromBottom = scrollMetricsRef.current.isAtBottom
        ? 0
        : liveDistanceFromBottom;
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
        persistScrollSession(decision.nextMode, outer?.scrollTop ?? 0);
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
        persistScrollSession(
          decision.nextMode,
          outer?.scrollTop ?? scrollMetricsRef.current.lastOffset,
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
      const userIntentDetach =
        followModeRef.current === "following" &&
        scrollOffset < previousMetrics.lastOffset - 2;
      const nextMode = userIntentDetach ? "detached" : scrollDecision.nextMode;
      const nextIsAtBottom = userIntentDetach
        ? false
        : scrollDecision.isAtBottom;

      scrollMetricsRef.current = {
        isAtBottom: nextIsAtBottom,
        distanceFromBottomPx: distanceFromBottom,
        lastOffset: scrollOffset,
        lastMeasureAt: now,
        velocityPxPerMs,
        lastInteractionAt: Date.now(),
      };
      followModeRef.current = nextMode;

      if (nextMode === "following") {
        updateSessionAnchor("following");
        if (bufferedMessagesRef.current.length > 0) {
          flushLiveBuffer("auto");
        } else {
          syncUiState(0, "following", nextIsAtBottom);
          persistScrollSession("following", scrollOffset);
        }
      } else {
        updateSessionAnchor("detached");
        syncUiState(
          bufferedMessagesRef.current.length,
          "detached",
          nextIsAtBottom,
        );
        persistScrollSession("detached", scrollOffset);
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
      persistScrollSession,
      syncUiState,
      updateSessionAnchor,
    ],
  );

  const detachAutoFollow = React.useCallback(() => {
    followModeRef.current = "detached";
    scrollMetricsRef.current = {
      ...scrollMetricsRef.current,
      isAtBottom: false,
      lastInteractionAt: Date.now(),
    };
    updateSessionAnchor("detached");
    syncUiState(bufferedMessagesRef.current.length, "detached", false);
    persistScrollSession(
      "detached",
      outerRef.current?.scrollTop ?? scrollMetricsRef.current.lastOffset,
    );
  }, [outerRef, persistScrollSession, syncUiState, updateSessionAnchor]);

  const syncDetachedScrollState = React.useCallback(() => {
    const outer = outerRef.current;
    if (!outer) return;

    const nextScrollTop = outer.scrollTop;
    const distanceFromBottom =
      outer.scrollHeight - nextScrollTop - outer.clientHeight;

    followModeRef.current = "detached";
    scrollMetricsRef.current = {
      ...scrollMetricsRef.current,
      isAtBottom: false,
      distanceFromBottomPx: distanceFromBottom,
      lastOffset: nextScrollTop,
      lastMeasureAt: performance.now(),
      velocityPxPerMs: 0,
      lastInteractionAt: Date.now(),
    };
    updateSessionAnchor("detached");
    syncUiState(bufferedMessagesRef.current.length, "detached", false);
    persistScrollSession("detached", nextScrollTop);
  }, [outerRef, persistScrollSession, syncUiState, updateSessionAnchor]);

  React.useEffect(
    () => () => {
      persistScrollSession();
    },
    [persistScrollSession],
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
    detachAutoFollow,
    syncDetachedScrollState,
    pendingRestoreAnchor,
    pendingRestoreAnchorVersion,
  };
};

export default useAutoScrollToBottom;
