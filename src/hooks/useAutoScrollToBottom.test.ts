import * as React from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetConversationScrollSessionsForTest,
  useAutoScrollToBottom,
} from "./useAutoScrollToBottom";
import { MessageStatus, MessageType } from "../types";

const makeMessage = (
  id: string,
  createdAt: string,
  senderId: string = "user-a",
) => ({
  id,
  conversationId: "room-1",
  senderId,
  senderName: "Alice",
  content: id,
  type: MessageType.TEXT,
  status: MessageStatus.SENT,
  isEdited: false,
  isPinned: false,
  isDeleted: false,
  isSystem: false,
  createdAt: new Date(createdAt),
  updatedAt: new Date(createdAt),
});

describe("useAutoScrollToBottom", () => {
  beforeEach(() => {
    __resetConversationScrollSessionsForTest();
  });

  it("restores the previous reading anchor when re-entering without newer messages", () => {
    const outerRef = {
      current: {
        scrollTop: 180,
        scrollHeight: 1200,
        clientHeight: 400,
      },
    } as React.RefObject<HTMLDivElement | null>;
    const requestScrollToBottom = vi.fn();
    const captureScrollAnchor = vi.fn(() => ({
      messageId: "msg-2",
      offsetFromTop: 24,
    }));

    const { result, rerender } = renderHook(
      ({
        conversationId,
        preferUnreadAnchor = false,
      }: {
        conversationId: string;
        preferUnreadAnchor?: boolean;
      }) =>
        useAutoScrollToBottom({
          conversationId,
          messages: [
            makeMessage("msg-1", "2026-04-10T10:00:00.000Z"),
            makeMessage("msg-2", "2026-04-10T10:01:00.000Z"),
          ],
          currentUserId: "user-a",
          preferUnreadAnchor,
          hasMore: false,
          isLoadingMore: false,
          outerRef,
          requestScrollToBottom,
          captureScrollAnchor,
        }),
      {
        initialProps: {
          conversationId: "room-1",
          preferUnreadAnchor: false,
        },
      },
    );

    act(() => {
      result.current.detachAutoFollow("reading-history");
    });

    rerender({ conversationId: "room-2", preferUnreadAnchor: false });
    rerender({ conversationId: "room-1", preferUnreadAnchor: false });

    expect(result.current.pendingRestoreAnchor).toEqual({
      messageId: "msg-2",
      offsetFromTop: 24,
    });
    expect(result.current.pendingRestoreScrollTop).toBeNull();
    expect(result.current.isPinnedToBottom).toBe(false);
    expect(result.current.scrollMode).toBe("reading_history");
    expect(requestScrollToBottom).toHaveBeenCalled();
  });

  it("does not restore reading position when unread restore is requested", () => {
    const outerRef = {
      current: {
        scrollTop: 220,
        scrollHeight: 1200,
        clientHeight: 400,
      },
    } as React.RefObject<HTMLDivElement | null>;
    const requestScrollToBottom = vi.fn();
    const captureScrollAnchor = vi.fn(() => ({
      messageId: "msg-2",
      offsetFromTop: 12,
    }));

    const { result, rerender } = renderHook(
      ({
        conversationId,
        preferUnreadAnchor = false,
      }: {
        conversationId: string;
        preferUnreadAnchor?: boolean;
      }) =>
        useAutoScrollToBottom({
          conversationId,
          messages: [
            makeMessage("msg-1", "2026-04-10T10:00:00.000Z"),
            makeMessage("msg-2", "2026-04-10T10:01:00.000Z"),
          ],
          currentUserId: "user-a",
          preferUnreadAnchor,
          hasMore: false,
          isLoadingMore: false,
          outerRef,
          requestScrollToBottom,
          captureScrollAnchor,
        }),
      {
        initialProps: {
          conversationId: "room-1",
          preferUnreadAnchor: false,
        },
      },
    );

    act(() => {
      result.current.detachAutoFollow("reading-history");
    });

    rerender({ conversationId: "room-2", preferUnreadAnchor: false });
    rerender({ conversationId: "room-1", preferUnreadAnchor: true });

    expect(result.current.pendingRestoreAnchor).toBeNull();
    expect(result.current.pendingRestoreScrollTop).toBeNull();
    expect(result.current.isPinnedToBottom).toBe(true);
    expect(result.current.scrollMode).toBe("at_bottom");
    expect(requestScrollToBottom).toHaveBeenLastCalledWith("conversation-change");
  });

  it("does not restore a stale reading session after newer messages arrive off-screen", () => {
    const outerRef = {
      current: {
        scrollTop: 220,
        scrollHeight: 1200,
        clientHeight: 400,
      },
    } as React.RefObject<HTMLDivElement | null>;
    const requestScrollToBottom = vi.fn();
    const captureScrollAnchor = vi.fn(() => ({
      messageId: "msg-2",
      offsetFromTop: 12,
    }));

    const { result, rerender } = renderHook(
      ({
        conversationId,
        messages,
      }: {
        conversationId: string;
        messages: ReturnType<typeof makeMessage>[];
      }) =>
        useAutoScrollToBottom({
          conversationId,
          messages,
          currentUserId: "user-a",
          preferUnreadAnchor: false,
          hasMore: false,
          isLoadingMore: false,
          outerRef,
          requestScrollToBottom,
          captureScrollAnchor,
        }),
      {
        initialProps: {
          conversationId: "room-1",
          messages: [
            makeMessage("msg-1", "2026-04-10T10:00:00.000Z"),
            makeMessage("msg-2", "2026-04-10T10:01:00.000Z"),
          ],
        },
      },
    );

    act(() => {
      result.current.detachAutoFollow("reading-history");
    });

    rerender({
      conversationId: "room-2",
      messages: [
        makeMessage("room-2-msg-1", "2026-04-10T10:00:00.000Z"),
      ],
    });
    rerender({
      conversationId: "room-1",
      messages: [
        makeMessage("msg-1", "2026-04-10T10:00:00.000Z"),
        makeMessage("msg-2", "2026-04-10T10:01:00.000Z"),
        makeMessage("msg-3", "2026-04-10T10:02:00.000Z", "user-b"),
      ],
    });

    expect(result.current.pendingRestoreAnchor).toBeNull();
    expect(result.current.pendingRestoreScrollTop).toBeNull();
    expect(result.current.isPinnedToBottom).toBe(true);
    expect(result.current.scrollMode).toBe("at_bottom");
    expect(requestScrollToBottom).toHaveBeenCalled();
  });

  it("invalidates a pending restored session when newer tail messages arrive before restore settles", () => {
    const outerRef = {
      current: {
        scrollTop: 220,
        scrollHeight: 1200,
        clientHeight: 400,
      },
    } as React.RefObject<HTMLDivElement | null>;
    const requestScrollToBottom = vi.fn();
    const captureScrollAnchor = vi.fn(() => ({
      messageId: "msg-2",
      offsetFromTop: 12,
    }));

    const initialMessages = [
      makeMessage("msg-1", "2026-04-10T10:00:00.000Z"),
      makeMessage("msg-2", "2026-04-10T10:01:00.000Z"),
    ];

    const { result, rerender } = renderHook(
      ({
        conversationId,
        messages,
      }: {
        conversationId: string;
        messages: ReturnType<typeof makeMessage>[];
      }) =>
        useAutoScrollToBottom({
          conversationId,
          messages,
          currentUserId: "user-a",
          preferUnreadAnchor: false,
          hasMore: false,
          isLoadingMore: false,
          outerRef,
          requestScrollToBottom,
          captureScrollAnchor,
        }),
      {
        initialProps: {
          conversationId: "room-1",
          messages: initialMessages,
        },
      },
    );

    act(() => {
      result.current.detachAutoFollow("reading-history");
    });

    rerender({
      conversationId: "room-2",
      messages: [
        makeMessage("room-2-msg-1", "2026-04-10T10:00:00.000Z"),
      ],
    });
    rerender({
      conversationId: "room-1",
      messages: initialMessages,
    });

    expect(result.current.pendingRestoreAnchor).toEqual({
      messageId: "msg-2",
      offsetFromTop: 12,
    });

    rerender({
      conversationId: "room-1",
      messages: [
        ...initialMessages,
        makeMessage("msg-3", "2026-04-10T10:02:00.000Z", "user-b"),
      ],
    });

    expect(result.current.pendingRestoreAnchor).toBeNull();
    expect(result.current.pendingNewMessages).toBe(0);
    expect(result.current.isPinnedToBottom).toBe(true);
    expect(requestScrollToBottom).toHaveBeenLastCalledWith(
      "conversation-change-newer-messages",
    );
  });

  it("invalidates an applied restored session when an in-flight refresh returns newer tail messages", () => {
    const outerRef = {
      current: {
        scrollTop: 220,
        scrollHeight: 1200,
        clientHeight: 400,
      },
    } as React.RefObject<HTMLDivElement | null>;
    const requestScrollToBottom = vi.fn();
    const captureScrollAnchor = vi.fn(() => ({
      messageId: "msg-2",
      offsetFromTop: 12,
    }));

    const initialMessages = [
      makeMessage("msg-1", "2026-04-10T10:00:00.000Z"),
      makeMessage("msg-2", "2026-04-10T10:01:00.000Z"),
    ];

    const { result, rerender } = renderHook(
      ({
        conversationId,
        messages,
        isRefreshingMessages = false,
      }: {
        conversationId: string;
        messages: ReturnType<typeof makeMessage>[];
        isRefreshingMessages?: boolean;
      }) =>
        useAutoScrollToBottom({
          conversationId,
          messages,
          currentUserId: "user-a",
          preferUnreadAnchor: false,
          hasMore: false,
          isLoadingMore: false,
          isRefreshingMessages,
          outerRef,
          requestScrollToBottom,
          captureScrollAnchor,
        }),
      {
        initialProps: {
          conversationId: "room-1",
          messages: initialMessages,
          isRefreshingMessages: false,
        },
      },
    );

    act(() => {
      result.current.detachAutoFollow("reading-history");
    });

    rerender({
      conversationId: "room-2",
      messages: [makeMessage("room-2-msg-1", "2026-04-10T10:00:00.000Z")],
      isRefreshingMessages: false,
    });
    rerender({
      conversationId: "room-1",
      messages: initialMessages,
      isRefreshingMessages: true,
    });

    expect(result.current.pendingRestoreAnchor).toEqual({
      messageId: "msg-2",
      offsetFromTop: 12,
    });

    act(() => {
      result.current.clearPendingRestore("conversation-restore-anchor-applied");
    });

    rerender({
      conversationId: "room-1",
      messages: [
        ...initialMessages,
        makeMessage("msg-3", "2026-04-10T10:02:00.000Z", "user-b"),
      ],
      isRefreshingMessages: false,
    });

    expect(result.current.pendingRestoreAnchor).toBeNull();
    expect(result.current.pendingNewMessages).toBe(0);
    expect(result.current.isPinnedToBottom).toBe(true);
    expect(requestScrollToBottom).toHaveBeenLastCalledWith(
      "conversation-change-newer-messages",
    );
  });

  it("buffers remote incoming messages without changing follow mode while reading history", () => {
    const outerRef = {
      current: {
        scrollTop: 220,
        scrollHeight: 1200,
        clientHeight: 400,
      },
    } as React.RefObject<HTMLDivElement | null>;
    const requestScrollToBottom = vi.fn();

    const { result, rerender } = renderHook(
      ({ messages }: { messages: ReturnType<typeof makeMessage>[] }) =>
        useAutoScrollToBottom({
          conversationId: "room-1",
          messages,
          currentUserId: "user-a",
          hasMore: false,
          isLoadingMore: false,
          outerRef,
          requestScrollToBottom,
        }),
      {
        initialProps: {
          messages: [
            makeMessage("msg-1", "2026-04-10T10:00:00.000Z"),
            makeMessage("msg-2", "2026-04-10T10:01:00.000Z"),
          ],
        },
      },
    );

    act(() => {
      result.current.detachAutoFollow("reading-history");
    });

    rerender({
      messages: [
        makeMessage("msg-1", "2026-04-10T10:00:00.000Z"),
        makeMessage("msg-2", "2026-04-10T10:01:00.000Z"),
        makeMessage("msg-3", "2026-04-10T10:02:00.000Z", "user-b"),
      ],
    });

    expect(result.current.scrollMode).toBe("reading_history");
    expect(result.current.pendingNewMessages).toBe(1);
    expect(result.current.isPinnedToBottom).toBe(false);
    expect(requestScrollToBottom).toHaveBeenCalledTimes(1);
    expect(requestScrollToBottom).toHaveBeenCalledWith("conversation-change");
  });

  it("reattaches and follows when the detached user sends their own message", () => {
    const outerRef = {
      current: {
        scrollTop: 240,
        scrollHeight: 1200,
        clientHeight: 400,
      },
    } as React.RefObject<HTMLDivElement | null>;
    const requestScrollToBottom = vi.fn();

    const { result, rerender } = renderHook(
      ({ messages }: { messages: ReturnType<typeof makeMessage>[] }) =>
        useAutoScrollToBottom({
          conversationId: "room-1",
          messages,
          currentUserId: "user-a",
          hasMore: false,
          isLoadingMore: false,
          outerRef,
          requestScrollToBottom,
        }),
      {
        initialProps: {
          messages: [
            makeMessage("msg-1", "2026-04-10T10:00:00.000Z", "user-b"),
            makeMessage("msg-2", "2026-04-10T10:01:00.000Z", "user-b"),
          ],
        },
      },
    );

    act(() => {
      result.current.detachAutoFollow("reading-history");
    });

    rerender({
      messages: [
        makeMessage("msg-1", "2026-04-10T10:00:00.000Z", "user-b"),
        makeMessage("msg-2", "2026-04-10T10:01:00.000Z", "user-b"),
        makeMessage("msg-3", "2026-04-10T10:02:00.000Z", "user-a"),
      ],
    });

    expect(result.current.scrollMode).toBe("sending_own_message");
    expect(result.current.pendingNewMessages).toBe(0);
    expect(result.current.isPinnedToBottom).toBe(true);
    expect(requestScrollToBottom).toHaveBeenCalledWith("self-message");
  });

  it("jumpToLatest reattaches and requests a bottom scroll from the live DOM position", () => {
    const outerRef = {
      current: {
        scrollTop: 320,
        scrollHeight: 1800,
        clientHeight: 420,
      },
    } as React.RefObject<HTMLDivElement | null>;
    const requestScrollToBottom = vi.fn();

    const { result } = renderHook(() =>
      useAutoScrollToBottom({
        conversationId: "room-1",
        messages: [
          makeMessage("msg-1", "2026-04-10T10:00:00.000Z"),
          makeMessage("msg-2", "2026-04-10T10:01:00.000Z"),
        ],
        currentUserId: "user-a",
        hasMore: false,
        isLoadingMore: false,
        outerRef,
        requestScrollToBottom,
      }),
    );

    act(() => {
      result.current.detachAutoFollow("reading-history");
      result.current.jumpToLatest();
    });

    expect(result.current.isPinnedToBottom).toBe(true);
    expect(result.current.pendingNewMessages).toBe(0);
    expect(result.current.scrollMode).toBe("at_bottom");
    expect(requestScrollToBottom).toHaveBeenLastCalledWith("jump-to-latest");
  });

  it("treats prepended older history as anchor-preserving pagination instead of a tail append", () => {
    const outerRef = {
      current: {
        scrollTop: 48,
        scrollHeight: 1500,
        clientHeight: 420,
      },
    } as React.RefObject<HTMLDivElement | null>;
    const requestScrollToBottom = vi.fn();
    const onLoadMore = vi.fn().mockResolvedValue(undefined);
    const onBeforeLoadMore = vi.fn();
    const onAfterPrepend = vi.fn();

    const existingSecond = makeMessage("msg-2", "2026-04-10T10:01:00.000Z");
    const existingThird = makeMessage("msg-3", "2026-04-10T10:02:00.000Z");

    const { result, rerender } = renderHook(
      ({ messages }: { messages: ReturnType<typeof makeMessage>[] }) =>
        useAutoScrollToBottom({
          conversationId: "room-1",
          messages,
          currentUserId: "user-a",
          hasMore: true,
          isLoadingMore: false,
          onLoadMore,
          onBeforeLoadMore,
          onAfterPrepend,
          outerRef,
          requestScrollToBottom,
        }),
      {
        initialProps: {
          messages: [existingSecond, existingThird],
        },
      },
    );

    act(() => {
      result.current.detachAutoFollow("reading-history");
      result.current.handleScroll(40);
    });

    expect(onBeforeLoadMore).toHaveBeenCalledTimes(1);
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender({
      messages: [
        makeMessage("msg-1", "2026-04-10T10:00:00.000Z"),
        existingSecond,
        existingThird,
      ],
    });

    expect(onAfterPrepend).toHaveBeenCalledTimes(1);
    expect(requestScrollToBottom).toHaveBeenCalledTimes(1);
    expect(requestScrollToBottom).toHaveBeenCalledWith("conversation-change");
  });
});
