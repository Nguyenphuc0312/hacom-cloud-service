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
});
