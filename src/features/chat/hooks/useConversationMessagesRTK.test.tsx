import React from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chatApi } from "../../api/chatApi";
import { MessageStatus, MessageType, type Message } from "../../../types";
import { useConversationMessagesRTK } from "./useConversationMessagesRTK";

const apiMocks = vi.hoisted(() => ({
  getMessages: vi.fn(),
}));

vi.mock("../../../services/api", () => ({
  conversationApi: {
    getConversationById: vi.fn(),
    getConversations: vi.fn(),
    getUnreadSummary: vi.fn(),
    markAsRead: vi.fn(),
  },
  messageApi: {
    addReaction: vi.fn(),
    deleteMessage: vi.fn(),
    editMessage: vi.fn(),
    getMessageById: vi.fn(),
    getMessages: apiMocks.getMessages,
    removeReaction: vi.fn(),
    searchMessages: vi.fn(),
    sendMessage: vi.fn(),
  },
}));

const apiSuccess = <T,>(data: T, meta?: Record<string, unknown>) => ({
  success: true as const,
  data,
  ...(meta ? { meta } : {}),
});

const makeMessage = (id: string, serverSeq: number): Message =>
  ({
    id,
    conversationId: "room-1",
    senderId: "user-2",
    senderName: "Bob",
    content: id,
    type: MessageType.TEXT,
    status: MessageStatus.SENT,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, serverSeq)),
    serverSeq,
    isEdited: false,
    isPinned: false,
    isDeleted: false,
    isSystem: false,
  }) as Message;

const createStore = () =>
  configureStore({
    reducer: {
      [chatApi.reducerPath]: chatApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(chatApi.middleware),
  });

describe("useConversationMessagesRTK", () => {
  beforeEach(() => {
    apiMocks.getMessages.mockReset();
  });

  it("loads the active RTKQ message timeline and prepends older pages through the same cache", async () => {
    apiMocks.getMessages
      .mockResolvedValueOnce(
        apiSuccess([makeMessage("msg-50", 50), makeMessage("msg-51", 51)], {
          hasPrev: true,
          hasNext: false,
        }),
      )
      .mockResolvedValueOnce(
        apiSuccess([makeMessage("msg-48", 48), makeMessage("msg-49", 49)], {
          hasPrev: false,
          hasNext: false,
        }),
      );

    const store = createStore();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    const { result } = renderHook(
      () => useConversationMessagesRTK("room-1"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.hasLoaded).toBe(true);
      expect(result.current.messages.map((message) => message.id)).toEqual([
        "msg-50",
        "msg-51",
      ]);
    });

    await act(async () => {
      await result.current.loadOlder();
    });

    await waitFor(() => {
      expect(result.current.messages.map((message) => message.id)).toEqual([
        "msg-48",
        "msg-49",
        "msg-50",
        "msg-51",
      ]);
      expect(result.current.hasMoreOlder).toBe(false);
    });
    expect(apiMocks.getMessages).toHaveBeenLastCalledWith("room-1", {
      limit: 50,
      beforeId: undefined,
      afterId: undefined,
      beforeSeq: 50,
      afterSeq: undefined,
    });
  });

  it("does not fetch when no active conversation id is available", () => {
    const store = createStore();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );

    const { result } = renderHook(() => useConversationMessagesRTK(""), {
      wrapper,
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.hasLoaded).toBe(false);
    expect(apiMocks.getMessages).not.toHaveBeenCalled();
  });
});
