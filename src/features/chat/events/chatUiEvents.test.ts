import { describe, expect, it, vi } from "vitest";
import {
  dispatchFileSourceInvalidated,
  dispatchOpenConversation,
  listenForFileSourceInvalidated,
  listenForOpenConversation,
  dispatchStartDirectMessage,
  listenForStartDirectMessage,
  createChatRouteState,
  readChatRouteIntent,
} from "./chatUiEvents";

describe("chatUiEvents — open conversation / start DM (global search nav)", () => {
  it("delivers conversationId + messageId to listeners synchronously", () => {
    const handler = vi.fn();
    const off = listenForOpenConversation(handler);

    dispatchOpenConversation({ conversationId: "c1", messageId: "m1" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      conversationId: "c1",
      messageId: "m1",
    });
    off();
  });

  it("stops delivering after unsubscribe", () => {
    const handler = vi.fn();
    const off = listenForOpenConversation(handler);
    off();
    dispatchOpenConversation({ conversationId: "c2" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("delivers userId for start-direct-message (person result click)", () => {
    const handler = vi.fn();
    const off = listenForStartDirectMessage(handler);
    dispatchStartDirectMessage({ userId: "u1" });
    expect(handler).toHaveBeenCalledWith({ userId: "u1" });
    off();
  });

  it("delivers scoped file-source invalidation to active views", () => {
    const handler = vi.fn();
    const off = listenForFileSourceInvalidated(handler);

    dispatchFileSourceInvalidated({
      conversationId: "c1",
      reason: "membership-lost",
    });

    expect(handler).toHaveBeenCalledWith({
      conversationId: "c1",
      reason: "membership-lost",
    });
    off();
  });

  it("round-trips durable chat route intents and rejects malformed history state", () => {
    const open = createChatRouteState({
      type: "open-conversation",
      conversationId: "c1",
      messageId: "m1",
    });
    const direct = createChatRouteState({
      type: "start-direct-message",
      userId: "u1",
    });

    expect(readChatRouteIntent(open)).toMatchObject({
      type: "open-conversation",
      conversationId: "c1",
      messageId: "m1",
    });
    expect(readChatRouteIntent(direct)).toMatchObject({
      type: "start-direct-message",
      userId: "u1",
    });
    expect(open.chatIntent.requestId).not.toBe(direct.chatIntent.requestId);
    expect(
      readChatRouteIntent({ chatIntent: { type: "open-conversation" } }),
    ).toBeNull();
  });
});
