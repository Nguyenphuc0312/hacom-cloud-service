import { describe, expect, it, vi } from "vitest";
import { registerChatEvents } from "./registerChatEvents";

interface RegisteredHandler {
  eventName: string;
  handler: (payload: unknown) => void;
}

describe("registerChatEvents", () => {
  it("registers canonical message realtime events", () => {
    const registered: RegisteredHandler[] = [];

    const socket = {
      on: (eventName: string, handler: (payload: unknown) => void) => {
        registered.push({ eventName, handler });
      },
      off: vi.fn(),
    };

    const noop = vi.fn();
    const unsubscribe = registerChatEvents(socket, {
      onMessageNew: noop,
      onMessageUpdated: noop,
      onMessageDeleted: noop,
    });

    expect(registered.map((row) => row.eventName)).toEqual(
      expect.arrayContaining([
        "message:new",
        "message:updated",
        "message:deleted",
      ]),
    );
    expect(registered.map((row) => row.eventName)).not.toContain(
      "message:update",
    );
    expect(registered.map((row) => row.eventName)).not.toContain(
      "message:delete",
    );

    unsubscribe();

    expect(socket.off).toHaveBeenCalledTimes(3);
  });
});
