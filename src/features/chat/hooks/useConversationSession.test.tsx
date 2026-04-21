import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "../../../stores/authStore";
import { useChatStore } from "../../../stores/chatStore";
import type { Conversation } from "../../../types";
import { useConversationSession } from "./useConversationSession";

const makeConversation = (
  overrides: Partial<Conversation> = {},
): Conversation =>
  ({
    id: "room-2",
    type: "group",
    name: "Room 2",
    unreadCount: 0,
    membershipState: "active",
    memberCount: 2,
    summaryVersion: 1,
    lastMessage: null,
    lastActivityAt: "2026-04-10T09:00:00.000Z",
    updatedAt: "2026-04-10T09:00:00.000Z",
    createdAt: "2026-04-10T09:00:00.000Z",
    participants: [],
    ...overrides,
  }) as Conversation;

describe("useConversationSession", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useAuthStore.setState({
      user: {
        id: "user-a",
        username: "alice",
        status: "online",
      },
      isAuthenticated: true,
      isInitialized: true,
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips unread bootstrap and triggers authoritative open fetch", async () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-1",
        unreadCount: 3,
      }),
    ]);
    useChatStore.getState().selectConversation("room-1");

    const fetchMessages = vi.fn().mockResolvedValue({
      loaded: 20,
      hasMore: true,
      hasNext: false,
      hasPrev: true,
      mode: "initial",
      applied: true,
    });

    renderHook(() =>
      useConversationSession({
        routeConversationId: "room-1",
        selectedConversationId: "room-1",
        selectedConversation: makeConversation({
          id: "room-1",
          unreadCount: 3,
        }),
        isSelectedDirectConversation: false,
        otherUser: null,
        connectionState: "connected",
        isValidatingRoom: false,
        lastValidatedConversationId: "room-1",
        messageCount: 0,
        fetchMessages,
        markAsRead: vi.fn().mockResolvedValue(undefined),
        joinConversation: vi.fn(),
        leaveConversation: vi.fn(),
        stopTyping: vi.fn(),
        sendTyping: vi.fn(),
        updateConversation: useChatStore.getState().updateConversation,
      }),
    );

    await waitFor(() =>
      expect(fetchMessages).toHaveBeenCalledWith(
        "room-1",
        undefined,
        undefined,
        expect.objectContaining({
          source: "initial_fetch",
          queryType: "authoritative_open",
          selectedConversationIdAtDispatch: "room-1",
        }),
      ),
    );
  });

  it("prefetches adjacent rooms with partial provenance only", async () => {
    vi.useFakeTimers();
    const store = useChatStore.getState();
    store.setConversations([
      makeConversation({
        id: "room-1",
      }),
      makeConversation({
        id: "room-2",
      }),
      makeConversation({
        id: "room-3",
      }),
    ]);
    store.selectConversation("room-2");

    const prefetchFetchMessages = vi.fn().mockResolvedValue({
      loaded: 20,
      hasMore: true,
      hasNext: false,
      hasPrev: true,
      mode: "initial",
      applied: true,
    });
    useChatStore.setState({
      fetchMessages: prefetchFetchMessages as typeof store.fetchMessages,
    });

    renderHook(() =>
      useConversationSession({
        routeConversationId: "room-2",
        selectedConversationId: "room-2",
        selectedConversation: makeConversation({
          id: "room-2",
        }),
        isSelectedDirectConversation: false,
        otherUser: null,
        connectionState: "connected",
        isValidatingRoom: false,
        lastValidatedConversationId: "room-2",
        messageCount: 0,
        fetchMessages: vi.fn().mockResolvedValue({
          loaded: 0,
          hasMore: false,
          hasNext: false,
          hasPrev: false,
          mode: "initial",
          applied: false,
        }),
        markAsRead: vi.fn().mockResolvedValue(undefined),
        joinConversation: vi.fn(),
        leaveConversation: vi.fn(),
        stopTyping: vi.fn(),
        sendTyping: vi.fn(),
        updateConversation: useChatStore.getState().updateConversation,
      }),
    );

    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();
    expect(prefetchFetchMessages).toHaveBeenCalledTimes(2);
    const prefetchedRooms = prefetchFetchMessages.mock.calls.map(
      (call) => call[0],
    );
    expect(prefetchedRooms).toEqual(expect.arrayContaining(["room-1", "room-3"]));
    prefetchFetchMessages.mock.calls.forEach((call) => {
      expect(call).toEqual([
        expect.any(String),
        undefined,
        undefined,
        expect.objectContaining({
          limit: 20,
          source: "prefetch_adjacent",
          queryType: "prefetch",
          selectedConversationIdAtDispatch: "room-2",
        }),
      ]);
    });
  });
});
