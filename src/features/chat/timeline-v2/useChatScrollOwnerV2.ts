/**
 * Timeline V2 — single scroll owner React hook.
 *
 * This hook is the ONLY component allowed to issue programmatic scroll
 * commands in V2. Components dispatch events into the hook; the state
 * machine + queue decide what (if anything) happens. ResizeObservers,
 * WebSocket handlers, optimistic-message reducers — all of them MUST go
 * through this hook.
 *
 * Phase 1 status: the hook is fully wired internally and unit-tested. It is
 * mounted by ChatTimelineV2 in passthrough mode (sibling to legacy
 * MessageList) so we can dogfood the state machine + queue under
 * VITE_CHAT_TIMELINE_V2_OWNER without ripping out legacy yet. Phase 2 will
 * swap MessageList over to dispatch events here and remove the legacy
 * controller.
 */

import React from "react";
import type { Message } from "../../../types";
import { classifyMessageChange } from "./messageChangeClassifier";
import { ScrollCommandQueue } from "./scrollCommandQueue";
import { debugScroll } from "./scrollDebug";
import {
  initialContext,
  initialState,
  resolvePinnedToBottom,
  transition,
  type CommandRequest,
  type MachineContext,
} from "./scrollStateMachine";
import {
  createNoopAdapter,
  type ScrollVirtualizerAdapter,
} from "./virtualizerAdapter";
import {
  LOAD_OLDER_COOLDOWN_MS,
  SMOOTH_SCROLL_MAX_DISTANCE_PX,
  USER_SCROLL_IDLE_MS,
  type ScrollCommand,
  type ScrollEvent,
  type ScrollState,
  type VisibleAnchor,
} from "./scrollTypes";

export interface ChatScrollOwnerParams {
  conversationId: string;
  currentUserId: string;
  messages: readonly Message[];
  isInitialLoading: boolean;
  hasOlder: boolean;
  isFetchingOlder: boolean;
  loadOlder?: () => void | Promise<void>;
  /** Optional adapter. When omitted, a no-op adapter is installed. */
  adapter?: ScrollVirtualizerAdapter;
  /** Now provider for tests. */
  now?: () => number;
}

export interface ChatScrollOwnerResult {
  state: ScrollState;
  pendingNewMessages: number;
  /** True while user wheel/touch input is recent. */
  isUserScrolling: boolean;
  /** True iff state machine considers user pinned at the tail. */
  isPinnedToBottom: boolean;
  /** Dispatch an event into the state machine. */
  dispatch: (event: ScrollEvent) => void;
  /** Convenience: request jump-to-latest (badge click). */
  jumpToLatest: () => void;
  /** Capture a visible anchor from the adapter (used before load older). */
  captureAnchor: (anchor: VisibleAnchor | null) => void;
  /** Notify the owner that load-older finished. */
  notifyLoadOlderDone: (info: {
    prependedCount: number;
    anchorStillExists: boolean;
  }) => void;
  /** Read-only snapshot of the machine context. Safe to call from effects. */
  getContext: () => MachineContext;
  /** Snapshot of the queue, for tests + debug overlay. */
  inspectQueue: () => {
    pending: ScrollCommand[];
    inFlight: ScrollCommand | null;
  };
}

const computeTtlMs = (distancePx: number): number => {
  const base = 320;
  return Math.max(320, Math.min(1200, base + Math.round(distancePx / 3)));
};

export function useChatScrollOwnerV2(
  params: ChatScrollOwnerParams,
): ChatScrollOwnerResult {
  const {
    conversationId,
    currentUserId,
    messages,
    isInitialLoading,
    isFetchingOlder,
    loadOlder,
    adapter: providedAdapter,
    now: providedNow,
  } = params;

  const adapter = React.useMemo(
    () => providedAdapter ?? createNoopAdapter(),
    [providedAdapter],
  );
  const nowFn = providedNow ?? Date.now;

  const [state, setState] = React.useState<ScrollState>(initialState);
  const stateRef = React.useRef<ScrollState>(initialState);
  const contextRef = React.useRef<MachineContext>(initialContext());
  const [pendingNewMessages, setPendingNewMessages] = React.useState(0);
  const [isUserScrolling, setIsUserScrolling] = React.useState(false);
  const [isPinnedToBottom, setIsPinnedToBottom] = React.useState(false);

  const previousMessagesRef = React.useRef<readonly Message[]>([]);
  const previousConvoRef = React.useRef<string | null>(null);
  const previousIsInitialLoadingRef = React.useRef<boolean>(true);
  const userScrollIdleTimerRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const programmaticScrollExpiryRef = React.useRef<number>(0);
  // Lazy-initialised once per hook instance. Using useState's lazy form keeps
  // the queue stable across renders without reading `ref.current` during
  // render, which strict react-hooks lint rules forbid.
  const [queue] = React.useState<ScrollCommandQueue>(
    () =>
      new ScrollCommandQueue({
        onAccept: (cmd) =>
          debugScroll("enqueue_command", {
            id: cmd.id,
            reason: cmd.reason,
            priority: cmd.priority,
          }),
        onReject: (reason, info) =>
          debugScroll("reject_command", { reason, ...info }),
        onExecute: (cmd) =>
          debugScroll("execute_command", { id: cmd.id, reason: cmd.reason }),
        onComplete: (cmd) =>
          debugScroll("programmatic_scroll_end", { id: cmd.id }),
      }),
  );

  const enqueueRequests = React.useCallback(
    (requests: CommandRequest[]) => {
      for (const req of requests) {
        const distance =
          req.target.kind === "offset"
            ? Math.abs(req.target.value)
            : req.target.kind === "bottom"
              ? adapter.getTotalSize()
              : 0;
        queue.enqueue(
          {
            reason: req.reason,
            target: req.target,
            behavior: req.behavior,
            sourceEvent: req.sourceEvent,
            ttlMs: computeTtlMs(distance),
          },
          {
            isUserScrolling: contextRef.current.isUserScrolling,
            state: stateRef.current,
            now: nowFn,
          },
        );
      }
    },
    [adapter, nowFn, queue],
  );

  const drainQueue = React.useCallback(() => {
    const cmd = queue.dequeue(nowFn());
    if (!cmd) return;
    const distance =
      cmd.target.kind === "offset"
        ? Math.abs(cmd.target.value)
        : cmd.target.kind === "bottom"
          ? adapter.getTotalSize()
          : 0;
    const ttl = computeTtlMs(distance);
    programmaticScrollExpiryRef.current = nowFn() + ttl;
    debugScroll("programmatic_scroll_start", {
      id: cmd.id,
      reason: cmd.reason,
      ttl,
    });

    const behavior = cmd.behavior;
    const useSmooth =
      behavior === "smooth" && distance <= SMOOTH_SCROLL_MAX_DISTANCE_PX;
    const effectiveBehavior = useSmooth ? "smooth" : "instant";

    switch (cmd.target.kind) {
      case "bottom":
        adapter.scrollToBottom(effectiveBehavior);
        break;
      case "offset":
        adapter.scrollToOffset(cmd.target.value, effectiveBehavior);
        break;
      case "index":
        adapter.scrollToIndex(
          cmd.target.index,
          cmd.target.align ?? "start",
          effectiveBehavior,
        );
        break;
    }
    queue.complete(cmd.id);
  }, [adapter, nowFn, queue]);

  const dispatch = React.useCallback(
    (event: ScrollEvent) => {
      const { next, context, effects } = transition(
        stateRef.current,
        contextRef.current,
        event,
      );
      const stateChanged = next !== stateRef.current;
      stateRef.current = next;
      contextRef.current = context;

      if (stateChanged) {
        debugScroll("state_transition", {
          from: stateRef.current,
          to: next,
          event: event.type,
        });
        setState(next);
      }
      setPendingNewMessages(context.pendingNewMessages);
      setIsUserScrolling(context.isUserScrolling);
      setIsPinnedToBottom(context.isPinnedToBottom);

      if (effects.enqueue.length > 0) enqueueRequests(effects.enqueue);
      // Drain after every dispatch — cheap, and ensures commands fire in the
      // same frame they were enqueued when nothing blocks them.
      drainQueue();
    },
    [drainQueue, enqueueRequests],
  );

  // Conversation lifecycle: detect convo changes vs message-array changes.
  React.useEffect(() => {
    if (previousConvoRef.current !== conversationId) {
      previousConvoRef.current = conversationId;
      previousMessagesRef.current = [];
      queue.reset();
      dispatch({
        type: "CONVERSATION_OPENED",
        conversationId,
        at: nowFn(),
      });
    }
  }, [conversationId, dispatch, nowFn, queue]);

  // Loading→loaded transition emits MESSAGES_READY exactly once.
  React.useEffect(() => {
    const wasLoading = previousIsInitialLoadingRef.current;
    previousIsInitialLoadingRef.current = isInitialLoading;
    if (wasLoading && !isInitialLoading) {
      dispatch({
        type: "MESSAGES_READY",
        messageCount: messages.length,
        at: nowFn(),
      });
    }
  }, [isInitialLoading, messages.length, dispatch, nowFn]);

  // Classify message-array transitions and dispatch the appropriate events.
  // We deliberately do NOT include `messages` in the dependency array because
  // RTK Query may produce shallow new arrays for the same content; instead
  // we compare via classifier and bail on `noop`.
  React.useEffect(() => {
    if (isInitialLoading) return;
    const prev = previousMessagesRef.current;
    const summary = classifyMessageChange(prev, messages, { currentUserId });
    if (summary.type === "noop") return;
    debugScroll("classify_message_change", {
      type: summary.type,
      appended: summary.appendedKeys.length,
      prepended: summary.prependedKeys.length,
      reconciled: summary.reconciledKeys.length,
    });
    previousMessagesRef.current = messages;

    switch (summary.type) {
      case "initial":
        // The MESSAGES_READY effect handled this.
        break;
      case "append_own":
        if (summary.appendedKeys.length > 0) {
          dispatch({
            type: "OWN_MESSAGE_SENT",
            messageKey: summary.appendedKeys[summary.appendedKeys.length - 1]!,
            at: nowFn(),
          });
          debugScroll("optimistic_append", {
            keys: summary.appendedKeys,
          });
        }
        break;
      case "append_remote": {
        // Distance must be re-read from the adapter at dispatch time so the
        // state machine's pin-state decision reflects current scroll.
        const el = adapter.getScrollElement();
        const distance = el
          ? Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight)
          : 0;
        // Update pinned state up front so the machine sees fresh truth.
        contextRef.current.isPinnedToBottom = resolvePinnedToBottom(
          distance,
          contextRef.current.isPinnedToBottom,
        );
        dispatch({
          type: "REMOTE_MESSAGE_APPENDED",
          messageKeys: summary.appendedKeys,
          distanceToBottom: distance,
          at: nowFn(),
        });
        debugScroll("websocket_append", {
          keys: summary.appendedKeys,
          distance,
        });
        break;
      }
      case "prepend_older":
        // Prepends are driven by LOAD_OLDER_DONE issued from notifyLoadOlderDone.
        break;
      case "reconcile_update":
        debugScroll("optimistic_reconcile", {
          keys: summary.reconciledKeys,
        });
        // No scroll on reconcile per spec section D.
        break;
      case "content_update":
      case "reorder":
        // Never scroll on these.
        break;
    }
  }, [adapter, currentUserId, dispatch, isInitialLoading, messages, nowFn]);

  const captureAnchor = React.useCallback(
    (anchor: VisibleAnchor | null) => {
      const ctx = contextRef.current;
      if (
        ctx.lastLoadOlderAt > 0 &&
        nowFn() - ctx.lastLoadOlderAt < LOAD_OLDER_COOLDOWN_MS
      ) {
        debugScroll("reject_command", {
          reason: "load_older_cooldown",
        });
        return;
      }
      if (isFetchingOlder) return;
      debugScroll("capture_anchor", { anchor });
      dispatch({ type: "LOAD_OLDER_START", anchor, at: nowFn() });
      void loadOlder?.();
    },
    [dispatch, isFetchingOlder, loadOlder, nowFn],
  );

  const notifyLoadOlderDone = React.useCallback(
    (info: { prependedCount: number; anchorStillExists: boolean }) => {
      debugScroll("restore_anchor", info);
      dispatch({
        type: "LOAD_OLDER_DONE",
        prependedCount: info.prependedCount,
        anchorStillExists: info.anchorStillExists,
        at: nowFn(),
      });
    },
    [dispatch, nowFn],
  );

  const jumpToLatest = React.useCallback(() => {
    debugScroll("new_message_badge_click", {});
    dispatch({ type: "JUMP_TO_LATEST", at: nowFn() });
  }, [dispatch, nowFn]);

  // User scroll idle timer: any USER_SCROLL dispatch sets isUserScrolling
  // true; a debounced timer fires USER_SCROLL_IDLE.
  React.useEffect(() => {
    if (!isUserScrolling) return;
    if (userScrollIdleTimerRef.current) {
      clearTimeout(userScrollIdleTimerRef.current);
    }
    userScrollIdleTimerRef.current = setTimeout(() => {
      dispatch({ type: "USER_SCROLL_IDLE", at: nowFn() });
    }, USER_SCROLL_IDLE_MS);
    return () => {
      if (userScrollIdleTimerRef.current) {
        clearTimeout(userScrollIdleTimerRef.current);
      }
    };
  }, [dispatch, isUserScrolling, nowFn]);

  // Cleanup on unmount.
  React.useEffect(() => {
    return () => {
      queue.reset();
      if (userScrollIdleTimerRef.current) {
        clearTimeout(userScrollIdleTimerRef.current);
      }
    };
  }, [queue]);

  return {
    state,
    pendingNewMessages,
    isUserScrolling,
    isPinnedToBottom,
    dispatch,
    jumpToLatest,
    captureAnchor,
    notifyLoadOlderDone,
    /**
     * Read-only snapshot of the machine context. A getter (not a property)
     * because reading `ref.current` during render is forbidden by
     * react-hooks lint rules; consumers call this from event handlers /
     * effects.
     */
    getContext: () => contextRef.current,
    inspectQueue: () => queue.snapshot(),
  };
}
