import * as React from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useAutoScrollToBottom } from "./useAutoScrollToBottom";
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
  it("restores saved anchor instead of raw pixel offset when re-entering a conversation", () => {
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
  });

  it("prioritizes unread anchor over saved session when reopening a conversation with unread messages", () => {
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
    expect(result.current.isPinnedToBottom).toBe(false);
    expect(result.current.scrollMode).toBe("reading_history");
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
    expect(requestScrollToBottom).not.toHaveBeenCalled();
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
});
