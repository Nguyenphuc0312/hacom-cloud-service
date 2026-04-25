import { describe, expect, it, vi } from "vitest";

import {
  createChatRealtimeAdapter,
  normalizeMessageRealtimeEvent,
} from "./chatRealtimeAdapter";
import { applyMessagePatch } from "./applyMessagePatch";
import {
  hasMessageSequenceGap,
  needsSelfMessageIdentityResync,
} from "./resyncPolicy";

describe("chatRealtimeAdapter", () => {
  it("normalizes message.created events with client identity", () => {
    const event = normalizeMessageRealtimeEvent(
      {
        eventId: "evt-1",
        conversationId: "room-1",
        message: {
          id: "msg-1",
          clientMessageId: "client-1",
          localId: "temp-1",
          senderId: "user-1",
          serverSeq: 12,
          content: "hello",
        },
      },
      "message:new",
    );

    expect(event).toMatchObject({
      kind: "message.created",
      socketEvent: "message:new",
      conversationId: "room-1",
      messageId: "msg-1",
      eventId: "evt-1",
      clientMessageId: "client-1",
      localId: "temp-1",
      senderId: "user-1",
      incomingSeq: 12,
    });
  });

  it("dedupes the same realtime event key", () => {
    const adapter = createChatRealtimeAdapter();

    expect(adapter.shouldProcessEvent("evt-1")).toBe(true);
    expect(adapter.shouldProcessEvent("evt-1")).toBe(false);
  });

  it("patches message cache through the compatibility store boundary", () => {
    const ingestConversationMessageEvent = vi.fn(() => ({
      status: "merged" as const,
      canonicalMessage: null,
      mergedMessage: null,
      unreadDelta: 0,
    }));
    const event = normalizeMessageRealtimeEvent(
      {
        conversationId: "room-1",
        message: {
          id: "msg-1",
          clientMessageId: "client-1",
          content: "ack",
        },
      },
      "message:new",
    );

    expect(event).not.toBeNull();
    const result = applyMessagePatch(
      { ingestConversationMessageEvent },
      event!,
      { incrementUnread: false },
    );

    expect(result).toEqual({ applied: true, status: "merged" });
    expect(ingestConversationMessageEvent).toHaveBeenCalledWith(
      "room-1",
      expect.objectContaining({
        id: "msg-1",
        clientMessageId: "client-1",
      }),
      expect.objectContaining({
        incrementUnread: false,
        source: "message:new",
      }),
    );
  });

  it("flags scoped resync when message sequence has a gap", () => {
    const event = normalizeMessageRealtimeEvent(
      {
        conversationId: "room-1",
        message: {
          id: "msg-13",
          serverSeq: 13,
        },
      },
      "message:new",
    );

    expect(event).not.toBeNull();
    expect(
      hasMessageSequenceGap({
        event: event!,
        latestKnownSeq: 10,
      }),
    ).toBe(true);
  });

  it("flags self-authored events without client identity for scoped reconcile", () => {
    const event = normalizeMessageRealtimeEvent(
      {
        conversationId: "room-1",
        message: {
          id: "msg-1",
          senderId: "me",
        },
      },
      "message:new",
    );

    expect(event).not.toBeNull();
    expect(
      needsSelfMessageIdentityResync({
        event: event!,
        currentUserId: "me",
      }),
    ).toBe(true);
  });
});
