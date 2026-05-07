import { describe, expect, it, vi } from "vitest";
import { WebSocketEvents } from "../../../lib/socket";
import { registerConversationEvents } from "./registerConversationEvents";

describe("registerConversationEvents", () => {
  it("registers canonical summary and membership handlers", () => {
    const on = vi.fn(() => vi.fn());
    const socket = { on, off: vi.fn() };
    const onConversationSummaryUpdated = vi.fn();
    const onConversationMembershipUpdated = vi.fn();

    const unsubscribe = registerConversationEvents(socket, {
      onConversationSummaryUpdated,
      onConversationMembershipUpdated,
    });

    expect(on).toHaveBeenCalledWith(
      WebSocketEvents.CONVERSATION_SUMMARY_UPDATED,
      onConversationSummaryUpdated,
    );
    expect(on).toHaveBeenCalledWith(
      WebSocketEvents.CONVERSATION_MEMBERSHIP_UPDATED,
      onConversationMembershipUpdated,
    );

    unsubscribe();
  });

  it("wires room alias events to the canonical conversation handlers", () => {
    const on = vi.fn(() => vi.fn());
    const socket = { on, off: vi.fn() };
    const onConversationJoined = vi.fn();
    const onConversationLeft = vi.fn();

    registerConversationEvents(socket, {
      onConversationJoined,
      onConversationLeft,
    });

    expect(on).toHaveBeenCalledWith(
      WebSocketEvents.CONVERSATION_JOINED,
      onConversationJoined,
    );
    expect(on).toHaveBeenCalledWith(
      WebSocketEvents.ROOM_JOINED,
      onConversationJoined,
    );
    expect(on).toHaveBeenCalledWith(
      WebSocketEvents.CONVERSATION_LEFT,
      onConversationLeft,
    );
    expect(on).toHaveBeenCalledWith(
      WebSocketEvents.ROOM_LEFT,
      onConversationLeft,
    );
  });

  it("wires canonical and legacy read events to the read handler", () => {
    const on = vi.fn(() => vi.fn());
    const socket = { on, off: vi.fn() };
    const onMessageRead = vi.fn();

    registerConversationEvents(socket, {
      onMessageRead,
    });

    expect(on).toHaveBeenCalledWith(
      WebSocketEvents.CONVERSATION_READ_ADVANCED,
      onMessageRead,
    );
    expect(on).toHaveBeenCalledWith(
      WebSocketEvents.MESSAGE_READ,
      onMessageRead,
    );
  });
});
