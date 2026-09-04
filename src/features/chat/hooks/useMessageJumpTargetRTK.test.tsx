import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { messageApi } from "../../../services/api";
import { store } from "../../../store";
import { MessageStatus, MessageType } from "../../../types";
import type { Message } from "../../../types";
import { chatApi } from "../../api/chatApi";
import { useMessageJumpTargetRTK } from "./useMessageJumpTargetRTK";

const message = (id: string, seq: number): Message => ({
  id,
  conversationId: "conversation-1",
  senderId: "user-1",
  senderName: "User",
  content: id,
  type: MessageType.TEXT,
  status: MessageStatus.SENT,
  sendState: "sent",
  isEdited: false,
  isPinned: false,
  isDeleted: false,
  isSystem: false,
  createdAt: "2026-09-04T00:00:00.000Z" as unknown as Date,
  messageSeq: seq,
});

const success = <T,>(data: T) => ({ success: true as const, data });

const wrapper = ({ children }: { children: ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

describe("useMessageJumpTargetRTK", () => {
  beforeEach(() => {
    store.dispatch(chatApi.util.resetApiState());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("waits for the initial replace query before inserting an older search target", async () => {
    let resolveInitial!: (
      value: Awaited<ReturnType<typeof messageApi.getMessages>>,
    ) => void;
    const initialResponse = new Promise<
      Awaited<ReturnType<typeof messageApi.getMessages>>
    >((resolve) => {
      resolveInitial = resolve;
    });

    const getMessages = vi
      .spyOn(messageApi, "getMessages")
      .mockImplementation((_conversationId, options) => {
        const hasCursor = Boolean(
          options?.beforeId ||
            options?.afterId ||
            typeof options?.beforeSeq === "number" ||
            typeof options?.afterSeq === "number",
        );
        if (!hasCursor) return initialResponse;
        return Promise.resolve(
          success({ messages: [], hasMoreOlder: false, hasMoreNewer: false }),
        );
      });
    const getMessageById = vi
      .spyOn(messageApi, "getMessageById")
      .mockResolvedValue(success(message("target-message", 10)));

    const initialRequest = store.dispatch(
      chatApi.endpoints.getMessages.initiate({
        conversationId: "conversation-1",
        limit: 50,
      }),
    );
    await vi.waitFor(() => expect(getMessages).toHaveBeenCalledTimes(1));

    const { result, unmount } = renderHook(
      () => useMessageJumpTargetRTK("conversation-1"),
      { wrapper },
    );
    let jumpRequest!: ReturnType<
      typeof result.current.ensureMessageLoaded
    >;
    act(() => {
      jumpRequest = result.current.ensureMessageLoaded("target-message");
    });

    await Promise.resolve();
    expect(getMessageById).not.toHaveBeenCalled();

    resolveInitial(
      success({
        messages: [message("latest-message", 100)],
        hasMoreOlder: true,
        hasMoreNewer: false,
      }),
    );
    await initialRequest;
    await act(async () => {
      await jumpRequest;
    });

    const cache = chatApi.endpoints.getMessages.select({
      conversationId: "conversation-1",
    })(store.getState()).data;
    expect(cache?.messages.map((item) => item.id)).toEqual([
      "target-message",
      "latest-message",
    ]);
    expect(getMessageById).toHaveBeenCalledTimes(1);
    unmount();
  });
});
