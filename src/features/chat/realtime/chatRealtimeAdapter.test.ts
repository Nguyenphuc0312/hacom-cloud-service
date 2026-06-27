import { describe, expect, it } from "vitest";
import { normalizeMessageRealtimeEvent } from "./chatRealtimeAdapter";

const basePayload = (message: Record<string, unknown>) => ({
  event: "message:new",
  data: {
    conversationId: "conv-1",
    message: {
      id: "msg-1",
      content: "hello",
      type: "text",
      ...message,
    },
  },
});

describe("normalizeMessageRealtimeEvent", () => {
  it("normalizes senderId from camelCase senderId", () => {
    const event = normalizeMessageRealtimeEvent(
      basePayload({ senderId: "user-b" }).data,
      "message:new",
    );

    expect(event?.senderId).toBe("user-b");
  });

  it("normalizes senderId from snake_case sender_id", () => {
    const event = normalizeMessageRealtimeEvent(
      basePayload({ sender_id: "user-b" }).data,
      "message:new",
    );

    expect(event?.senderId).toBe("user-b");
  });

  it("normalizes senderId from nested sender.id", () => {
    const event = normalizeMessageRealtimeEvent(
      basePayload({ sender: { id: "user-b", name: "User B" } }).data,
      "message:new",
    );

    expect(event?.senderId).toBe("user-b");
  });

  it("does not use payload userId as senderId", () => {
    const event = normalizeMessageRealtimeEvent(
      {
        conversationId: "conv-1",
        userId: "current-user",
        message: {
          id: "msg-1",
          content: "hello",
          type: "text",
          sender: { id: "user-b" },
        },
      },
      "message:new",
    );

    expect(event?.senderId).toBe("user-b");
  });

  it("normalizes canonical roomId payloads to conversationId", () => {
    const event = normalizeMessageRealtimeEvent(
      {
        roomId: "conv-1",
        message: {
          id: "msg-1",
          roomId: "conv-1",
          content: "hello",
          type: "text",
          senderId: "user-b",
        },
      },
      "message:new",
    );

    expect(event?.conversationId).toBe("conv-1");
  });
});
