import * as React from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useAutoScrollToBottom } from "./useAutoScrollToBottom";
import { MessageStatus, MessageType } from "../types";

const makeMessage = (id: string, createdAt: string) => ({
  id,
  conversationId: "room-1",
  senderId: "user-a",
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
      itemKey: "message-msg-2",
      offsetWithinItem: 24,
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
      itemKey: "message-msg-2",
      offsetWithinItem: 24,
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
      itemKey: "message-msg-2",
      offsetWithinItem: 12,
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
});
