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

  const [isAtBottom, setIsAtBottom] = React.useState(true);
  const [pendingNewMessages, setPendingNewMessages] = React.useState(0);
  const [isInitialSettled, setIsInitialSettled] = React.useState(false);

  // Reset state when the conversation changes. We keep this in a layout
  // effect so that the next render's scroll logic sees a clean slate
  // BEFORE it tries to react to "messages length changed".
  React.useLayoutEffect(() => {
    initialSettledConversationRef.current = null;
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

    initialSettledConversationRef.current = conversationId;

    const raf = requestAnimationFrame(() => {
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

  // Rule 8: onScroll just observes — never writes back.
  const handleScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const atBottom = isNearBottom(el);
    if (wasAtBottomRef.current !== atBottom) {
      wasAtBottomRef.current = atBottom;
      setIsAtBottom(atBottom);
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
  }, [hasOlder, isFetchingOlder, loadOlder]);

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
    __scrollToBottomForTest: () => {
      const el = scrollRef.current;
      if (el) scrollElementToBottom(el);
    },
  };
}
