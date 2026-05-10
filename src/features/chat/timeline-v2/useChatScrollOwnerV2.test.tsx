import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useChatScrollOwnerV2 } from "./useChatScrollOwnerV2";
import type { ScrollVirtualizerAdapter } from "./virtualizerAdapter";
import { MessageStatus, MessageType, type Message } from "../../../types";

const ME = "me";
const THEM = "them";

const mkMsg = (id: string, senderId = THEM): Message =>
  ({
    id,
    conversationId: "c1",
    senderId,
    senderName: senderId,
    type: MessageType.TEXT,
    content: id,
    timestamp: new Date(),
    createdAt: new Date(),
    status: MessageStatus.SENT,
    isPinned: false,
    isEdited: false,
    isDeleted: false,
    isSystem: false,
  }) as Message;

interface MockAdapter extends ScrollVirtualizerAdapter {
  calls: {
    bottom: Array<"instant" | "smooth">;
    offset: Array<{ value: number; behavior: string }>;
    index: Array<{ index: number; align: string; behavior: string }>;
  };
  scrollEl: HTMLElement;
}

const createMockAdapter = (
  init: { distanceToBottom?: number; totalSize?: number } = {},
): MockAdapter => {
  const scrollEl = document.createElement("div");
  Object.defineProperty(scrollEl, "scrollHeight", { value: 1000, writable: true });
  Object.defineProperty(scrollEl, "clientHeight", { value: 500, writable: true });
  scrollEl.scrollTop = 1000 - 500 - (init.distanceToBottom ?? 0);

  const calls: MockAdapter["calls"] = { bottom: [], offset: [], index: [] };

  return {
    scrollEl,
    calls,
    getScrollElement: () => scrollEl,
    getTotalSize: () => init.totalSize ?? 1000,
    getItemOffset: (i) => i * 50,
    scrollToOffset: (value, behavior) => {
      calls.offset.push({ value, behavior });
    },
    scrollToBottom: (behavior) => {
      calls.bottom.push(behavior);
    },
    scrollToIndex: (index, align, behavior) => {
      calls.index.push({ index, align, behavior });
    },
  };
};

describe("useChatScrollOwnerV2 — initial bottom", () => {
  it("enqueues initial_bottom once after MESSAGES_READY + VIRTUALIZER_MEASURED", () => {
    const adapter = createMockAdapter({ distanceToBottom: 0 });
    const { result, rerender } = renderHook(
      ({ loading }: { loading: boolean }) =>
        useChatScrollOwnerV2({
          conversationId: "c1",
          currentUserId: ME,
          messages: [mkMsg("1")],
          isInitialLoading: loading,
          isFetchingOlder: false,
          hasOlder: false,
          adapter,
        }),
      { initialProps: { loading: true } },
    );

    // Still loading → no scroll.
    expect(adapter.calls.bottom).toHaveLength(0);

    // Loading flips to false → MESSAGES_READY dispatched.
    act(() => {
      rerender({ loading: false });
    });
    // We're in measuring_initial; need explicit VIRTUALIZER_MEASURED.
    act(() => {
      result.current.dispatch({ type: "VIRTUALIZER_MEASURED", at: Date.now() });
    });

    expect(adapter.calls.bottom).toEqual(["instant"]);
    expect(result.current.state).toBe("following_bottom");
    expect(result.current.isPinnedToBottom).toBe(true);
  });
});

describe("useChatScrollOwnerV2 — remote append while detached", () => {
  it("does NOT scroll and increments pendingNewMessages badge", () => {
    const adapter = createMockAdapter({ distanceToBottom: 400 });
    const { result, rerender } = renderHook(
      ({ messages }: { messages: Message[] }) =>
        useChatScrollOwnerV2({
          conversationId: "c1",
          currentUserId: ME,
          messages,
          isInitialLoading: false,
          isFetchingOlder: false,
          hasOlder: false,
          adapter,
        }),
      { initialProps: { messages: [mkMsg("1"), mkMsg("2")] } },
    );

    // Force detached state: simulate user scroll up.
    act(() => {
      result.current.dispatch({
        type: "USER_SCROLL",
        distanceToBottom: 400,
        at: 1,
      });
      result.current.dispatch({ type: "USER_SCROLL_IDLE", at: 2 });
    });
    expect(result.current.state).toBe("detached");

    // Append a remote message.
    act(() => {
      rerender({ messages: [mkMsg("1"), mkMsg("2"), mkMsg("3", THEM)] });
    });

    expect(adapter.calls.bottom).toHaveLength(0);
    expect(adapter.calls.offset).toHaveLength(0);
    expect(result.current.pendingNewMessages).toBe(1);
  });
});

describe("useChatScrollOwnerV2 — own message follows bottom even when detached", () => {
  it("enqueues own_message_sent and scrolls bottom", () => {
    const adapter = createMockAdapter({ distanceToBottom: 400 });
    const { result, rerender } = renderHook(
      ({ messages }: { messages: Message[] }) =>
        useChatScrollOwnerV2({
          conversationId: "c1",
          currentUserId: ME,
          messages,
          isInitialLoading: false,
          isFetchingOlder: false,
          hasOlder: false,
          adapter,
        }),
      { initialProps: { messages: [mkMsg("1")] } },
    );

    // Force detached.
    act(() => {
      result.current.dispatch({
        type: "USER_SCROLL",
        distanceToBottom: 400,
        at: 1,
      });
      result.current.dispatch({ type: "USER_SCROLL_IDLE", at: 2 });
    });
    expect(result.current.state).toBe("detached");

    // User sends.
    act(() => {
      rerender({ messages: [mkMsg("1"), mkMsg("2", ME)] });
    });

    expect(adapter.calls.bottom.length).toBeGreaterThan(0);
    expect(result.current.isPinnedToBottom).toBe(true);
  });
});

describe("useChatScrollOwnerV2 — load older preserves anchor", () => {
  it("captures anchor and on done enqueues preserve_after_prepend", () => {
    const adapter = createMockAdapter({ distanceToBottom: 200 });
    const loadOlder = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useChatScrollOwnerV2({
        conversationId: "c1",
        currentUserId: ME,
        messages: [mkMsg("a"), mkMsg("b")],
        isInitialLoading: false,
        isFetchingOlder: false,
        hasOlder: true,
        loadOlder,
        adapter,
      }),
    );

    act(() => {
      result.current.captureAnchor({
        messageKey: "a",
        index: 4,
        offsetFromViewportTop: 30,
      });
    });
    expect(loadOlder).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("loading_older");

    act(() => {
      result.current.notifyLoadOlderDone({
        prependedCount: 50,
        anchorStillExists: true,
      });
    });

    expect(adapter.calls.index).toEqual([
      expect.objectContaining({ index: 4 }),
    ]);
    expect(result.current.state).toBe("preserving_anchor");
  });

  it("does NOT scroll bottom when anchor was lost", () => {
    const adapter = createMockAdapter({ distanceToBottom: 200 });
    const loadOlder = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useChatScrollOwnerV2({
        conversationId: "c1",
        currentUserId: ME,
        messages: [mkMsg("a")],
        isInitialLoading: false,
        isFetchingOlder: false,
        hasOlder: true,
        loadOlder,
        adapter,
      }),
    );

    act(() => {
      result.current.captureAnchor({
        messageKey: "a",
        index: 4,
        offsetFromViewportTop: 30,
      });
    });
    act(() => {
      result.current.notifyLoadOlderDone({
        prependedCount: 50,
        anchorStillExists: false,
      });
    });

    expect(adapter.calls.bottom).toHaveLength(0);
    expect(adapter.calls.offset).toHaveLength(0);
    expect(adapter.calls.index).toHaveLength(0);
    expect(result.current.state).toBe("detached");
  });
});

describe("useChatScrollOwnerV2 — user scroll blocks low-priority commands", () => {
  it("rejects remote_message_following enqueued mid user scroll", () => {
    const adapter = createMockAdapter({ distanceToBottom: 5 });
    const { result, rerender } = renderHook(
      ({ messages }: { messages: Message[] }) =>
        useChatScrollOwnerV2({
          conversationId: "c1",
          currentUserId: ME,
          messages,
          isInitialLoading: false,
          isFetchingOlder: false,
          hasOlder: false,
          adapter,
        }),
      { initialProps: { messages: [mkMsg("1")] } },
    );

    // User starts scrolling (still near bottom physically).
    act(() => {
      result.current.dispatch({
        type: "USER_SCROLL",
        distanceToBottom: 5,
        at: 1,
      });
    });
    expect(result.current.isUserScrolling).toBe(true);

    // Remote append arrives.
    act(() => {
      rerender({ messages: [mkMsg("1"), mkMsg("2", THEM)] });
    });

    // Even though user_scrolling state's REMOTE handler enqueues nothing,
    // we additionally assert no bottom call happened.
    expect(adapter.calls.bottom).toHaveLength(0);
  });
});
