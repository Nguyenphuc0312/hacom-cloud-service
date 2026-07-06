import { describe, expect, it, vi } from "vitest";
import {
  dispatchOpenConversation,
  listenForOpenConversation,
  dispatchStartDirectMessage,
  listenForStartDirectMessage,
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
});
