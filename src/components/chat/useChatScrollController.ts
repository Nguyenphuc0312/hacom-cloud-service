import React from "react";
import type { Message } from "../../types";
import { getMessageStableKey } from "../../utils/messageTimeline";
import { resolvePinnedToBottom } from "../../utils/scrollController";
import type { ConversationVirtualizerScrollBehavior } from "../../hooks/virtualizerContract";
import { logChatPerformance, measureChatPerformance } from "../../utils/chatPerformance";
import { logScrollTrace } from "../../utils/scrollTrace";

export type ChatScrollMode =
  | "idle"
  | "opening_conversation"
  | "waiting_for_data"
  | "waiting_for_measurement"
  | "restoring_history"
  | "scrolling_to_bottom"
  | "settled_at_bottom"
  | "settled_reading_history"
  | "loading_older"
  | "appending_new_message";

export type ChatScrollEvent =
  | "CONVERSATION_CHANGED"
  | "INITIAL_MESSAGES_READY"
  | "VIRTUALIZER_MEASURED"
  | "RESTORE_AVAILABLE"
  | "RESTORE_INVALIDATED"
  | "USER_SCROLL"
  | "LOAD_OLDER_START"
  | "LOAD_OLDER_COMMIT"
  | "NEW_MESSAGE_APPENDED"
  | "OWN_MESSAGE_APPENDED"
  | "USER_CLICK_NEW_MESSAGES"
  | "MEDIA_RESIZED";

type OpenIntent = "latest" | "restore" | "restore_candidate";

type CommandKind = "bottom" | "offset" | "hold";

type CommandName =
  | "load_older_anchor_restore"
  | "own_message_follow_bottom"
  | "conversation_open_latest_bottom"
  | "unread_or_newer_tail_bottom"
  | "restore_history_position"
  | "realtime_follow_if_near_bottom"
  | "hold_reading_history";

type ScheduleCommandInput = Omit<PendingCommand, "priority" | "requestedAt"> & {
  priority?: number;
  requestedAt?: number;
};

interface ScrollAnchor {
  messageId: string | null;
  offsetFromTop: number;
  scrollTop: number;
  scrollHeight: number;
}

interface PendingCommand {
  kind: CommandKind;
  command: CommandName;
  priority: number;
  reason: string;
  event: ChatScrollEvent;
  conversationId: string;
  offset?: number;
  anchor?: ScrollAnchor | null;
  behavior?: ConversationVirtualizerScrollBehavior;
  requestedAt: number;
  attempts: number;
}

interface ScrollSession {
  consumed: boolean;
  latestKey: string | null;
  isPinnedToBottom: boolean;
  anchor: ScrollAnchor | null;
  scrollTop: number;
  updatedAt: number;
}

interface MessageSnapshot {
  conversationId: string;
  messageCount: number;
  firstKey: string | null;
  latestKey: string | null;
  messages: Message[];
}

interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  distanceToBottom: number | null;
}

export interface ChatScrollControllerParams {
  conversationId: string;
  messages: Message[];
  currentUserId: string;
  hasUnread: boolean;
  unreadRestoreSignature?: string | null;
  onUnreadRestoreConsumed?: (signature: string) => void;
  isInitialLoading: boolean;
  hasLoaded: boolean;
  isFetchingMessages: boolean;
  hasMoreOlder: boolean;
  isLoadingOlder: boolean;
  onLoadOlder?: () => void | Promise<void>;
  outerRef: React.RefObject<HTMLDivElement | null>;
  itemCount: number;
  virtualItemsCount: number;
  totalSize: number;
  viewportHeight: number;
  getItemOffset: (index: number) => number;
  resolveMessageIndex: (messageId: string | null) => number;
  captureVisibleAnchor: () => { messageId: string | null; offsetFromTop: number } | null;
  scrollToOffset: (
    offset: number,
    behavior?: ConversationVirtualizerScrollBehavior,
  ) => void;
  scrollToIndex: (
    index: number,
    align?: "start" | "center" | "end" | "auto",
    behavior?: ConversationVirtualizerScrollBehavior,
  ) => void;
}

export interface ChatScrollControllerResult {
  mode: ChatScrollMode;
  isPinnedToBottom: boolean;
  pendingNewMessages: number;
  firstDetachedUnreadMessageId: string | null;
  handleUserScroll: (scrollTop?: number) => void;
  jumpToLatest: () => void;
  requestOffset: (
    offset: number,
    reason: string,
    event?: ChatScrollEvent,
  ) => boolean;
  detachForJump: (reason?: string) => void;
  handleMediaResized: (
    anchor?: { messageId: string | null; offsetFromTop: number } | null,
  ) => void;
}

const NEAR_BOTTOM_THRESHOLD_PX = 96;
const LOAD_MORE_TRIGGER_PX = 120;
const BOTTOM_SETTLE_DISTANCE_PX = 3;
// Tolerance for DOM rect check — absorbs subpixel rounding and thin borders
const BOTTOM_CLIPPING_BUFFER_PX = 4;
const MAX_COMMAND_RAF_ATTEMPTS = 5;
const MAX_SCROLL_SESSIONS = 80;
const SMOOTH_SCROLL_MAX_DISTANCE_PX = 640;
// Pinned hysteresis thresholds live in scrollController.ts: ENTER=24px, LEAVE=80px.
// NEAR_BOTTOM_THRESHOLD_PX (96) is used separately for append-follow decisions.
// Milliseconds after last wheel/touch event before we consider user scroll idle.
const USER_SCROLL_IDLE_MS = 180;
// Minimum gap between consecutive load-older triggers to prevent looping on prepend restore.
const LOAD_OLDER_COOLDOWN_MS = 800;

const scrollSessions = new Map<string, ScrollSession>();

export const __resetChatScrollSessionsForTest = (): void => {
  scrollSessions.clear();
};

export const getChatMessageLatestKey = (messages: Message[]): string | null => {
  const latestMessage = messages[messages.length - 1];
  if (!latestMessage) return null;
  const messageWithSeq = latestMessage as Message & { messageSeq?: number };
  const seq =
    typeof latestMessage.serverSeq === "number"
      ? latestMessage.serverSeq
      : typeof messageWithSeq.messageSeq === "number"
        ? messageWithSeq.messageSeq
        : "";
  return `${latestMessage.id}:${seq}:${messages.length}`;
};

const getLastSeq = (message: Message | undefined): number | null => {
  if (!message) return null;
  const messageWithSeq = message as Message & { messageSeq?: number };
  if (typeof message.serverSeq === "number") return message.serverSeq;
  if (typeof messageWithSeq.messageSeq === "number") return messageWithSeq.messageSeq;
  return null;
};

const getCommandPriority = (command: CommandName): number => {
  switch (command) {
    case "load_older_anchor_restore":
      return 100;
    case "own_message_follow_bottom":
      return 90;
    case "conversation_open_latest_bottom":
      return 80;
    case "unread_or_newer_tail_bottom":
      return 70;
    case "restore_history_position":
      return 60;
    case "realtime_follow_if_near_bottom":
      return 50;
    case "hold_reading_history":
      return 10;
    default:
      return 0;
  }
};

const getSnapshot = (
  conversationId: string,
  messages: Message[],
): MessageSnapshot => ({
  conversationId,
  messageCount: messages.length,
  firstKey: messages[0] ? getMessageStableKey(messages[0]) : null,
  latestKey: getChatMessageLatestKey(messages),
  messages,
});

const pruneScrollSessions = (): void => {
  if (scrollSessions.size <= MAX_SCROLL_SESSIONS) return;
  const entries = Array.from(scrollSessions.entries()).sort(
    ([, first], [, second]) => first.updatedAt - second.updatedAt,
  );
  const deleteCount = scrollSessions.size - MAX_SCROLL_SESSIONS;
  entries.slice(0, deleteCount).forEach(([conversationId]) => {
    scrollSessions.delete(conversationId);
  });
};

const getTailAppendMessages = (
  previousMessages: Message[],
  nextMessages: Message[],
): Message[] | null => {
  if (previousMessages.length === 0 || nextMessages.length <= previousMessages.length) {
    return null;
  }

  const previousLastKey = getMessageStableKey(previousMessages[previousMessages.length - 1]);
  const previousLastIndex = nextMessages.findIndex(
    (message) => getMessageStableKey(message) === previousLastKey,
  );
  if (previousLastIndex < 0) return null;
  return nextMessages.slice(previousLastIndex + 1);
};

const isOlderPrepend = (
  previousMessages: Message[],
  nextMessages: Message[],
): boolean => {
  if (previousMessages.length === 0 || nextMessages.length <= previousMessages.length) {
    return false;
  }

  const prependedCount = nextMessages.length - previousMessages.length;
  const previousFirstKey = getMessageStableKey(previousMessages[0]);
  const nextFirstKey = getMessageStableKey(nextMessages[0]);
  if (previousFirstKey === nextFirstKey) return false;

  return previousMessages.every((message, index) => {
    const nextMessage = nextMessages[index + prependedCount];
    return Boolean(nextMessage) && getMessageStableKey(nextMessage) === getMessageStableKey(message);
  });
};

export const useChatScrollController = ({
  conversationId,
  messages,
  currentUserId,
  hasUnread,
  unreadRestoreSignature,
  onUnreadRestoreConsumed,
  isInitialLoading,
  hasLoaded,
  isFetchingMessages,
  hasMoreOlder,
  isLoadingOlder,
  onLoadOlder,
  outerRef,
  itemCount,
  virtualItemsCount,
  totalSize,
  viewportHeight,
  getItemOffset,
  resolveMessageIndex,
  captureVisibleAnchor,
  scrollToOffset,
}: ChatScrollControllerParams): ChatScrollControllerResult => {
  const [mode, setMode] = React.useState<ChatScrollMode>("idle");
  const [isPinnedToBottom, setIsPinnedToBottom] = React.useState(true);
  const [pendingNewMessages, setPendingNewMessages] = React.useState(0);
  const [firstDetachedUnreadMessageId, setFirstDetachedUnreadMessageId] =
    React.useState<string | null>(null);

  const modeRef = React.useRef<ChatScrollMode>("idle");
  const isPinnedRef = React.useRef(true);
  const pendingCommandRef = React.useRef<PendingCommand | null>(null);
  const commandRafRef = React.useRef<number | null>(null);
  const runCommandRef = React.useRef<((command: PendingCommand) => void) | null>(null);
  const scheduleCommandRef = React.useRef<((command: ScheduleCommandInput) => boolean) | null>(
    null,
  );
  const previousSnapshotRef = React.useRef<MessageSnapshot | null>(null);
  const openingRef = React.useRef<{
    conversationId: string;
    intent: OpenIntent;
    baselineLatestKey: string | null;
    restoreSession: ScrollSession | null;
    bottomApplied: boolean;
    restoreApplied: boolean;
  } | null>(null);
  const loadingOlderAnchorRef = React.useRef<ScrollAnchor | null>(null);
  const hasUserScrollSinceOpenRef = React.useRef(false);
  const scrollRafRef = React.useRef<number | null>(null);
  const appliedUnreadSignatureRef = React.useRef<string | null>(null);
  const firstRenderMeasuredRef = React.useRef<string | null>(null);
  const appendStartedAtRef = React.useRef<number | null>(null);
  const lastOpeningBottomCommandKeyRef = React.useRef<string | null>(null);
  // Set to true while wheel/touch scroll is active; cleared after USER_SCROLL_IDLE_MS.
  // Prevents ResizeObserver anchor-restore from fighting user input.
  const userScrollingRef = React.useRef(false);
  const userScrollIdleTimerRef = React.useRef<number | null>(null);
  // Timestamp of last load-older trigger to prevent re-entry before prepend settles.
  const lastLoadOlderAtRef = React.useRef(0);

  const latestKey = getChatMessageLatestKey(messages);

  const setControllerMode = React.useCallback(
    (nextMode: ChatScrollMode, event: ChatScrollEvent, reason: string) => {
      void event;
      void reason;
      setMode((previous) => {
        if (previous === nextMode) return previous;
        modeRef.current = nextMode;
        return nextMode;
      });
    },
    [],
  );

  const getMetrics = React.useCallback((): ScrollMetrics => {
    const outer = outerRef.current;
    if (!outer) {
      return {
        scrollTop: 0,
        scrollHeight: 0,
        clientHeight: 0,
        distanceToBottom: null,
      };
    }

    const contentHeight = Math.max(totalSize, outer.scrollHeight);
    const bottomTarget = Math.max(0, Math.ceil(contentHeight - outer.clientHeight));
    return {
      scrollTop: outer.scrollTop,
      scrollHeight: outer.scrollHeight,
      clientHeight: outer.clientHeight,
      distanceToBottom: Math.max(0, bottomTarget - outer.scrollTop),
    };
  }, [outerRef, totalSize]);

  const traceScrollDecision = React.useCallback(
    ({
      event,
      command,
      priority,
      reason,
      previousLatestKey,
      openIntent,
      hasRestore,
      restoreValid,
      nearBottom,
      mode: traceMode,
      extra,
    }: {
      event: ChatScrollEvent | string;
      command: CommandName | string | null;
      priority: number | null;
      reason: string;
      previousLatestKey?: string | null;
      openIntent?: OpenIntent | null;
      hasRestore?: boolean;
      restoreValid?: boolean;
      nearBottom?: boolean | null;
      mode?: ChatScrollMode;
      extra?: Record<string, unknown>;
    }) => {
      const metrics = getMetrics();
      const latestMessage = messages[messages.length - 1];
      logScrollTrace("scroll_decision", {
        conversationId,
        mode: traceMode ?? modeRef.current,
        event,
        command,
        priority,
        reason,
        messageCount: messages.length,
        lastMessageId: latestMessage?.id ?? null,
        lastSeq: getLastSeq(latestMessage),
        latestKey,
        previousLatestKey:
          previousLatestKey === undefined
            ? previousSnapshotRef.current?.latestKey ?? null
            : previousLatestKey,
        openIntent: openIntent ?? openingRef.current?.intent ?? null,
        hasRestore: hasRestore ?? Boolean(openingRef.current?.restoreSession),
        restoreValid: restoreValid ?? null,
        nearBottom:
          nearBottom ??
          (metrics.distanceToBottom === null
            ? null
            : metrics.distanceToBottom <= NEAR_BOTTOM_THRESHOLD_PX),
        distanceToBottom: metrics.distanceToBottom,
        scrollTop: metrics.scrollTop,
        scrollHeight: metrics.scrollHeight,
        clientHeight: metrics.clientHeight,
        virtualItemsCount,
        ...(extra ?? {}),
      });
    },
    [conversationId, getMetrics, latestKey, messages, virtualItemsCount],
  );

  const persistSession = React.useCallback(
    (reason: string) => {
      const metrics = getMetrics();
      const anchor = captureVisibleAnchor();
      scrollSessions.set(conversationId, {
        consumed: false,
        latestKey,
        isPinnedToBottom: isPinnedRef.current,
        anchor: anchor
          ? {
            ...anchor,
            scrollTop: metrics.scrollTop,
            scrollHeight: metrics.scrollHeight,
          }
          : null,
        scrollTop: metrics.scrollTop,
        updatedAt: Date.now(),
      });
      pruneScrollSessions();
      traceScrollDecision({
        event: "USER_SCROLL",
        command: null,
        priority: null,
        reason,
        extra: {
          persisted: true,
          persistedPinned: isPinnedRef.current,
          persistedLatestKey: latestKey,
          persistedAnchorMessageId: anchor?.messageId ?? null,
        },
      });
    },
    [captureVisibleAnchor, conversationId, getMetrics, latestKey, traceScrollDecision],
  );

  const cancelPendingCommand = React.useCallback(
    (reason: string) => {
      if (commandRafRef.current !== null) {
        cancelAnimationFrame(commandRafRef.current);
        commandRafRef.current = null;
      }
      if (pendingCommandRef.current) {
        traceScrollDecision({
          event: "command_cancelled",
          command: pendingCommandRef.current.command,
          priority: pendingCommandRef.current.priority,
          reason,
        });
      }
      pendingCommandRef.current = null;
    },
    [traceScrollDecision],
  );

  const cleanupHandlersRef = React.useRef<{
    persistSession: (reason: string) => void;
    traceScrollDecision: (decision: Parameters<typeof traceScrollDecision>[0]) => void;
    cancelPendingCommand: (reason: string) => void;
  } | null>(null);

  React.useLayoutEffect(() => {
    cleanupHandlersRef.current = {
      persistSession,
      traceScrollDecision,
      cancelPendingCommand,
    };
  }, [cancelPendingCommand, persistSession, traceScrollDecision]);

  const isReadyForBottom = React.useCallback(() => {
    const outer = outerRef.current;
    if (!outer || outer.clientHeight <= 0 || viewportHeight <= 0) return false;
    if (isInitialLoading) return false;
    if (messages.length === 0) return hasLoaded;
    return itemCount > 0 && totalSize > 0 && virtualItemsCount > 0;
  }, [
    hasLoaded,
    isInitialLoading,
    itemCount,
    messages.length,
    outerRef,
    totalSize,
    viewportHeight,
    virtualItemsCount,
  ]);

  const isReadyForOffset = React.useCallback(() => {
    const outer = outerRef.current;
    return Boolean(
      outer &&
      outer.clientHeight > 0 &&
      viewportHeight > 0 &&
      !isInitialLoading &&
      itemCount > 0 &&
      totalSize > 0,
    );
  }, [isInitialLoading, itemCount, outerRef, totalSize, viewportHeight]);

  const getBottomTarget = React.useCallback(() => {
    const outer = outerRef.current;
    if (!outer) return 0;
    const contentHeight = Math.max(totalSize, outer.scrollHeight);
    return Math.max(0, Math.ceil(contentHeight - outer.clientHeight));
  }, [outerRef, totalSize]);

  const resolveBottomBehavior = React.useCallback(
    (command: CommandName): ConversationVirtualizerScrollBehavior => {
      const metrics = getMetrics();
      const distance = metrics.distanceToBottom ?? 0;
      if (
        command === "own_message_follow_bottom" ||
        command === "realtime_follow_if_near_bottom"
      ) {
        return distance <= SMOOTH_SCROLL_MAX_DISTANCE_PX ? "smooth" : "auto";
      }
      return "auto";
    },
    [getMetrics],
  );

  const finishBottom = React.useCallback(
    (command: PendingCommand, distanceToBottom: number) => {
      pendingCommandRef.current = null;
      commandRafRef.current = null;
      isPinnedRef.current = true;
      setIsPinnedToBottom(true);
      setPendingNewMessages(0);
      setFirstDetachedUnreadMessageId(null);
      setControllerMode("settled_at_bottom", command.event, command.reason);
      if (openingRef.current?.conversationId === conversationId) {
        openingRef.current.bottomApplied = true;
        openingRef.current.restoreApplied = false;
      }
      if (unreadRestoreSignature) {
        appliedUnreadSignatureRef.current = unreadRestoreSignature;
        onUnreadRestoreConsumed?.(unreadRestoreSignature);
      }
      traceScrollDecision({
        event: command.event,
        command: command.command,
        priority: command.priority,
        reason: "bottom_applied",
        extra: {
          bottom_apply_attempts: command.attempts + 1,
          finalDistanceToBottom: distanceToBottom,
        },
      });
      if (command.command === "conversation_open_latest_bottom") {
        measureChatPerformance(
          "open_to_bottom_applied",
          "conversation-open-start",
          conversationId,
          {
            messageCount: messages.length,
            attempts: command.attempts + 1,
            distanceToBottom,
          },
        );
      }
      if (
        command.command === "own_message_follow_bottom" ||
        command.command === "realtime_follow_if_near_bottom"
      ) {
        const startedAt = appendStartedAtRef.current;
        if (startedAt !== null) {
          logChatPerformance("append_to_bottom_latency", {
            conversationId,
            latencyMs: Math.max(0, performance.now() - startedAt),
            command: command.command,
          });
          appendStartedAtRef.current = null;
        }
      }
    },
    [
      conversationId,
      messages.length,
      onUnreadRestoreConsumed,
      setControllerMode,
      traceScrollDecision,
      unreadRestoreSignature,
    ],
  );

  const runCommand = React.useCallback(
    (command: PendingCommand) => {
      if (command.conversationId !== conversationId) {
        traceScrollDecision({
          event: command.event,
          command: command.command,
          priority: command.priority,
          reason: "command_skipped_stale_conversation",
        });
        return;
      }

      if (modeRef.current === "loading_older" && command.command !== "load_older_anchor_restore") {
        traceScrollDecision({
          event: command.event,
          command: command.command,
          priority: command.priority,
          reason: "command_skipped_loading_older",
        });
        return;
      }

      if (command.kind === "hold") {
        setControllerMode("settled_reading_history", command.event, command.reason);
        traceScrollDecision({
          event: command.event,
          command: command.command,
          priority: command.priority,
          reason: "hold_reading_history_applied",
        });
        return;
      }

      if (command.kind === "bottom") {
        if (!isReadyForBottom()) {
          if (command.attempts >= MAX_COMMAND_RAF_ATTEMPTS) {
            traceScrollDecision({
              event: command.event,
              command: command.command,
              priority: command.priority,
              reason: "bottom_skipped_not_ready",
              extra: {
                bottom_apply_attempts: command.attempts + 1,
                isInitialLoading,
                hasLoaded,
                itemCount,
                totalSize,
                viewportHeight,
                virtualItemsCount,
              },
            });
            return;
          }
          scheduleCommandRef.current?.({
            ...command,
            attempts: command.attempts + 1,
          });
          return;
        }

        if (messages.length === 0) {
          finishBottom(command, 0);
          return;
        }

        if (
          command.command === "conversation_open_latest_bottom" ||
          command.command === "unread_or_newer_tail_bottom"
        ) {
          const openingBottomCommandKey = [
            command.conversationId,
            command.command,
            latestKey,
            messages.length,
          ].join(":");
          if (lastOpeningBottomCommandKeyRef.current === openingBottomCommandKey) {
            traceScrollDecision({
              event: command.event,
              command: command.command,
              priority: command.priority,
              reason: "bottom_skipped_duplicate_opening_command",
            });
            return;
          }
          lastOpeningBottomCommandKeyRef.current = openingBottomCommandKey;
        }

        setControllerMode("scrolling_to_bottom", command.event, command.reason);
        const behavior = command.behavior ?? resolveBottomBehavior(command.command);
        scrollToOffset(getBottomTarget(), behavior);

        requestAnimationFrame(() => {
          const outer = outerRef.current;

          // DOM rect correction: virtualizer totalSize may be stale (estimated height)
          // when this RAF fires. The inner [data-message-id] div reflects actual content
          // height via getBoundingClientRect, so we can detect and correct any clipping
          // before deciding whether we've truly settled at the bottom.
          if (outer) {
            const allRows = outer.querySelectorAll<HTMLElement>('[data-message-id]');
            const lastRow = allRows[allRows.length - 1];
            if (lastRow) {
              const overflow =
                lastRow.getBoundingClientRect().bottom -
                (outer.getBoundingClientRect().bottom - BOTTOM_CLIPPING_BUFFER_PX);
              if (overflow > 1) {
                outer.scrollTop += overflow;
              }
            }
          }

          const metrics = getMetrics();
          if (
            metrics.distanceToBottom !== null &&
            metrics.distanceToBottom <= BOTTOM_SETTLE_DISTANCE_PX
          ) {
            finishBottom(command, metrics.distanceToBottom);
            return;
          }

          if (command.attempts >= MAX_COMMAND_RAF_ATTEMPTS) {
            traceScrollDecision({
              event: command.event,
              command: command.command,
              priority: command.priority,
              reason: "bottom_apply_failed",
              extra: {
                bottom_apply_attempts: command.attempts + 1,
                finalDistanceToBottom: metrics.distanceToBottom,
              },
            });
            return;
          }

          scheduleCommandRef.current?.({
            ...command,
            attempts: command.attempts + 1,
            behavior: "auto",
          });
        });
        return;
      }

      if (!isReadyForOffset()) {
        if (command.attempts >= MAX_COMMAND_RAF_ATTEMPTS) {
          traceScrollDecision({
            event: command.event,
            command: command.command,
            priority: command.priority,
            reason: "offset_skipped_not_ready",
            extra: {
              restore_apply_attempts: command.attempts + 1,
            },
          });
          return;
        }
        scheduleCommandRef.current?.({
          ...command,
          attempts: command.attempts + 1,
        });
        return;
      }

      let targetOffset = command.offset ?? 0;
      if (command.anchor) {
        const anchorIndex = resolveMessageIndex(command.anchor.messageId);
        if (anchorIndex >= 0) {
          targetOffset = getItemOffset(anchorIndex) + command.anchor.offsetFromTop;
        } else {
          const metrics = getMetrics();
          targetOffset =
            command.anchor.scrollTop +
            Math.max(0, metrics.scrollHeight - command.anchor.scrollHeight);
        }
      }

      scrollToOffset(Math.max(0, targetOffset), command.behavior ?? "auto");
      requestAnimationFrame(() => {
        if (command.command === "restore_history_position") {
          const session = scrollSessions.get(conversationId);
          if (session) {
            session.consumed = true;
          }
          openingRef.current = openingRef.current
            ? {
              ...openingRef.current,
              restoreApplied: true,
              bottomApplied: false,
            }
            : null;
          isPinnedRef.current = false;
          setIsPinnedToBottom(false);
          setControllerMode("settled_reading_history", command.event, command.reason);
        } else if (command.command === "load_older_anchor_restore") {
          setControllerMode(
            isPinnedRef.current ? "settled_at_bottom" : "settled_reading_history",
            command.event,
            command.reason,
          );
        }

        traceScrollDecision({
          event: command.event,
          command: command.command,
          priority: command.priority,
          reason:
            command.command === "load_older_anchor_restore"
              ? "anchor_restored"
              : "offset_applied",
          extra: {
            restore_apply_attempts: command.attempts + 1,
            targetOffset,
            anchorMessageId: command.anchor?.messageId ?? null,
          },
        });
        pendingCommandRef.current = null;
        commandRafRef.current = null;
      });
    },
    [
      conversationId,
      finishBottom,
      getBottomTarget,
      getItemOffset,
      getMetrics,
      hasLoaded,
      isInitialLoading,
      isReadyForBottom,
      isReadyForOffset,
      itemCount,
      latestKey,
      messages.length,
      outerRef,
      resolveBottomBehavior,
      resolveMessageIndex,
      scrollToOffset,
      setControllerMode,
      totalSize,
      traceScrollDecision,
      viewportHeight,
      virtualItemsCount,
    ],
  );

  const flushCommand = React.useCallback(() => {
    commandRafRef.current = null;
    const command = pendingCommandRef.current;
    pendingCommandRef.current = null;
    const runLatestCommand = runCommandRef.current;
    if (!command || !runLatestCommand) return;
    runLatestCommand(command);
  }, []);

  React.useLayoutEffect(() => {
    runCommandRef.current = runCommand;
    return () => {
      if (runCommandRef.current === runCommand) {
        runCommandRef.current = null;
      }
    };
  }, [runCommand]);

  const scheduleCommand = React.useCallback(
    (command: ScheduleCommandInput) => {
      const priority = command.priority ?? getCommandPriority(command.command);
      const nextCommand: PendingCommand = {
        ...command,
        priority,
        requestedAt: command.requestedAt ?? performance.now(),
      };
      const pending = pendingCommandRef.current;

      if (pending && pending.priority > nextCommand.priority) {
        traceScrollDecision({
          event: nextCommand.event,
          command: nextCommand.command,
          priority: nextCommand.priority,
          reason: "command_skipped_lower_priority",
          extra: {
            pendingCommand: pending.command,
            pendingPriority: pending.priority,
          },
        });
        return false;
      }

      if (pending && pending.priority <= nextCommand.priority) {
        traceScrollDecision({
          event: nextCommand.event,
          command: nextCommand.command,
          priority: nextCommand.priority,
          reason: "command_overrode_pending",
          extra: {
            overriddenCommand: pending.command,
            overriddenPriority: pending.priority,
          },
        });
      } else {
        traceScrollDecision({
          event: nextCommand.event,
          command: nextCommand.command,
          priority: nextCommand.priority,
          reason: "command_scheduled",
        });
      }

      pendingCommandRef.current = nextCommand;
      if (commandRafRef.current === null) {
        commandRafRef.current = requestAnimationFrame(flushCommand);
      }
      return true;
    },
    [flushCommand, traceScrollDecision],
  );

  React.useLayoutEffect(() => {
    scheduleCommandRef.current = scheduleCommand;
    return () => {
      if (scheduleCommandRef.current === scheduleCommand) {
        scheduleCommandRef.current = null;
      }
    };
  }, [scheduleCommand]);

  const scheduleBottom = React.useCallback(
    (
      command: CommandName,
      event: ChatScrollEvent,
      reason: string,
      behavior?: ConversationVirtualizerScrollBehavior,
    ) =>
      scheduleCommand({
        kind: "bottom",
        command,
        event,
        reason,
        behavior,
        conversationId,
        attempts: 0,
      }),
    [conversationId, scheduleCommand],
  );

  const scheduleOffset = React.useCallback(
    (
      offset: number,
      command: CommandName,
      event: ChatScrollEvent,
      reason: string,
      anchor?: ScrollAnchor | null,
    ) =>
      scheduleCommand({
        kind: "offset",
        command,
        event,
        reason,
        conversationId,
        offset,
        anchor,
        attempts: 0,
      }),
    [conversationId, scheduleCommand],
  );

  React.useEffect(() => {
    return () => {
      const cleanupHandlers = cleanupHandlersRef.current;
      if (!cleanupHandlers) return;
      if (hasUserScrollSinceOpenRef.current || isPinnedRef.current) {
        cleanupHandlers.persistSession("conversation-cleanup");
      } else {
        cleanupHandlers.traceScrollDecision({
          event: "CONVERSATION_CHANGED",
          command: null,
          priority: null,
          reason: "cleanup_skipped_consumed_restore_without_user_scroll",
        });
      }
      cleanupHandlers.cancelPendingCommand("conversation-cleanup");
    };
  }, [conversationId]);

  React.useEffect(() => {
    const previousSnapshot = previousSnapshotRef.current;
    const conversationChanged =
      !previousSnapshot || previousSnapshot.conversationId !== conversationId;
    if (!conversationChanged) return;

    cancelPendingCommand("conversation-changed");
    setPendingNewMessages(0);
    setFirstDetachedUnreadMessageId(null);
    setIsPinnedToBottom(true);
    isPinnedRef.current = true;
    hasUserScrollSinceOpenRef.current = false;
    appliedUnreadSignatureRef.current = null;
    firstRenderMeasuredRef.current = null;
    loadingOlderAnchorRef.current = null;
    lastOpeningBottomCommandKeyRef.current = null;

    // Product rule: always open at latest message — no scroll position restore on conversation enter
    openingRef.current = {
      conversationId,
      intent: "latest",
      baselineLatestKey: latestKey,
      restoreSession: null,
      bottomApplied: false,
      restoreApplied: false,
    };

    previousSnapshotRef.current = getSnapshot(conversationId, messages);
    setControllerMode(
      isInitialLoading ? "waiting_for_data" : "opening_conversation",
      "CONVERSATION_CHANGED",
      "conversation_open_start",
    );
    traceScrollDecision({
      event: "CONVERSATION_CHANGED",
      command: null,
      priority: null,
      reason: "conversation_open_start",
      previousLatestKey: previousSnapshot?.latestKey ?? null,
      openIntent: "latest",
      hasRestore: false,
      restoreValid: false,
    });
    logChatPerformance("open_to_first_render", {
      conversationId,
      messageCount: messages.length,
      virtualItemsCount,
    });
  }, [
    cancelPendingCommand,
    conversationId,
    hasUnread,
    isFetchingMessages,
    isInitialLoading,
    latestKey,
    messages,
    setControllerMode,
    traceScrollDecision,
    virtualItemsCount,
  ]);

  React.useEffect(() => {
    const opening = openingRef.current;
    if (!opening || opening.conversationId !== conversationId) return;
    if (opening.bottomApplied || opening.restoreApplied) return;

    if (isInitialLoading) {
      setControllerMode("waiting_for_data", "INITIAL_MESSAGES_READY", "initial_loading");
      return;
    }

    if (messages.length === 0 && hasLoaded) {
      setControllerMode("settled_at_bottom", "INITIAL_MESSAGES_READY", "empty_conversation");
      isPinnedRef.current = true;
      setIsPinnedToBottom(true);
      opening.bottomApplied = true;
      if (unreadRestoreSignature) {
        appliedUnreadSignatureRef.current = unreadRestoreSignature;
        onUnreadRestoreConsumed?.(unreadRestoreSignature);
      }
      return;
    }

    // Product rule: always go to latest — no restore on open
    if (!isReadyForBottom()) {
      setControllerMode(
        "waiting_for_measurement",
        "VIRTUALIZER_MEASURED",
        "waiting_for_virtualizer",
      );
      traceScrollDecision({
        event: "VIRTUALIZER_MEASURED",
        command: null,
        priority: null,
        reason: "command_waiting_for_measurement",
        openIntent: "latest",
      });
      return;
    }

    const command: CommandName = hasUnread
      ? "unread_or_newer_tail_bottom"
      : "conversation_open_latest_bottom";
    scheduleBottom(
      command,
      "INITIAL_MESSAGES_READY",
      hasUnread ? "unread_or_newer_tail_bottom" : "conversation_open_latest_bottom",
    );
  }, [
    conversationId,
    hasLoaded,
    hasUnread,
    isInitialLoading,
    isReadyForBottom,
    messages.length,
    onUnreadRestoreConsumed,
    scheduleBottom,
    setControllerMode,
    traceScrollDecision,
    unreadRestoreSignature,
  ]);

  React.useEffect(() => {
    if (
      !isInitialLoading &&
      messages.length > 0 &&
      viewportHeight > 0 &&
      itemCount > 0 &&
      virtualItemsCount > 0 &&
      firstRenderMeasuredRef.current !== conversationId
    ) {
      firstRenderMeasuredRef.current = conversationId;
      measureChatPerformance(
        "open_to_first_render",
        "conversation-open-start",
        conversationId,
        {
          messageCount: messages.length,
          itemCount,
          virtualItemsCount,
          viewportHeight,
        },
      );
      traceScrollDecision({
        event: "VIRTUALIZER_MEASURED",
        command: null,
        priority: null,
        reason: "virtualizer_measured",
      });
    }
  }, [
    conversationId,
    isInitialLoading,
    itemCount,
    messages.length,
    traceScrollDecision,
    viewportHeight,
    virtualItemsCount,
  ]);

  React.useEffect(() => {
    const previous = previousSnapshotRef.current;
    if (!previous || previous.conversationId !== conversationId) {
      previousSnapshotRef.current = getSnapshot(conversationId, messages);
      return;
    }

    const nextSnapshot = getSnapshot(conversationId, messages);
    if (
      previous.messageCount === nextSnapshot.messageCount &&
      previous.latestKey === nextSnapshot.latestKey &&
      previous.firstKey === nextSnapshot.firstKey
    ) {
      previousSnapshotRef.current = nextSnapshot;
      return;
    }

    traceScrollDecision({
      event: "latest_key_changed",
      command: null,
      priority: null,
      reason: "latestKey changed",
      previousLatestKey: previous.latestKey,
    });

    const prependedOlder = isOlderPrepend(previous.messages, messages);
    if (prependedOlder && loadingOlderAnchorRef.current) {
      scheduleOffset(
        loadingOlderAnchorRef.current.scrollTop,
        "load_older_anchor_restore",
        "LOAD_OLDER_COMMIT",
        "load_older_anchor_restore",
        loadingOlderAnchorRef.current,
      );
      loadingOlderAnchorRef.current = null;
      previousSnapshotRef.current = nextSnapshot;
      return;
    }

    const appendedMessages = getTailAppendMessages(previous.messages, messages);
    if (!appendedMessages || appendedMessages.length === 0) {
      previousSnapshotRef.current = nextSnapshot;
      return;
    }

    appendStartedAtRef.current = performance.now();
    const ownAppend = appendedMessages.some(
      (message) => message.senderId === currentUserId,
    );
    const opening = openingRef.current;
    const openingStillSettling = Boolean(
      opening &&
      opening.conversationId === conversationId &&
      !opening.bottomApplied &&
      !opening.restoreApplied,
    );
    const metrics = getMetrics();
    const nearBottom =
      metrics.distanceToBottom !== null &&
      metrics.distanceToBottom <= NEAR_BOTTOM_THRESHOLD_PX;

    if (ownAppend) {
      scheduleBottom(
        "own_message_follow_bottom",
        "OWN_MESSAGE_APPENDED",
        "own_message_follow_bottom",
        // behavior resolved by resolveBottomBehavior: smooth if distance <= 640px
      );
    } else if (openingStillSettling && opening?.intent !== "restore") {
      scheduleBottom(
        hasUnread ? "unread_or_newer_tail_bottom" : "conversation_open_latest_bottom",
        "RESTORE_INVALIDATED",
        "opening_tail_newer_bottom",
      );
    } else if (nearBottom || isPinnedRef.current) {
      setControllerMode("appending_new_message", "NEW_MESSAGE_APPENDED", "near_bottom_follow");
      scheduleBottom(
        "realtime_follow_if_near_bottom",
        "NEW_MESSAGE_APPENDED",
        "realtime_follow_if_near_bottom",
        // behavior resolved by resolveBottomBehavior: smooth if distance <= 640px
      );
    } else {
      isPinnedRef.current = false;
      setIsPinnedToBottom(false);
      setPendingNewMessages((current) => current + appendedMessages.length);
      setFirstDetachedUnreadMessageId((current) => {
        if (current) return current;
        return getMessageStableKey(appendedMessages[0]);
      });
      setControllerMode(
        "settled_reading_history",
        "NEW_MESSAGE_APPENDED",
        "hold_reading_history",
      );
      scheduleCommand({
        kind: "hold",
        command: "hold_reading_history",
        event: "NEW_MESSAGE_APPENDED",
        reason: "hold_reading_history",
        conversationId,
        attempts: 0,
      });
    }

    traceScrollDecision({
      event: ownAppend ? "OWN_MESSAGE_APPENDED" : "NEW_MESSAGE_APPENDED",
      command: ownAppend
        ? "own_message_follow_bottom"
        : nearBottom || isPinnedRef.current
          ? "realtime_follow_if_near_bottom"
          : "hold_reading_history",
      priority: ownAppend
        ? getCommandPriority("own_message_follow_bottom")
        : nearBottom || isPinnedRef.current
          ? getCommandPriority("realtime_follow_if_near_bottom")
          : getCommandPriority("hold_reading_history"),
      reason: "tail_append_classified",
      nearBottom,
      previousLatestKey: previous.latestKey,
      extra: {
        appendedCount: appendedMessages.length,
        ownAppend,
        openingStillSettling,
      },
    });

    previousSnapshotRef.current = nextSnapshot;
  }, [
    conversationId,
    currentUserId,
    getMetrics,
    hasUnread,
    messages,
    scheduleBottom,
    scheduleCommand,
    scheduleOffset,
    setControllerMode,
    traceScrollDecision,
  ]);

   const handleUserScroll = React.useCallback(
    () => {
      // Coalesce scroll events — only process one per animation frame
      if (scrollRafRef.current !== null) return;

      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;

        const outer = outerRef.current;
        if (!outer) return;

        const currentScrollTop = outer.scrollTop;
        hasUserScrollSinceOpenRef.current = true;

        // Mark user as actively scrolling. Any anchor-restore logic that runs
        // concurrently (ResizeObserver, measurement correction) must yield to
        // the user's intent. The flag is cleared after USER_SCROLL_IDLE_MS of
        // inactivity so that legitimate restores can still happen once the user
        // stops scrolling.
        userScrollingRef.current = true;
        if (userScrollIdleTimerRef.current !== null) {
          window.clearTimeout(userScrollIdleTimerRef.current);
        }
        userScrollIdleTimerRef.current = window.setTimeout(() => {
          userScrollingRef.current = false;
          userScrollIdleTimerRef.current = null;
        }, USER_SCROLL_IDLE_MS);
        const pinnedState = resolvePinnedToBottom(outer, NEAR_BOTTOM_THRESHOLD_PX, {
          previouslyPinnedToBottom: isPinnedRef.current,
        });
        isPinnedRef.current = pinnedState.isPinnedToBottom;
        setIsPinnedToBottom(pinnedState.isPinnedToBottom);
        setControllerMode(
          pinnedState.isPinnedToBottom ? "settled_at_bottom" : "settled_reading_history",
          "USER_SCROLL",
          "user_scroll",
        );
        if (pinnedState.isPinnedToBottom) {
          setPendingNewMessages(0);
          setFirstDetachedUnreadMessageId(null);
        }
        persistSession("user_scroll");
        traceScrollDecision({
          event: "USER_SCROLL",
          command: null,
          priority: null,
          reason: "user_scroll",
          nearBottom: pinnedState.isPinnedToBottom,
          extra: { scrollTop: currentScrollTop },
        });

        if (
          onLoadOlder &&
          hasMoreOlder &&
          !isLoadingOlder &&
          modeRef.current !== "loading_older" &&
          currentScrollTop < LOAD_MORE_TRIGGER_PX &&
          performance.now() - lastLoadOlderAtRef.current >= LOAD_OLDER_COOLDOWN_MS
        ) {
          lastLoadOlderAtRef.current = performance.now();
          const metrics = getMetrics();
          const anchor = captureVisibleAnchor();
          loadingOlderAnchorRef.current = anchor
            ? {
              ...anchor,
              scrollTop: metrics.scrollTop,
              scrollHeight: metrics.scrollHeight,
            }
            : {
              messageId: null,
              offsetFromTop: 0,
              scrollTop: metrics.scrollTop,
              scrollHeight: metrics.scrollHeight,
            };
          setControllerMode("loading_older", "LOAD_OLDER_START", "load_older_start");
          traceScrollDecision({
            event: "LOAD_OLDER_START",
            command: "load_older_anchor_restore",
            priority: getCommandPriority("load_older_anchor_restore"),
            reason: "anchor_captured",
            extra: {
              anchorMessageId: loadingOlderAnchorRef.current.messageId,
              anchorOffsetFromTop: loadingOlderAnchorRef.current.offsetFromTop,
            },
          });
          Promise.resolve(onLoadOlder()).catch(() => {
            loadingOlderAnchorRef.current = null;
            setControllerMode(
              isPinnedRef.current ? "settled_at_bottom" : "settled_reading_history",
              "LOAD_OLDER_COMMIT",
              "load_older_failed",
            );
          });
        }
      });
    },
    [
      captureVisibleAnchor,
      getMetrics,
      hasMoreOlder,
      isLoadingOlder,
      onLoadOlder,
      outerRef,
      persistSession,
      setControllerMode,
      traceScrollDecision,
    ],
  );

  const jumpToLatest = React.useCallback(() => {
    scheduleBottom(
      "own_message_follow_bottom",
      "USER_CLICK_NEW_MESSAGES",
      "user_click_new_messages",
      "smooth",
    );
  }, [scheduleBottom]);

  const requestOffset = React.useCallback(
    (
      offset: number,
      reason: string,
      event: ChatScrollEvent = "USER_SCROLL",
    ) =>
      scheduleOffset(
        offset,
        "restore_history_position",
        event,
        reason,
        null,
      ),
    [scheduleOffset],
  );

  const detachForJump = React.useCallback(
    (reason: string = "jump-to-message") => {
      hasUserScrollSinceOpenRef.current = true;
      isPinnedRef.current = false;
      setIsPinnedToBottom(false);
      setControllerMode("settled_reading_history", "USER_SCROLL", reason);
      persistSession(reason);
    },
    [persistSession, setControllerMode],
  );

  const handleMediaResized = React.useCallback((providedAnchor?: {
    messageId: string | null;
    offsetFromTop: number;
  } | null) => {
    // While the user is actively scrolling, any concurrent resize/measurement
    // must NOT restore the anchor. Doing so would fight user input and create
    // the "scroll stuck" loop with very tall messages. The idle timer in
    // handleUserScroll resets this flag after USER_SCROLL_IDLE_MS of inactivity.
    if (userScrollingRef.current) return;
    if (modeRef.current === "loading_older") return;
    if (isPinnedRef.current) {
      scheduleBottom(
        "realtime_follow_if_near_bottom",
        "MEDIA_RESIZED",
        "media_resize_follow_bottom",
      );
      return;
    }

    const anchor = providedAnchor ?? captureVisibleAnchor();
    if (!anchor) return;
    const metrics = getMetrics();
    scheduleOffset(
      metrics.scrollTop,
      "restore_history_position",
      "MEDIA_RESIZED",
      "media_resize_preserve_anchor",
      {
        ...anchor,
        scrollTop: metrics.scrollTop,
        scrollHeight: metrics.scrollHeight,
      },
    );
  }, [captureVisibleAnchor, getMetrics, scheduleBottom, scheduleOffset]);

  React.useEffect(
    () => () => {
      if (commandRafRef.current !== null) {
        cancelAnimationFrame(commandRafRef.current);
      }
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
      if (userScrollIdleTimerRef.current !== null) {
        window.clearTimeout(userScrollIdleTimerRef.current);
        userScrollIdleTimerRef.current = null;
      }
    },
    [],
  );

  return {
    mode,
    isPinnedToBottom,
    pendingNewMessages,
    firstDetachedUnreadMessageId,
    handleUserScroll,
    jumpToLatest,
    requestOffset,
    detachForJump,
    handleMediaResized,
  };
};

export default useChatScrollController;
