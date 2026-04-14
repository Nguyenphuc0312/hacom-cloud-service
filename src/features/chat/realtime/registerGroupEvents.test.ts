import { describe, expect, it, vi } from "vitest";
import { WebSocketEvents } from "../../../lib/socket";
import { registerGroupEvents } from "./registerGroupEvents";

describe("registerGroupEvents", () => {
  it("registers canonical member removal handler", () => {
    const on = vi.fn(() => vi.fn());
    const socket = { on, off: vi.fn() };
    const onGroupMemberRemoved = vi.fn();

    const unsubscribe = registerGroupEvents(socket, {
      onGroupMemberRemoved,
    });

    expect(on).toHaveBeenCalledWith(
      WebSocketEvents.GROUP_MEMBER_REMOVED,
      onGroupMemberRemoved,
    );

    unsubscribe();
  });
});
