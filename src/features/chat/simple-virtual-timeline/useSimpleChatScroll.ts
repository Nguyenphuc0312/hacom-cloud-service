import React from "react";
import type { Message } from "../../../types";
import {
  classifySimpleMessageChange,
  type SimpleMessageChange,
} from "./simpleMessageChange";
import { logSimpleTimeline } from "./simpleTimelineDebug";

/**
 * Single owner for the simple timeline's scroll behavior.
 *
 * Rules (all enforced here — no other component is allowed to set scrollTop):
 *  1. Initial render of a conversation → scroll to bottom (once).
 *  2. Own message appended → scroll to bottom.
 *  3. Remote message appended while near-bottom → scroll to bottom.
 *  4. Remote message appended while detached → bump pendingNewMessages.
 *  5. Older messages prepended → preserve scrollTop via scrollHeight delta.
 *  6. Media settled while near-bottom (and user not actively scrolling) →
 *     keep bottom. Detached → no-op.
 *  7. jumpToLatest → scroll to bottom + clear badge.
 *  8. onScroll → only updates refs/state. Never re-pulls the user.
 *  9. Virtualizer totalSize grew after initial scroll → re-anchor to bottom.
 *     Called imperatively via notifyTotalSizeChanged() to avoid the circular
 *     dependency that would arise from passing totalSize as a prop (virtualizer
 *     needs scrollRef, scrollRef comes from this hook).
 *
 * Avoids: ResizeObserver-triggered scrolls, setTimeout chains, state
 * machines, priority queues, anchor reservoirs.
 */

const BOTTOM_THRESHOLD_PX = 96;
const USER_SCROLL_IDLE_MS = 180;
const LOAD_OLDER_THRESHOLD_PX = 160;

export interface UseSimpleChatScrollParams {
  conversationId: string;
  currentUserId: string;
  messages: readonly Message[];
  hasOlder: boolean;
  isInitialLoading: boolean;
  isFetchingOlder?: boolean;
  loadOlder?: () => void | Promise<void>;
  /** Fires when the user scrolls to within the near-bottom threshold. */
  onBottomVisible?: () => void;
  /** Test seam. */
  now?: () => number;
}

export interface UseSimpleChatScrollResult {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  isAtBottom: boolean;
  pendingNewMessages: number;
  isInitialSettled: boolean;
  handleScroll: () => void;
  handleMediaLoad: () => void;
  jumpToLatest: () => void;
  /**
   * Rule 9: called by the component when the virtualizer's totalSize changes.
   * Returns a cleanup function (cancel any pending RAF) — wire it as the
   * return value of a useLayoutEffect([totalSize]) in the component.
   *
   * Background: after Rule 1 scrolls to the estimated bottom, @tanstack/
   * react-virtual's ResizeObserver measures items and can expand totalSize
   * significantly (real heights > coarse estimates). Without this re-anchor,
   * the user lands somewhere in the middle of the conversation instead of at
   * the latest message.
   */
  notifyTotalSizeChanged: (totalSize: number) => () => void;
  /** Imperative hooks for tests. */
  __scrollToBottomForTest: () => void;
}

const getDistanceToBottom = (el: HTMLElement): number =>
  Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight);

const isNearBottom = (el: HTMLElement): boolean =>
  getDistanceToBottom(el) <= BOTTOM_THRESHOLD_PX;

const scrollElementToBottom = (
  el: HTMLElement,
  behavior: ScrollBehavior = "auto",
): void => {
  el.scrollTo({ top: el.scrollHeight, behavior });
};

export function useSimpleChatScroll(
  params: UseSimpleChatScrollParams,
): UseSimpleChatScrollResult {
  const {
    conversationId,
    currentUserId,
    messages,
    hasOlder,
    isInitialLoading,
    isFetchingOlder,
    loadOlder,
    onBottomVisible,
  } = params;

  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  // Mutable refs (avoid re-renders for high-frequency updates).
  const wasAtBottomRef = React.useRef(true);
  const userScrollingRef = React.useRef(false);
  const userScrollIdleTimerRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const initialSettledConversationRef = React.useRef<string | null>(null);
  const prevMessagesRef = React.useRef<readonly Message[]>([]);
  const isLoadingOlderRef = React.useRef(false);
  const pendingPrependRestoreRef = React.useRef<{
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  // Mirrors isInitialSettled state so Rule 9's stable callback can read it
  // without capturing a stale closure.
  const isInitialSettledRef = React.useRef(false);

  const [isAtBottom, setIsAtBottom] = React.useState(true);
  const [pendingNewMessages, setPendingNewMessages] = React.useState(0);
  const [isInitialSettled, setIsInitialSettled] = React.useState(false);

  // Reset state when the conversation changes. We keep this in a layout
  // effect so that the next render's scroll logic sees a clean slate
  // BEFORE it tries to react to "messages length changed".
  React.useLayoutEffect(() => {
    initialSettledConversationRef.current = null;
    isInitialSettledRef.current = false;
    prevMessagesRef.current = [];
    pendingPrependRestoreRef.current = null;
    isLoadingOlderRef.current = false;
    wasAtBottomRef.current = true;
    userScrollingRef.current = false;
    setIsAtBottom(true);
    setPendingNewMessages(0);
    setIsInitialSettled(false);
  }, [conversationId]);

  // Rule 1: initial bottom (once per conversation).
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (isInitialLoading) return;
    if (messages.length === 0) return;
    if (initialSettledConversationRef.current === conversationId) return;

    // Intentionally NOT setting initialSettledConversationRef here.
    // If a WebSocket message arrives before this RAF fires, cleanup cancels
    // the RAF. Keeping the ref unset lets Rule 1 retry on the next render
    // instead of being permanently blocked by a stale guard.
    const raf = requestAnimationFrame(() => {
      initialSettledConversationRef.current = conversationId;
      isInitialSettledRef.current = true;
      scrollElementToBottom(el, "auto");
      wasAtBottomRef.current = true;
      setIsAtBottom(true);
      setPendingNewMessages(0);
      setIsInitialSettled(true);
      logSimpleTimeline("initial_bottom", {
        conversationId,
        messageCount: messages.length,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [conversationId, isInitialLoading, messages.length]);

  // Rules 2–4 + 5 restore: react to message-array changes via classifier.
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!isInitialSettled) {
      // Initial bottom effect will handle the first run.
      prevMessagesRef.current = messages;
      return;
    }

    // Pending prepend restore takes precedence over classification, because
    // load-older both prepends items AND changes messages.length.
    const restore = pendingPrependRestoreRef.current;
    if (restore) {
      const raf = requestAnimationFrame(() => {
        const delta = el.scrollHeight - restore.scrollHeight;
        el.scrollTop = restore.scrollTop + delta;
        pendingPrependRestoreRef.current = null;
        isLoadingOlderRef.current = false;
        logSimpleTimeline("load_older_restore_delta", {
          delta,
          newScrollTop: el.scrollTop,
        });
      });
      prevMessagesRef.current = messages;
      return () => cancelAnimationFrame(raf);
    }

    const prev = prevMessagesRef.current;
    const change: SimpleMessageChange = classifySimpleMessageChange(
      prev,
      messages,
      currentUserId,
    );

    if (change.type === "append") {
      if (change.ownMessage) {
        const raf = requestAnimationFrame(() => {
          scrollElementToBottom(el, "auto");
          wasAtBottomRef.current = true;
          setIsAtBottom(true);
          setPendingNewMessages(0);
        });
        logSimpleTimeline("append_own_scroll_bottom", {
          appended: change.appended.length,
        });
        prevMessagesRef.current = messages;
        return () => cancelAnimationFrame(raf);
      }
      if (wasAtBottomRef.current && !userScrollingRef.current) {
        const raf = requestAnimationFrame(() => {
          scrollElementToBottom(el, "auto");
          setIsAtBottom(true);
          setPendingNewMessages(0);
        });
        logSimpleTimeline("append_remote_scroll_bottom", {
          appended: change.appended.length,
        });
        prevMessagesRef.current = messages;
        return () => cancelAnimationFrame(raf);
      }
      if (change.remoteCount > 0) {
        setPendingNewMessages((n) => n + change.remoteCount);
        logSimpleTimeline("append_remote_badge", {
          remoteCount: change.remoteCount,
        });
      }
    }
    // prepend, update, noop, initial → never scroll here.
    prevMessagesRef.current = messages;
    return;
  }, [messages, currentUserId, isInitialSettled]);

  const handleScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const atBottom = isNearBottom(el);
    const wasAtBottom = wasAtBottomRef.current;
    if (wasAtBottom !== atBottom) {
      wasAtBottomRef.current = atBottom;
      setIsAtBottom(atBottom);
      // Bottom sentinel — fire callback when user reaches the bottom.
      // This enables auto mark-read when the user scrolls to the latest message.
      if (atBottom && !wasAtBottom && typeof onBottomVisible === "function") {
        onBottomVisible();
      }
    }
    if (atBottom) {
      setPendingNewMessages((n) => (n === 0 ? n : 0));
    }

    userScrollingRef.current = true;
    if (userScrollIdleTimerRef.current) {
      clearTimeout(userScrollIdleTimerRef.current);
    }
    userScrollIdleTimerRef.current = setTimeout(() => {
      userScrollingRef.current = false;
      userScrollIdleTimerRef.current = null;
    }, USER_SCROLL_IDLE_MS);

    if (
      hasOlder &&
      !isLoadingOlderRef.current &&
      !isFetchingOlder &&
      el.scrollTop <= LOAD_OLDER_THRESHOLD_PX
    ) {
      isLoadingOlderRef.current = true;
      pendingPrependRestoreRef.current = {
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
      };
      logSimpleTimeline("load_older_start", {
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
      });
      logSimpleTimeline("user_scroll", { scrollTop: el.scrollTop });
      void Promise.resolve(loadOlder?.()).catch(() => {
        // If load-older fails, clear our pending restore so the next render
        // doesn't try to apply a stale delta against unchanged content.
        pendingPrependRestoreRef.current = null;
        isLoadingOlderRef.current = false;
      });
    } else {
      logSimpleTimeline("user_scroll", { scrollTop: el.scrollTop });
    }
  }, [hasOlder, isFetchingOlder, loadOlder, onBottomVisible]);

  // Rule 6: media settled.
  const handleMediaLoad = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!wasAtBottomRef.current || userScrollingRef.current) {
      logSimpleTimeline("media_load_detached_noop", {});
      return;
    }
    const raf = requestAnimationFrame(() => {
      scrollElementToBottom(el, "auto");
    });
    logSimpleTimeline("media_load_keep_bottom", {});
    // raf is intentionally not cancelled — media handlers are sparse.
    void raf;
  }, []);

  // Rule 7: jumpToLatest.
  const jumpToLatest = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    scrollElementToBottom(el, "smooth");
    wasAtBottomRef.current = true;
    setIsAtBottom(true);
    setPendingNewMessages(0);
    logSimpleTimeline("jump_to_latest", {});
  }, []);

  // Rule 9: re-anchor to bottom when virtualizer measurements grow totalSize.
  //
  // After Rule 1 fires scrollToBottom, @tanstack/react-virtual's ResizeObserver
  // measures actual item heights asynchronously (after paint). Real heights are
  // often larger than the coarse estimates (`56 + items * 56`), so totalSize
  // grows and scrollHeight increases. The raw scrollTop set in the RAF ends up
  // somewhere in the middle of the conversation — the user sees old messages.
  //
  // Called imperatively by the component via useLayoutEffect([totalSize]) to
  // avoid the circular dependency that would arise if totalSize were passed as a
  // prop (virtualizer.getScrollElement needs scrollRef from this hook).
  //
  // Guards:
  //   • isInitialSettledRef — prevents firing before Rule 1 completes.
  //   • wasAtBottomRef      — respects the user having scrolled away.
  //   • userScrollingRef    — prevents fighting an active user scroll.
  //   • distanceToBottom    — skips the RAF if we're already at the bottom.
  const notifyTotalSizeChanged = React.useCallback(
    (totalSize: number): (() => void) => {
      if (!isInitialSettledRef.current) return () => undefined;
      if (!wasAtBottomRef.current) return () => undefined;
      if (userScrollingRef.current) return () => undefined;
      const el = scrollRef.current;
      if (!el) return () => undefined;
      const distanceToBottom = getDistanceToBottom(el);
      if (distanceToBottom <= BOTTOM_THRESHOLD_PX) return () => undefined;
      const raf = requestAnimationFrame(() => {
        if (!wasAtBottomRef.current || userScrollingRef.current) return;
        const elNow = scrollRef.current;
        if (!elNow) return;
        if (getDistanceToBottom(elNow) <= BOTTOM_THRESHOLD_PX) return;
        scrollElementToBottom(elNow, "auto");
        logSimpleTimeline("measurement_grow_recorrect_bottom", {
          totalSize,
          distanceToBottom,
        });
      });
      return () => cancelAnimationFrame(raf);
    },
    [], // stable — uses only mutable refs
  );

  // Cleanup.
  React.useEffect(() => {
    return () => {
      if (userScrollIdleTimerRef.current) {
        clearTimeout(userScrollIdleTimerRef.current);
      }
    };
  }, []);

  return {
    scrollRef,
    isAtBottom,
    pendingNewMessages,
    isInitialSettled,
    handleScroll,
    handleMediaLoad,
    jumpToLatest,
    notifyTotalSizeChanged,
    __scrollToBottomForTest: () => {
      const el = scrollRef.current;
      if (el) scrollElementToBottom(el);
    },
  };
}
